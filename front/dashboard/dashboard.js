// ==========================================================================
// DashboardView Component (front/dashboard/dashboard.js)
// ==========================================================================

import { reactive, computed, onMounted } from "vue";
import { api } from "../api.js";
import { formatDateTime, loadHtmlText } from "../common/utils.js";

const template = await loadHtmlText(new URL("./dashboard.html", import.meta.url));

// 套餐名称首字母大写
function formatPlan(rawPlan) {
  const plan = rawPlan || "CODEX";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

// 限额时间窗口中文标签 (5h / Weekly)
function formatQuotaLabel(label) {
  if (label === "5h") return "5 小时限额";
  if (label === "Weekly") return "周限额";
  return label || "";
}

function formatReset(resetAt) {
  return resetAt ? formatDateTime(new Date(resetAt)) : "-";
}

// 剩余百分比的风险样式等级
function percentClass(value) {
  const num = Math.round(value ?? 0);
  if (num < 15) return "danger";
  if (num < 35) return "low";
  return "";
}

export const DashboardView = {
  name: "DashboardView",
  template,
  emits: ["open-security"],
  setup(props, { emit }) {
    const state = reactive({
      accounts: [],
      summary: { total: 0, ready: 0, low: 0, exhausted: 0, error: 0 },
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
        state.accounts = payload.accounts || [];
        state.summary = payload.summary || { total: 0, ready: 0, low: 0, exhausted: 0, error: 0 };
        state.refreshedAt = payload.refreshedAt || new Date().toISOString();
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
      formatPlan,
      formatQuotaLabel,
      formatReset,
      percentClass,
      openSecurity,
      refreshQuotas
    };
  }
};
