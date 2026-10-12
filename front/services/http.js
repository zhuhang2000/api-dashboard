// ==========================================================================
// HTTP Request Core (front/services/http.js)
// ==========================================================================

import { auth, logout } from "./auth.js";

/**
 * 统一的 JSON API 请求封装
 * @param {string} path API 路由路径
 * @param {object} [options] 请求配置
 * @param {string} [options.token] 可选的 Bearer Token
 * @returns {Promise<any>}
 */
export async function requestJson(path, options = {}) {
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
 * @param {string} path API 路由路径
 * @param {object} [options] 请求配置
 * @returns {Promise<any>}
 */
export async function authRequest(path, options = {}) {
  try {
    return await requestJson(path, { token: auth.token, ...options });
  } catch (error) {
    if (error.code === "TOKEN_EXPIRED" || error.status === 401) {
      logout(error.message || "登录已过期，请重新验证");
    }
    throw error;
  }
}
