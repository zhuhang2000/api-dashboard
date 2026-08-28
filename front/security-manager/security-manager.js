// ==========================================================================
// Fail2ban Security & IP Management Component
// Template loaded from /security-manager/security-manager.html
// ==========================================================================

const TOKEN_STORAGE_KEY = "dashboard_admin_token";
const HTML_TEMPLATE_PATH = "/security-manager/security-manager.html";

class SecurityManager {
  constructor() {
    this.container = null;
    this.dashboardContainer = null;
    this.templates = null;
    this.token = sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
    this.state = {
      jail: "cliproxy-401",
      currentlyBanned: 0,
      totalBanned: 0,
      totalFailed: 0,
      bannedIps: [],
      updatedAt: null,
      ipStats: null,
      statsLoading: false
    };

    this.init();
  }

  async init() {
    this.container = document.querySelector("#security-manager");
    this.dashboardContainer = document.querySelector("#dashboard");
    if (!this.container) return;

    try {
      await this.loadTemplates();
      this.bindGlobalEvents();

      if (window.location.hash === "#security" && this.token) {
        this.setView("security");
      } else {
        this.setView("dashboard");
      }
    } catch (error) {
      console.error("Failed to initialize security manager:", error);
    }
  }

  async loadTemplates() {
    const res = await fetch(HTML_TEMPLATE_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load template from ${HTML_TEMPLATE_PATH}`);
    }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    this.templates = {
      modal: doc.querySelector("#sec-modal-template"),
      dashboard: doc.querySelector("#sec-dashboard-template"),
      row: doc.querySelector("#sec-ip-row-template"),
      statsRow: doc.querySelector("#sec-stats-row-template")
    };
  }

  bindGlobalEvents() {
    window.addEventListener("open-security-console", () => {
      if (this.token) {
        this.setView("security");
      } else {
        this.openAuthModal();
      }
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#security") {
        if (this.token) {
          this.setView("security");
        } else {
          this.setView("dashboard");
          this.openAuthModal();
        }
      } else {
        this.setView("dashboard");
      }
    });
  }

  setView(viewName) {
    const isSecurity = viewName === "security";
    if (this.dashboardContainer) {
      this.dashboardContainer.style.display = isSecurity ? "none" : "block";
    }
    if (this.container) {
      this.container.style.display = isSecurity ? "block" : "none";
      if (!isSecurity) this.container.innerHTML = "";
    }

    if (isSecurity) {
      if (window.location.hash !== "#security") window.location.hash = "#security";
      this.renderSecurityView();
      this.fetchStatus();
      this.fetchIpStats(false);
    } else {
      if (window.location.hash === "#security") {
        history.replaceState(null, "", window.location.pathname);
      }
    }
  }

  showToast(message, type = "success") {
    const existing = document.querySelector(".sec-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `sec-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  copyIp(ip) {
    navigator.clipboard.writeText(ip).then(() => {
      this.showToast(`已复制 IP: ${ip}`, "success");
    }).catch(() => {
      this.showToast("复制失败", "error");
    });
  }

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        this.token = "";
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        this.setView("dashboard");
        this.openAuthModal("登录已过期，请重新输入管理密码");
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  openAuthModal(initialError = "") {
    this.closeAuthModal();
    if (!this.templates?.modal) return;

    const modalNode = this.templates.modal.content.cloneNode(true);
    document.body.appendChild(modalNode);

    const modalEl = document.querySelector("#sec-auth-modal");
    const form = modalEl?.querySelector("#sec-modal-form");
    const input = modalEl?.querySelector("#sec-modal-password-input");
    const errorEl = modalEl?.querySelector("#sec-modal-error");
    const closeBtn = modalEl?.querySelector("#sec-modal-close");
    const cancelBtn = modalEl?.querySelector("#sec-modal-cancel");

    if (initialError && errorEl) {
      errorEl.textContent = initialError;
      errorEl.style.display = "block";
    }

    input?.focus();

    closeBtn?.addEventListener("click", () => this.closeAuthModal());
    cancelBtn?.addEventListener("click", () => this.closeAuthModal());
    modalEl?.addEventListener("click", (e) => {
      if (e.target === modalEl) this.closeAuthModal();
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = String(input?.value || "").trim();
      if (!password) return;

      const submitBtn = form.querySelector("#sec-modal-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "验证中...";
      }

      try {
        await this.request("/api/admin/verify", {
          method: "POST",
          body: JSON.stringify({ password })
        });
        this.token = password;
        sessionStorage.setItem(TOKEN_STORAGE_KEY, password);
        this.closeAuthModal();
        this.showToast("解锁成功，已进入控制台", "success");
        this.setView("security");
      } catch (error) {
        if (errorEl) {
          errorEl.textContent = error.message || "密码错误";
          errorEl.style.display = "block";
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "解锁并进入";
        }
      }
    });
  }

  closeAuthModal() {
    const existing = document.querySelector("#sec-auth-modal");
    if (existing) existing.remove();
  }

  async fetchStatus() {
    try {
      const data = await this.request("/api/admin/fail2ban/status");
      this.state = { ...this.state, ...data };
      this.updateAllViews();
    } catch (error) {
      this.showToast(error.message, "error");
      this.updateAllViews();
    }
  }

  async fetchIpStats(run = false) {
    this.state.statsLoading = true;
    const runBtn = this.container?.querySelector("#sec-run-stats-btn");
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.querySelector("span").textContent = run ? "正在分析..." : "加载中...";
    }

    try {
      const path = run ? "/api/admin/ip-stats/run" : "/api/admin/ip-stats/latest";
      const method = run ? "POST" : "GET";
      const data = await this.request(path, { method });

      if (data && data.items) {
        this.state.ipStats = data;
        if (run) this.showToast("IP 频次统计分析完成", "success");
      }
      this.renderIpStatsSection();
    } catch (error) {
      if (run) this.showToast(error.message || "执行统计失败", "error");
    } finally {
      this.state.statsLoading = false;
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.querySelector("span").textContent = "执行统计";
      }
    }
  }

