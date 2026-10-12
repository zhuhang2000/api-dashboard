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
 * 统一的 JSON API 请求封装：成功返回响应数据；失败抛出 Error，message 为可直接展示的中文提示
 * @param {string} path API 路由路径
 * @param {object} [options] fetch 配置，额外支持 token（Bearer Token）
 * @returns {Promise<any>}
 */
async function requestJson(path, { token, ...options } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("网络连接失败，请检查网络后重试");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `请求失败（HTTP ${response.status}）`);
    error.code = payload?.code;
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
      logout(error.message);
    }
    throw error;
  }
}

/**
 * 统一后端 API 客户端：分组与后端服务一一对应（quotas / admin / fail2ban / ipStats）
 */
export const api = {
  quotas: {
    refresh() {
      return requestJson("/api/quotas/refresh", { method: "POST" });
    }
  },

  admin: {
    verify(password) {
      return requestJson("/api/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password })
      });
    }
  },

  // 写操作返回最新状态，结构与 status() 一致
  fail2ban: {
    status() {
      return authRequest("/api/admin/fail2ban/status");
    },

    ban(ip) {
      return authRequest("/api/admin/fail2ban/ban", {
        method: "POST",
        body: JSON.stringify({ ip })
      });
    },

    unban(ip) {
      return authRequest("/api/admin/fail2ban/unban", {
        method: "POST",
        body: JSON.stringify({ ip })
      });
    },

    unbanAll() {
      return authRequest("/api/admin/fail2ban/unban-all", { method: "POST" });
    }
  },

  // 从未运行过统计时 latest() 返回 null
  ipStats: {
    latest() {
      return authRequest("/api/admin/ip-stats/latest");
    },

    run() {
      return authRequest("/api/admin/ip-stats/run", { method: "POST" });
    }
  }
};
