// ==========================================================================
// Centralized API Client (front/api.js)
// ==========================================================================

import { requestJson, getAdminToken, clearAdminToken } from "./common/utils.js";

let authExpiredHandler = null;

/**
 * 注册全局 Token 过期 (401) 拦截回调
 * @param {Function} handler
 */
export function onAuthExpired(handler) {
  authExpiredHandler = handler;
}

/**
 * 内部受保护接口请求封装（自动附加 Bearer Token 与 401 拦截）
 */
async function authRequest(path, options = {}) {
  const token = getAdminToken();
  try {
    return await requestJson(path, { token, ...options });
  } catch (error) {
    if (error.code === "TOKEN_EXPIRED" || error.status === 401) {
      clearAdminToken();
      if (typeof authExpiredHandler === "function") {
        authExpiredHandler(error);
      }
    }
    throw error;
  }
}

/**
 * 统一后端 API 客户端
 */
export const api = {
  // Codex 额度接口
  quotas: {
    refresh() {
      return requestJson("/api/quotas/refresh", { method: "POST" });
    }
  },

  // 安全管理与 Fail2ban 接口
  admin: {
    verify(password) {
      return requestJson("/api/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password })
      });
    },

    getStatus() {
      return authRequest("/api/admin/fail2ban/status");
    },

    getIpStats(run = false) {
      const path = run ? "/api/admin/ip-stats/run" : "/api/admin/ip-stats/latest";
      const method = run ? "POST" : "GET";
      return authRequest(path, { method });
    },

    banIp(ip) {
      return authRequest("/api/admin/fail2ban/ban", {
        method: "POST",
        body: JSON.stringify({ ip })
      });
    },

    unbanIp(ip) {
      return authRequest("/api/admin/fail2ban/unban", {
        method: "POST",
        body: JSON.stringify({ ip })
      });
    },

    unbanAll() {
      return authRequest("/api/admin/fail2ban/unban-all", {
        method: "POST"
      });
    }
  }
};
