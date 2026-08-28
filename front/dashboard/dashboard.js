// ==========================================================================
// Codex Quota Dashboard Component
// Template loaded from /dashboard/dashboard.html
// ==========================================================================

const HTML_TEMPLATE_PATH = "/dashboard/dashboard.html";

class QuotaDashboard {
  constructor() {
    this.container = null;
    this.template = null;
    this.state = {
      reports: []
    };
    this.els = {};

    this.init();
  }

  async init() {
    this.container = document.querySelector("#dashboard");
    if (!this.container) return;

    try {
      await this.loadTemplate();
      this.bindElements();
      await this.refreshQuotas();
    } catch (error) {
      console.error("Failed to initialize quota dashboard:", error);
    }
  }

  async loadTemplate() {
    const res = await fetch(HTML_TEMPLATE_PATH);
    if (!res.ok) {
      throw new Error(`Failed to load template from ${HTML_TEMPLATE_PATH}`);
    }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const section = doc.querySelector(".dashboard-section");
    if (section) {
      this.container.innerHTML = "";
      this.container.appendChild(section);
      this.template = this.container.querySelector("#account-card-template");
    }
  }

  bindElements() {
    this.els = {
      refreshButton: this.container.querySelector("#refresh-button"),
      lastRefresh: this.container.querySelector("#last-refresh"),
      statusLine: this.container.querySelector("#status-line"),
      cardsGrid: this.container.querySelector("#cards-grid"),
      summaryTotal: this.container.querySelector("#summary-total"),
      summaryReady: this.container.querySelector("#summary-ready"),
      summaryLow: this.container.querySelector("#summary-low"),
      summaryError: this.container.querySelector("#summary-error"),
      titleBadge: this.container.querySelector("#title-badge")
    };

    this.els.refreshButton?.addEventListener("click", () => this.refreshQuotas());
  }

  setStatus(message, type = "") {
    if (!this.els.statusLine) return;
    this.els.statusLine.textContent = message || "";
    this.els.statusLine.classList.toggle("error", type === "error");
  }

  async api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hour}:${minute}`;
  }

  percentClass(value) {
    if (value < 15) return "danger";
    if (value < 35) return "low";
    return "";
  }

  quotaRow(window) {
    const remaining = Math.round(window.remainingPercent ?? 0);
    const cls = this.percentClass(remaining);
    const resetAt = window.resetAt ? new Date(window.resetAt) : null;
    const resetText = resetAt ? this.formatDateTime(resetAt) : "-";
    const width = Math.max(0, Math.min(100, remaining));
    const displayLabel = window.label === "5h" ? "5 小时限额" : (window.label === "Weekly" ? "周限额" : window.label);

    return `
      <div class="quota-row">
        <div class="quota-heading">
          <div class="quota-label"><span>${displayLabel}</span></div>
          <div class="quota-value-group">
            <span class="quota-percent ${cls}">${remaining}%</span>
            <span class="quota-reset">${resetText}</span>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${cls}" style="width: ${width}%"></div>
        </div>
      </div>
    `;
  }

  renderSummary(summary = {}) {
    if (!this.els.summaryTotal) return;
    this.els.summaryTotal.textContent = summary.total ?? 0;
    this.els.summaryReady.textContent = summary.ready ?? 0;
    this.els.summaryLow.textContent = summary.low ?? 0;
    this.els.summaryError.textContent = (summary.error ?? 0) + (summary.exhausted ?? 0);
    if (this.els.titleBadge) {
      this.els.titleBadge.textContent = summary.total ?? 0;
    }
  }

  renderCards(accounts) {
    if (!this.els.cardsGrid || !this.template) return;
    this.els.cardsGrid.textContent = "";

    if (!accounts.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "暂无 Codex OAuth 账号";
      this.els.cardsGrid.append(empty);
      return;
    }

    for (const account of accounts) {
      const node = this.template.content.firstElementChild.cloneNode(true);
      node.classList.add(account.dashboardStatus || "unknown");
      node.querySelector("h2").textContent = account.provider;

      const plan = node.querySelector(".plan-pill");
      const rawPlan = account.planType || "CODEX";
      const displayPlan = rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1).toLowerCase();
      plan.textContent = `套餐 ${displayPlan}`;
      if (rawPlan.toLowerCase() === "free") plan.classList.add("free");

      const windows = account.quota?.windows || [];
      const stack = node.querySelector(".quota-stack");
      stack.innerHTML = windows.length
        ? windows.map((w) => this.quotaRow(w)).join("")
        : `<div class="meta-line">未获取到 5h / Weekly 数据</div>`;

      const errorBox = node.querySelector(".error-box");
      errorBox.textContent = account.error ? "额度读取失败" : "";

      const refreshBtn = node.querySelector(".refresh-btn");
      refreshBtn?.addEventListener("click", () => this.refreshQuotas());

      this.els.cardsGrid.append(node);
    }
  }

  async refreshQuotas(options = {}) {
    if (this.els.refreshButton) this.els.refreshButton.disabled = true;
    if (!options.silent) this.setStatus("正在刷新额度...");

    try {
      const payload = await this.api("/api/quotas/refresh", { method: "POST" });
      this.state.reports = payload.accounts || [];
      this.renderSummary(payload.summary || {});
      this.renderCards(this.state.reports);
      if (this.els.lastRefresh) {
        this.els.lastRefresh.textContent = `上次刷新 ${this.formatDateTime(payload.refreshedAt)}`;
      }
      if (!options.silent) this.setStatus("刷新完成");
    } catch (error) {
      this.setStatus(error.message, "error");
      this.renderCards(this.state.reports);
    } finally {
      if (this.els.refreshButton) this.els.refreshButton.disabled = false;
    }
  }
}

// 自动初始化并挂载
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new QuotaDashboard());
} else {
  new QuotaDashboard();
}

export default QuotaDashboard;
