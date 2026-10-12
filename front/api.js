// ==========================================================================
// Centralized API Client (front/api.js)
// ==========================================================================

import { reactive } from "vue";

const TOKEN_STORAGE_KEY = "dashboard_admin_token";

/**
 * 全局管理员认证状态（单例，组件直接读取即可响应式更新）
 * - token 为空即视为未登录
 * - expiredReason 记录凭证被动失效（401）的原因，主动登录 / 锁定时清空
 */
export const auth = reactive({
  token: sessionStorage.getItem(TOKEN_STORAGE_KEY) || "",
  expiredReason: ""
});

export function login(token) {
  auth.token = token;
  auth.expiredReason = "";
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function logout(expiredReason = "") {
  auth.token = "";
  auth.expiredReason = expiredReason;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * 统一的 JSON API 请求封装
 * @param {string} path API 路由路径
 * @param {object} [options] 请求配置
 * @param {string} [options.token] 可选的 Bearer Token
 * @returns {Promise<any>}
 */
async function requestJson(path, options = {}) {
  const { token, headers = {}, ...restOptions } = options;
  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers
  };
  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...restOptions,
    headers: requestHeaders
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

/**
 * 受保护接口请求封装（自动附加 Bearer Token；401 时清除凭证并记录失效原因）
 */
async function authRequest(path, options = {}) {
  try {
    return await requestJson(path, { token: auth.token, ...options });
  } catch (error) {
    if (error.code === "TOKEN_EXPIRED" || error.status === 401) {
      logout(error.message || "登录已过期，请重新验证");
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
