// ==========================================================================
// Front-end Shared Utility Helpers
// ==========================================================================

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
 * 异步加载并解析 HTML 模板文档
 * @param {string} path 模板文件 URL 路径
 * @returns {Promise<Document>}
 */
export async function loadHtmlTemplate(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load template from ${path}`);
  }
  const html = await res.text();
  return new DOMParser().parseFromString(html, "text/html");
}

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
