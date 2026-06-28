const state = {
  reports: []
};

const els = {
  refreshButton: document.querySelector("#refresh-button"),
  lastRefresh: document.querySelector("#last-refresh"),
  statusLine: document.querySelector("#status-line"),
  cardsGrid: document.querySelector("#cards-grid"),
  template: document.querySelector("#account-card-template"),
  summaryTotal: document.querySelector("#summary-total"),
  summaryReady: document.querySelector("#summary-ready"),
  summaryLow: document.querySelector("#summary-low"),
  summaryError: document.querySelector("#summary-error")
};

function setStatus(message, type = "") {
  els.statusLine.textContent = message || "";
  els.statusLine.classList.toggle("error", type === "error");
}

async function api(path, options = {}) {
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function percentClass(value) {
  if (value < 15) return "danger";
  if (value < 35) return "low";
  return "";
}

function quotaIcon(label) {
  if (label === "Weekly") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
}

function quotaRow(window) {
  const remaining = Math.round(window.remainingPercent ?? 0);
  const cls = percentClass(remaining);
  const resetAt = window.resetAt ? new Date(window.resetAt) : null;
  const resetText = resetAt
    ? `${formatDuration(resetAt.getTime() - Date.now())} (${formatDateTime(resetAt)})`
    : "-";
  const width = Math.max(0, Math.min(100, remaining));
  return `
    <div class="quota-row">
      <div class="quota-heading">
        <div class="quota-label">${quotaIcon(window.label)}<span>${window.label}</span></div>
        <div class="quota-percent ${cls}">${remaining}%</div>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${cls}" style="width: ${width}%"></div>
      </div>
      <div class="quota-reset">${resetText}</div>
    </div>
  `;
}

function renderSummary(summary = {}) {
  els.summaryTotal.textContent = summary.total ?? 0;
  els.summaryReady.textContent = summary.ready ?? 0;
  els.summaryLow.textContent = summary.low ?? 0;
  els.summaryError.textContent = (summary.error ?? 0) + (summary.exhausted ?? 0);
}

function renderCards(accounts) {
  els.cardsGrid.textContent = "";
  if (!accounts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无 Codex OAuth 账号";
    els.cardsGrid.append(empty);
    return;
  }

  for (const account of accounts) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.classList.add(account.dashboardStatus || "unknown");
    node.querySelector("h2").textContent = account.provider;

    const plan = node.querySelector(".plan-pill");
    plan.textContent = account.planType || "CODEX";
    if ((account.planType || "").toLowerCase() === "free") plan.classList.add("free");

    const windows = account.quota?.windows || [];
    const stack = node.querySelector(".quota-stack");
    stack.innerHTML = windows.length
      ? windows.map(quotaRow).join("")
      : `<div class="meta-line">未获取到 5h / Weekly 数据</div>`;

    const errorBox = node.querySelector(".error-box");
    errorBox.textContent = account.error ? "额度读取失败" : "";

    els.cardsGrid.append(node);
  }
}

async function refreshQuotas(options = {}) {
  els.refreshButton.disabled = true;
  if (!options.silent) setStatus("正在刷新额度...");
  try {
    const payload = await api("/api/quotas/refresh", { method: "POST" });
    state.reports = payload.accounts || [];
    renderSummary(payload.summary || {});
    renderCards(state.reports);
    els.lastRefresh.textContent = `上次刷新 ${formatDateTime(payload.refreshedAt)}`;
    if (!options.silent) setStatus("刷新完成");
  } catch (error) {
    setStatus(error.message, "error");
    renderCards(state.reports);
  } finally {
    els.refreshButton.disabled = false;
  }
}

els.refreshButton.addEventListener("click", () => refreshQuotas());

await refreshQuotas().catch(() => {});
