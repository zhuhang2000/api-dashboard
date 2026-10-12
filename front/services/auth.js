// ==========================================================================
// Admin Auth State (front/services/auth.js)
// ==========================================================================

import { reactive } from "vue";

const TOKEN_STORAGE_KEY = "dashboard_admin_token";

/**
 * 全局管理员认证状态（单例，任何组件直接读取即可响应式更新）
 * - token 为空即视为未登录
 * - expiredReason 记录凭证被动失效（401）的原因，主动登录 / 锁定时清空
 */
export const auth = reactive({
  token: sessionStorage.getItem(TOKEN_STORAGE_KEY) || "",
  expiredReason: ""
});

/**
 * 写入管理员 Bearer 凭证
 * @param {string} token
 */
export function login(token) {
  auth.token = token;
  auth.expiredReason = "";
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/**
 * 清除管理员凭证
 * @param {string} [expiredReason] 被动失效原因；主动锁定时留空
 */
export function logout(expiredReason = "") {
  auth.token = "";
  auth.expiredReason = expiredReason;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