  async banIp(ip) {
    const target = String(ip || "").trim();
    if (!target) return this.showToast("请输入需要封禁的 IP 地址", "error");

    try {
      const result = await this.request("/api/admin/fail2ban/ban", {
        method: "POST",
        body: JSON.stringify({ ip: target })
      });
      this.state = { ...this.state, ...(result.status || {}) };
      this.showToast(`已成功封禁 IP: ${target}`, "success");
      this.updateAllViews();
    } catch (error) {
      this.showToast(error.message || "封禁失败", "error");
    }
  }

  async unbanIp(ip) {
    const target = String(ip || "").trim();
    if (!confirm(`确定要解封 IP: ${target} 吗？`)) return;

    try {
      const result = await this.request("/api/admin/fail2ban/unban", {
        method: "POST",
        body: JSON.stringify({ ip: target })
      });
      this.state = { ...this.state, ...(result.status || {}) };
      this.showToast(`已成功解封 IP: ${target}`, "success");
      this.updateAllViews();
    } catch (error) {
      this.showToast(error.message || "解封失败", "error");
    }
  }

  async unbanAll() {
    if (!confirm("⚠️ 确定要一键解封所有规则下的 IP 吗？该操作将清除所有当前的封禁拦截。")) return;

    try {
      const result = await this.request("/api/admin/fail2ban/unban-all", { method: "POST" });
      this.state = { ...this.state, ...(result.status || {}) };
      this.showToast("已成功解封所有 IP", "success");
      this.updateAllViews();
    } catch (error) {
      this.showToast(error.message || "一键解封失败", "error");
    }
  }

  lock() {
    this.token = "";
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    this.showToast("控制台已锁定", "success");
    this.setView("dashboard");
  }

  formatTime(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "-";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  renderSecurityView() {
    if (!this.templates?.dashboard) return;

    this.container.innerHTML = "";
    const dashboardNode = this.templates.dashboard.content.cloneNode(true);
    this.container.appendChild(dashboardNode);

    // 绑定返回与顶部操作事件
    this.container.querySelector("#sec-back-btn")?.addEventListener("click", () => this.setView("dashboard"));
    this.container.querySelector("#sec-refresh-btn")?.addEventListener("click", () => this.fetchStatus());
    this.container.querySelector("#sec-lock-btn")?.addEventListener("click", () => this.lock());
    this.container.querySelector("#sec-unban-all-btn")?.addEventListener("click", () => this.unbanAll());

    const banForm = this.container.querySelector("#sec-ban-form");
    const banInput = this.container.querySelector("#sec-ban-ip-input");
    banForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.banIp(banInput?.value);
      if (banInput) banInput.value = "";
    });

    this.container.querySelector("#sec-run-stats-btn")?.addEventListener("click", () => this.fetchIpStats(true));

