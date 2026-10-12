// ==========================================================================
// DashboardView Component (front/dashboard/dashboard.js)
// ==========================================================================

import { reactive, computed, onMounted } from "vue";
import { quotasApi } from "../services/quotas.js";
import { formatDateTime } from "../common/datetime.js";
import { loadHtmlText } from "../common/template.js";
import { formatPlan, formatQuotaLabel, formatReset, percentClass } from "./format.js";

const template = await loadHtmlText(new URL("./dashboard.html", import.meta.url));

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
        const payload = await quotasApi.refresh();
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
