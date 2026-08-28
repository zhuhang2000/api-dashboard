// ==========================================================================
// Fail2ban Security & IP Management Component
// Template loaded from /security-manager/security-manager.html
// ==========================================================================

const TOKEN_STORAGE_KEY = "dashboard_admin_token";
const HTML_TEMPLATE_PATH = "/security-manager/security-manager.html";

class SecurityManager {
  constructor() {
    this.container = null;
    this.templates = null;
    this.token = sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
    this.state = {
      active: true,
      jail: "cliproxy-401",
      currentlyBanned: 0,
      totalBanned: 0,
      currentlyFailed: 0,
      totalFailed: 0,
      bannedIps: [],
      updatedAt: null,
      loading: false,
      lockError: ""
    };

    this.init();
  }

  async init() {
    this.container = document.querySelector("#security-manager");
    if (!this.container) return;

    try {
      await this.loadTemplates();
      if (this.token) {
        await this.fetchStatus();
      } else {
        this.renderLockView();
      }
    } catch (error) {
      console.error("Failed to initialize security manager:", error);
    }
  }

  async loadTemplates() {
    const res = await fetch(HTML_TEMPLATE_PATH);
    if (!res.ok) {
      throw new Error(`Failed to load template from ${HTML_TEMPLATE_PATH}`);
    }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    
    this.templates = {
      lock: doc.querySelector("#sec-lock-template"),
      dashboard: doc.querySelector("#sec-dashboard-template"),
      row: doc.querySelector("#sec-ip-row-template")
    };
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

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        this.token = "";
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        this.renderLockView();
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async verifyPassword(password) {
    if (!password) {
      this.state.lockError = "请输入管理密码";
      this.renderLockView();
      return;
    }
    try {
      await this.request("/api/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      this.token = password;
      sessionStorage.setItem(TOKEN_STORAGE_KEY, password);
      this.state.lockError = "";
      this.showToast("解锁成功", "success");
      await this.fetchStatus();
    } catch (error) {
      this.state.lockError = error.message || "密码错误";
      this.renderLockView();
    }
  }

  async fetchStatus() {
    this.state.loading = true;

    try {
      const data = await this.request("/api/admin/fail2ban/status");
      this.state = {
        ...this.state,
        ...data,
        loading: false
      };
      this.renderDashboardView();
    } catch (error) {
      this.state.loading = false;
      this.showToast(error.message, "error");
      this.renderDashboardView();
    }
  }

  async banIp(ip) {
    const target = String(ip || "").trim();
    if (!target) {
      this.showToast("请输入需要封禁的 IP 地址", "error");
      return;
    }

    try {
      const result = await this.request("/api/admin/fail2ban/ban", {
        method: "POST",
        body: JSON.stringify({ ip: target })
      });
      this.state = {
        ...this.state,
        ...(result.status || {})
      };
      this.showToast(`已成功封禁 IP: ${target}`, "success");
      this.renderDashboardView();
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
      this.state = {
        ...this.state,
        ...(result.status || {})
      };
      this.showToast(`已成功解封 IP: ${target}`, "success");
      this.renderDashboardView();
    } catch (error) {
      this.showToast(error.message || "解封失败", "error");
    }
  }

  async unbanAll() {
    if (!confirm("⚠️ 确定要一键解封所有规则下的 IP 吗？该操作将清除所有当前的封禁拦截。")) {
      return;
    }

    try {
      const result = await this.request("/api/admin/fail2ban/unban-all", {
        method: "POST"
      });
      this.state = {
        ...this.state,
        ...(result.status || {})
      };
      this.showToast("已成功解封所有 IP", "success");
      this.renderDashboardView();
    } catch (error) {
      this.showToast(error.message || "一键解封失败", "error");
    }
  }

  lock() {
    this.token = "";
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    this.state.lockError = "";
    this.showToast("管理模块已锁定", "success");
    this.renderLockView();
  }

  formatTime(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "-";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${month}/${day} ${hour}:${minute}:${second}`;
  }

  renderLockView() {
    if (!this.templates?.lock) return;

    this.container.innerHTML = "";
    const section = document.createElement("section");
    section.className = "security-section";

    const lockNode = this.templates.lock.content.cloneNode(true);
    section.appendChild(lockNode);
    this.container.appendChild(section);

    const form = this.container.querySelector("#sec-lock-form");
    const input = this.container.querySelector("#sec-password-input");
    const errorEl = this.container.querySelector("#sec-lock-error");

    if (this.state.lockError && errorEl) {
      errorEl.textContent = this.state.lockError;
      errorEl.style.display = "block";
    }

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.verifyPassword(input.value);
    });
  }

  renderDashboardView() {
    if (!this.templates?.dashboard) return;

    const bannedIps = this.state.bannedIps || [];

    this.container.innerHTML = "";
    const section = document.createElement("section");
    section.className = "security-section";

    const dashboardNode = this.templates.dashboard.content.cloneNode(true);
    section.appendChild(dashboardNode);
    this.container.appendChild(section);

    // 填充数据
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
    if (itemBannedEl) {
      itemBannedEl.classList.toggle("banned", this.state.currentlyBanned > 0);
    }
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

          const copyBtn = rowNode.querySelector(".copy-btn");
          copyBtn?.addEventListener("click", () => {
            navigator.clipboard.writeText(ip).then(() => {
              this.showToast(`已复制 IP: ${ip}`, "success");
            }).catch(() => {
              this.showToast("复制失败", "error");
            });
          });

          const unbanBtn = rowNode.querySelector(".unban-btn");
          unbanBtn?.addEventListener("click", () => {
            this.unbanIp(ip);
          });

          tbodyEl.appendChild(rowNode);
        }
      }
    }

    // 绑定顶部与全局操作事件
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
  }
}

// 自动初始化并挂载
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new SecurityManager());
} else {
  new SecurityManager();
}

export default SecurityManager;
