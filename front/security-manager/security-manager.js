// ==========================================================================
// SecurityView Component (front/security-manager/security-manager.js)
// ==========================================================================

import { reactive, computed, watch, onMounted } from "vue";
import { adminApi } from "../services/admin.js";
import { auth, login, logout } from "../services/auth.js";
import {
  showToast,
  formatDateTime,
  formatStatsSpan,
  copyTextWithToast,
  loadHtmlText
} from "../common/utils.js";

const template = await loadHtmlText("/security-manager/security-manager.html");

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

    const statsSpanText = computed(() => formatStatsSpan(state.ipStats));

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

    function copyIp(ip) {
      copyTextWithToast(ip, `已复制 IP: ${ip}`);
    }

    // ------------------------------------------------------------------------
    // 后端 API 请求交互 (统一使用 adminApi 客户端)
    // ------------------------------------------------------------------------
    async function handleAuthSubmit() {
      const pwd = state.authPasswordInput.trim();
      if (!pwd) return;
      state.authSubmitting = true;
      state.authError = "";
      try {
        await adminApi.verify(pwd);
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
        const data = await adminApi.getStatus();
        Object.assign(state, data);
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function fetchIpStats(run = false) {
      state.statsLoading = true;
      try {
        const data = await adminApi.getIpStats(run);
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
        const res = await adminApi.banIp(target);
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
        const res = await adminApi.unbanIp(target);
        if (res.status) Object.assign(state, res.status);
        showToast(`已成功解封 IP: ${target}`, "success");
      } catch (error) {
        showToast(error.message || "解封失败", "error");
      }
    }

    async function unbanAll() {
      if (!confirm("⚠️ 确定要一键解封所有规则下的 IP 吗？该操作将清除所有当前的封禁拦截。")) return;
      try {
        const res = await adminApi.unbanAll();
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
