// ==========================================================================
// Front-end Shared Utility Helpers
// ==========================================================================

/**
 * 显示全局浮动提示通知
 * @param {string} message 提示信息文本
 * @param {'success'|'error'} [type='success'] 提示类型
 * @param {number} [duration=3000] 显示时长（毫秒）
 */
export function showToast(message, type = "success", duration = 3000) {
  const existing = document.querySelector(".sec-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `sec-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/**
 * 格式化日期时间
 * @param {string|number|Date} value 输入的时间值
 * @param {object} [options] 配置项
 * @param {boolean} [options.includeSeconds=false] 是否包含秒数
 * @returns {string} 格式化后的字符串 (MM/DD HH:mm 或 MM/DD HH:mm:ss)
 */
export function formatDateTime(value, { includeSeconds = false } = {}) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  if (includeSeconds) {
    const second = pad(date.getSeconds());
    return `${month}/${day} ${hour}:${minute}:${second}`;
  }
  return `${month}/${day} ${hour}:${minute}`;
}

/**
 * 异步加载 HTML 模板纯文本内容 (供 Vue 挂载)
 * @param {string} path 模板文件 URL 路径
 * @returns {Promise<string>}
 */
export async function loadHtmlText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load template from ${path}`);
  }
  return await res.text();
}

/**
 * 异步加载并解析 HTML 模板文档 (兼容原生 DOM 解析)
 * @param {string} path 模板文件 URL 路径
 * @returns {Promise<Document>}
 */
export async function loadHtmlTemplate(path) {
  const html = await loadHtmlText(path);
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * 复制文本到剪贴板
 * @param {string} text 欲复制的文本
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

/**
 * 复制文本并弹出 Toast 提示
 * @param {string} text 复制内容
 * @param {string} [successMsg] 成功提示信息
 */
export async function copyTextWithToast(text, successMsg = "") {
  try {
    await copyToClipboard(text);
    showToast(successMsg || `已复制: ${text}`, "success");
  } catch {
    showToast("复制失败", "error");
  }
}

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
export const formatLabel = formatQuotaLabel;

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

/**
 * 格式化 IP 请求频次分析的区间与时间说明
 * @param {object} ipStats 统计结果对象
 * @returns {string}
 */
export function formatStatsSpan(ipStats) {
  if (!ipStats) return "未运行统计";
  return `区间: ${ipStats.timeSpan || "全量日志"} | 更新于: ${formatDateTime(ipStats.updatedAt, { includeSeconds: true })}`;
}