    this.updateAllViews();
  }

  updateAllViews() {
    this.updateStatusView();
    this.renderIpStatsSection();
  }

  updateStatusView() {
    if (!this.container) return;
    const bannedIps = this.state.bannedIps || [];

    const badgeEl = this.container.querySelector("#sec-badge");
    const sublineEl = this.container.querySelector("#sec-subline");
    const statBannedEl = this.container.querySelector("#sec-stat-banned");
    const statTotalBannedEl = this.container.querySelector("#sec-stat-total-banned");
    const statTotalFailedEl = this.container.querySelector("#sec-stat-total-failed");
    const itemBannedEl = this.container.querySelector("#sec-item-banned");
    const countEl = this.container.querySelector("#sec-ip-count");
    const emptyEl = this.container.querySelector("#sec-empty-state");
    const tableEl = this.container.querySelector("#sec-ip-table");
    const tbodyEl = this.container.querySelector("#sec-ip-tbody");

    if (badgeEl) badgeEl.textContent = bannedIps.length;
    if (sublineEl) {
      sublineEl.textContent = `规则: ${this.state.jail} | 上次同步: ${this.formatTime(this.state.updatedAt)}`;
    }
    if (statBannedEl) statBannedEl.textContent = this.state.currentlyBanned;
    if (statTotalBannedEl) statTotalBannedEl.textContent = this.state.totalBanned;
    if (statTotalFailedEl) statTotalFailedEl.textContent = this.state.totalFailed;
    if (itemBannedEl) itemBannedEl.classList.toggle("banned", this.state.currentlyBanned > 0);
    if (countEl) countEl.textContent = `共 ${bannedIps.length} 个 IP`;

    if (bannedIps.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      if (tableEl) tableEl.style.display = "none";
    } else {
      if (emptyEl) emptyEl.style.display = "none";
      if (tableEl) tableEl.style.display = "table";
      if (tbodyEl) {
        tbodyEl.innerHTML = "";
        for (const ip of bannedIps) {
          const rowNode = this.templates.row.content.cloneNode(true);
          const isV6 = ip.includes(":");

          const ipBadge = rowNode.querySelector(".ip-mono-badge");
          if (ipBadge) ipBadge.textContent = ip;

          const typeBadge = rowNode.querySelector(".ip-type-badge");
          if (typeBadge) {
            typeBadge.textContent = isV6 ? "IPv6" : "IPv4";
            typeBadge.classList.add(isV6 ? "ipv6" : "ipv4");
          }

          rowNode.querySelector(".copy-btn")?.addEventListener("click", () => this.copyIp(ip));
          rowNode.querySelector(".unban-btn")?.addEventListener("click", () => this.unbanIp(ip));

          tbodyEl.appendChild(rowNode);
        }
      }
    }
  }

  renderIpStatsSection() {
    const stats = this.state.ipStats;
    const spanEl = this.container?.querySelector("#sec-stats-span");
    const metaGrid = this.container?.querySelector("#sec-stats-meta-grid");
    const metaUnique = this.container?.querySelector("#sec-meta-unique");
    const metaMatches = this.container?.querySelector("#sec-meta-matches");
    const metaLines = this.container?.querySelector("#sec-meta-lines");
    const emptyEl = this.container?.querySelector("#sec-stats-empty");
    const tableWrapper = this.container?.querySelector("#sec-stats-table-wrapper");
    const tbodyEl = this.container?.querySelector("#sec-stats-tbody");

    if (!stats || !stats.items || stats.items.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      if (tableWrapper) tableWrapper.style.display = "none";
      if (metaGrid) metaGrid.style.display = "none";
      if (spanEl) spanEl.textContent = "未运行统计";
      return;
    }

    if (spanEl) {
      spanEl.textContent = `区间: ${stats.timeSpan || "全量日志"} | 更新于: ${this.formatTime(stats.updatedAt)}`;
    }
    if (metaGrid) metaGrid.style.display = "grid";
    if (metaUnique) metaUnique.textContent = stats.uniqueIps?.toLocaleString() || 0;
    if (metaMatches) metaMatches.textContent = stats.totalMatches?.toLocaleString() || 0;
    if (metaLines) metaLines.textContent = stats.totalLines?.toLocaleString() || 0;

    if (emptyEl) emptyEl.style.display = "none";
    if (tableWrapper) tableWrapper.style.display = "block";

    if (tbodyEl && this.templates?.statsRow) {
      tbodyEl.innerHTML = "";
      const bannedSet = new Set(this.state.bannedIps || []);

      for (const item of stats.items) {
        const rowNode = this.templates.statsRow.content.cloneNode(true);

        const rankBadge = rowNode.querySelector(".rank-badge");
        if (rankBadge) {
          rankBadge.textContent = item.rank;
          if (item.rank <= 3) rankBadge.classList.add(`rank-${item.rank}`);
        }

        const ipBadge = rowNode.querySelector(".ip-mono-badge");
        if (ipBadge) ipBadge.textContent = item.ip;

        const typeBadge = rowNode.querySelector(".ip-type-badge");
        if (typeBadge) {
          typeBadge.textContent = item.isV6 ? "IPv6" : "IPv4";
          typeBadge.classList.add(item.isV6 ? "ipv6" : "ipv4");
        }

        const isBanned = bannedSet.has(item.ip);
        const bannedPill = rowNode.querySelector(".ip-banned-pill");
        if (bannedPill && isBanned) bannedPill.style.display = "inline-block";

        const countEl = rowNode.querySelector(".stat-count");
        if (countEl) countEl.textContent = item.count?.toLocaleString();

        const progressFill = rowNode.querySelector(".stat-progress-fill");
        if (progressFill) progressFill.style.width = item.percentage;

        const percentText = rowNode.querySelector(".stat-percent-text");
        if (percentText) percentText.textContent = item.percentage;

        rowNode.querySelector(".copy-btn")?.addEventListener("click", () => this.copyIp(item.ip));

        const quickBanBtn = rowNode.querySelector(".quick-ban-btn");
        if (quickBanBtn) {
          if (isBanned) {
            quickBanBtn.disabled = true;
            quickBanBtn.querySelector("span").textContent = "已封禁";
          } else {
            quickBanBtn.addEventListener("click", () => this.banIp(item.ip));
          }
        }

        tbodyEl.appendChild(rowNode);
      }
    }
  }
}

// 自动初始化并挂载
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new SecurityManager());
} else {
  new SecurityManager();
}

export default SecurityManager;
