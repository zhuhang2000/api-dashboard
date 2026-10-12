// ==========================================================================
// SecurityView Component (front/security-manager/security-manager.js)
// ==========================================================================

import { reactive, computed, watch, onMounted } from "vue";
import { api, auth, login, logout } from "../api.js";
import { formatDateTime, loadHtmlText, showToast } from "../common/utils.js";

const template = await loadHtmlText(new URL("./security-manager.html", import.meta.url));

// IP 类型：同时作为徽标的样式类与文字（徽标文字由 CSS 转为大写）
function ipType(ip) {
  return ip.includes(":") ? "ipv6" : "ipv4";
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
      // 登录弹窗
      authPasswordInput: "",
      authSubmitting: false,
      authError: "",
      // Fail2ban 状态：接口返回的整块数据，写操作后整体替换
      fail2ban: { jail: "", currentlyBanned: 0, totalBanned: 0, totalFailed: 0, bannedIps: [], updatedAt: null },
      banInput: "",
      // IP 频次统计：从未运行过时为 null
      ipStats: null,
      statsLoading: false
    });

    // ------------------------------------------------------------------------
    // 展示数据
    // ------------------------------------------------------------------------
    const formatSyncTime = computed(() => {
      return state.fail2ban.updatedAt
        ? formatDateTime(state.fail2ban.updatedAt, { includeSeconds: true })
        : "未同步";
    });

    const formatStatsSpan = computed(() => {
      const stats = state.ipStats;
      if (!stats) return "未运行统计";
      return `区间: ${stats.timeSpan || "全量日志"} | 更新于: ${formatDateTime(stats.updatedAt, { includeSeconds: true })}`;
    });

    const formatStatsCounts = computed(() => {
      const stats = state.ipStats;
      return stats && {
        uniqueIps: stats.uniqueIps.toLocaleString(),
        totalMatches: stats.totalMatches.toLocaleString(),
        totalLines: stats.totalLines.toLocaleString()
      };
    });

    const bannedRows = computed(() => {
      return state.fail2ban.bannedIps.map((ip) => ({ ip, ipType: ipType(ip) }));
    });

    const statsRows = computed(() => {
      if (!state.ipStats) return [];
      const bannedIps = new Set(state.fail2ban.bannedIps);
      return state.ipStats.items.map((item) => ({
        ip: item.ip,
        ipType: ipType(item.ip),
        rank: item.rank,
        rankClass: item.rank <= 3 ? `rank-${item.rank}` : "",
        countText: item.count.toLocaleString(),
        percentage: item.percentage,
        banned: bannedIps.has(item.ip)
      }));
    });

    // ------------------------------------------------------------------------
    // 登录与导航
    // ------------------------------------------------------------------------
    // 凭证被动失效（401）：auth.token 已被清空，弹窗随之出现，这里补充提示
    watch(() => auth.expiredReason, (reason) => {
      if (!reason) return;
      state.authError = reason;
      showToast("登录凭证已失效", "error");
    });

    function goBack() {
      emit("back-to-dashboard");
    }

    async function submitLogin() {
      const password = state.authPasswordInput.trim();
      if (!password) return;
      state.authSubmitting = true;
      state.authError = "";
      try {
        await api.admin.verify(password);
        login(password);
        state.authPasswordInput = "";
        showToast("解锁成功，已进入控制台", "success");
        loadAll();
      } catch (error) {
        state.authError = error.message;
      } finally {
        state.authSubmitting = false;
      }
    }

    function lock() {
      logout();
      showToast("控制台已锁定", "success");
      emit("back-to-dashboard");
    }

    // ------------------------------------------------------------------------
    // 数据加载：失败时抛出，由调用方提示
    // ------------------------------------------------------------------------
    async function loadStatus() {
      state.fail2ban = await api.fail2ban.status();
    }

    async function loadIpStats() {
      state.ipStats = await api.ipStats.latest();
    }

    function loadAll() {
      loadStatus().catch((error) => showToast(error.message, "error"));
      loadIpStats().catch((error) => showToast(error.message, "error"));
    }

    // ------------------------------------------------------------------------
    // 用户操作：成功与失败都用 toast 提示
    // ------------------------------------------------------------------------
    async function refreshStatus() {
      try {
        await loadStatus();
        showToast("状态已刷新", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function runIpStats() {
      state.statsLoading = true;
      try {
        state.ipStats = await api.ipStats.run();
        showToast("IP 频次统计分析完成", "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        state.statsLoading = false;
      }
    }

    function submitBan() {
      const ip = state.banInput.trim();
      state.banInput = "";
      if (!ip) {
        showToast("请输入需要封禁的 IP 地址", "error");
        return;
      }
      banIp(ip);
    }

    async function banIp(ip) {
      try {
        state.fail2ban = await api.fail2ban.ban(ip);
        showToast(`已成功封禁 IP: ${ip}`, "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function unbanIp(ip) {
      if (!confirm(`确定要解封 IP: ${ip} 吗？`)) return;
      try {
        state.fail2ban = await api.fail2ban.unban(ip);
        showToast(`已成功解封 IP: ${ip}`, "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function unbanAll() {
      if (!confirm("⚠️ 确定要一键解封所有规则下的 IP 吗？该操作将清除所有当前的封禁拦截。")) return;
      try {
        state.fail2ban = await api.fail2ban.unbanAll();
        showToast("已成功解封所有 IP", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    async function copyIp(ip) {
      try {
        await copyToClipboard(ip);
        showToast(`已复制 IP: ${ip}`, "success");
      } catch {
        showToast("复制失败", "error");
      }
    }

    onMounted(() => {
      if (auth.token) loadAll();
    });

    return {
      state,
      auth,
      formatSyncTime,
      formatStatsSpan,
      formatStatsCounts,
      bannedRows,
      statsRows,
      goBack,
      submitLogin,
      lock,
      refreshStatus,
      runIpStats,
      submitBan,
      banIp,
      unbanIp,
      unbanAll,
      copyIp
    };
  }
};
