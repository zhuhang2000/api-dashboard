// ==========================================================================
// Front-end Shared Toast Notification Component
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
