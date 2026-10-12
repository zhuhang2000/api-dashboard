// ==========================================================================
// DashboardView Component (front/dashboard/dashboard.js)
// ==========================================================================

import { reactive, computed, onMounted } from "vue";
import { api } from "../api.js";
import { formatDateTime, loadHtmlText } from "../common/utils.js";

const template = await loadHtmlText(new URL("./dashboard.html", import.meta.url));

// --------------------------------------------------------------------------
// 数据转换：接口账户数据 → 模板直接可用的展示数据
// （额度分级 level 由后端统一判定，这里只做展示文本转换）
// --------------------------------------------------------------------------
const QUOTA_LABELS = { "5h": "5 小时限额", weekly: "周限额" };

function toAccountView(account) {
  const plan = account.planType || "codex";
  return {
    ...account,
    planText: plan.charAt(0).toUpperCase() + plan.slice(1),
    isFree: plan === "free",
    windows: account.windows.map((w) => ({
      id: w.id,
      label: QUOTA_LABELS[w.id],
      percent: Math.round(w.remainingPercent),
      level: w.level,
      resetText: formatDateTime(w.resetAt)
    }))
  };
}

export const DashboardView = {
  name: "DashboardView",
  template,
  emits: ["open-security"],
  setup(props, { emit }) {
    const state = reactive({
      accounts: [],
      summary: { total: 0, ready: 0, low: 0, danger: 0, exhausted: 0, error: 0 },
      refreshedAt: null,
      refreshing: false,
      statusMessage: "",
      statusIsError: false
    });

    const formatLastRefresh = computed(() => {
      return state.refreshedAt ? `上次刷新 ${formatDateTime(state.refreshedAt)}` : "未刷新";
    });

    function openSecurity() {
      emit("open-security");
    }

    async function refreshQuotas(options = {}) {
      state.refreshing = true;
      if (!options.silent) {
        state.statusMessage = "正在刷新额度...";
        state.statusIsError = false;
      }

      try {
        const payload = await api.quotas.refresh();
        state.accounts = payload.accounts.map(toAccountView);
        state.summary = payload.summary;
        state.refreshedAt = payload.refreshedAt;
        if (!options.silent) state.statusMessage = "刷新完成";
      } catch (error) {
        state.statusMessage = error.message || "刷新失败";
        state.statusIsError = true;
      } finally {
        state.refreshing = false;
      }
    }

    onMounted(() => {
      refreshQuotas();
    });

    return {
      state,
      formatLastRefresh,
      openSecurity,
      refreshQuotas
    };
  }
};
