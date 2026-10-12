// ==========================================================================
// Clipboard Helpers (front/common/clipboard.js)
// ==========================================================================

import { showToast } from "./toast.js";

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
