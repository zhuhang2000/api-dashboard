// ==========================================================================
// HTML Template Loader (front/common/template.js)
// ==========================================================================

/**
 * 异步加载 HTML 模板纯文本内容 (供 Vue 挂载)
 * @param {string|URL} path 模板文件 URL 路径
 * @returns {Promise<string>}
 */
export async function loadHtmlText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load template from ${path}`);
  }
  return await res.text();
}
