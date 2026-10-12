// ==========================================================================
// Codex Quota Display Formatters (front/dashboard/format.js)
// ==========================================================================

import { formatDateTime } from "../common/datetime.js";

/**
 * 格式化 Codex 账号套餐显示
 * @param {string} rawPlan 原始套餐名称
 * @returns {string} 首字母大写的格式化名称
 */
export function formatPlan(rawPlan) {
  const plan = rawPlan || "CODEX";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

/**
 * 格式化限额时间窗口中文标签
 * @param {string} label 原始标签 (5h / Weekly)
 * @returns {string} 中文标签说明
 */
export function formatQuotaLabel(label) {
  if (label === "5h") return "5 小时限额";
  if (label === "Weekly") return "周限额";
  return label || "";
}

/**
 * 格式化限额重置时间
 * @param {number|string|Date} resetAt 时间戳
 * @returns {string}
 */
export function formatReset(resetAt) {
  return resetAt ? formatDateTime(new Date(resetAt)) : "-";
}

/**
 * 计算剩余百分比的风险样式等级
 * @param {number} value 剩余百分比数值
 * @returns {"danger"|"low"|""}
 */
export function percentClass(value) {
  const num = Math.round(value ?? 0);
  if (num < 15) return "danger";
  if (num < 35) return "low";
  return "";
}
