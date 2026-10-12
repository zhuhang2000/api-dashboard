// ==========================================================================
// Front-end Shared Utility Helpers
// 仅收录被多个视图共同使用的函数；单一视图专用的逻辑放在各自组件文件内
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
 * 异步加载组件 HTML 模板纯文本内容 (供 Vue 挂载)
 * @param {string|URL} path 模板文件 URL，建议传 new URL("./x.html", import.meta.url)
 * @returns {Promise<string>}
 */
export async function loadHtmlText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load template from ${path}`);
  }
  return await res.text();
}
