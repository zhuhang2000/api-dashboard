// ==========================================================================
// SecurityView Component (front/security-manager/security-manager.js)
// ==========================================================================

import { reactive, computed, watch, onMounted } from "vue";
import { api, auth, login, logout } from "../api.js";
import { formatDateTime, loadHtmlText } from "../common/utils.js";

const template = await loadHtmlText(new URL("./security-manager.html", import.meta.url));

/**
 * 显示浮动提示通知
 * @param {string} message 提示信息文本
 * @param {'success'|'error'} [type='success'] 提示类型
 * @param {number} [duration=3000] 显示时长（毫秒）
 */
function showToast(message, type = "success", duration = 3000) {
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

async function copyToClipboard(text) {
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

export const SecurityView = {
  name: "SecurityView",
  template,
  emits: ["back-to-dashboard"],
  setup(props, { emit }) {
    const state = reactive({
      authPasswordInput: "",
      authSubmitting: false,
      authError: "",
      banInput: "",
      jail: "cliproxy-401",
      currentlyBanned: 0,
      totalBanned: 0,
      totalFailed: 0,
      bannedIps: [],
      updatedAt: null,
      ipStats: null,
      statsLoading: false
    });

    const bannedSet = computed(() => new Set(state.bannedIps || []));
    const isIpBanned = (ip) => bannedSet.value.has(ip);

    const formatSyncTime = computed(() => {
      return state.updatedAt
        ? formatDateTime(state.updatedAt, { includeSeconds: true })
        : "未同步";
    });

    const statsSpanText = computed(() => {
      const stats = state.ipStats;
      if (!stats) return "未运行统计";
      return `区间: ${stats.timeSpan || "全量日志"} | 更新于: ${formatDateTime(stats.updatedAt, { includeSeconds: true })}`;
    });

    // 凭证被动失效（401）：auth.token 已被清空，弹窗随之出现，这里补充提示
    watch(() => auth.expiredReason, (reason) => {
      if (!reason) return;
      state.authError = reason;
      showToast("登录凭证已失效", "error");
    });

    function handleBack() {
      emit("back-to-dashboard");
    }

    function handleLock() {
      logout();
      showToast("控制台已锁定", "success");
      emit("back-to-dashboard");
    }

    async function copyIp(ip) {
      try {
        await copyToClipboard(ip);
        showToast(`已复制 IP: ${ip}`, "success");
      } catch {
        showToast("复制失败", "error");
      }
    }

    // ------------------------------------------------------------------------
    // 后端 API 请求交互 (统一使用 api.admin 客户端)
    // ------------------------------------------------------------------------
    async function handleAuthSubmit() {
      const pwd = state.authPasswordInput.trim();
      if (!pwd) return;
      state.authSubmitting = true;
      state.authError = "";
      try {
        await api.admin.verify(pwd);
        login(pwd);
        state.authPasswordInput = "";
        showToast("解锁成功，已进入控制台", "success");
        initData();
      } catch (error) {
        state.authError = error.message || "MANAGEMENT_KEY 凭证错误";
      } finally {
        state.authSubmitting = false;
      }
    }

    async function fetchStatus() {
      try {
        const data = await api.admin.getStatus();
        Object.assign(state, data);
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function fetchIpStats(run = false) {
      state.statsLoading = true;
      try {
        const data = await api.admin.getIpStats(run);
        if (data?.items) {
          state.ipStats = data;
          if (run) showToast("IP 频次统计分析完成", "success");
        }
      } catch (error) {
        if (run) showToast(error.message || "执行统计失败", "error");
      } finally {
        state.statsLoading = false;
      }
    }

    async function banIp(ip) {
      const target = String(ip || "").trim();
      if (!target) return showToast("请输入需要封禁的 IP 地址", "error");
      try {
        const res = await api.admin.banIp(target);
        if (res.status) Object.assign(state, res.status);
        showToast(`已成功封禁 IP: ${target}`, "success");
      } catch (error) {
        showToast(error.message || "封禁失败", "error");
      }
    }

    function handleBanSubmit() {
      if (state.banInput) {
        banIp(state.banInput);
        state.banInput = "";
      }
    }

    async function unbanIp(ip) {
      const target = String(ip || "").trim();
      if (!confirm(`确定要解封 IP: ${target} 吗？`)) return;
      try {
        const res = await api.admin.unbanIp(target);
        if (res.status) Object.assign(state, res.status);
        showToast(`已成功解封 IP: ${target}`, "success");
      } catch (error) {
        showToast(error.message || "解封失败", "error");
      }
    }

    async function unbanAll() {
      if (!confirm("⚠️ 确定要一键解封所有规则下的 IP 吗？该操作将清除所有当前的封禁拦截。")) return;
      try {
        const res = await api.admin.unbanAll();
        if (res.status) Object.assign(state, res.status);
        showToast("已成功解封所有 IP", "success");
      } catch (error) {
        showToast(error.message || "一键解封失败", "error");
      }
    }

    function initData() {
      if (auth.token) {
        fetchStatus();
        fetchIpStats(false);
      }
    }

    onMounted(() => {
      initData();
    });

    return {
      state,
      auth,
      isIpBanned,
      formatSyncTime,
      formatStatsSpan: statsSpanText,
      handleBack,
      handleLock,
      handleAuthSubmit,
      fetchStatus,
      fetchIpStats,
      banIp,
      handleBanSubmit,
      unbanIp,
      unbanAll,
      copyIp
    };
  }
};
