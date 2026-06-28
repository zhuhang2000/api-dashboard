const state = {
  settings: null,
  reports: [],
  timer: null,
  oauthTimer: null
};

const els = {
  cpaBaseUrl: document.querySelector("#cpa-base-url"),
  managementKey: document.querySelector("#management-key"),
  refreshInterval: document.querySelector("#refresh-interval"),
  saveSettings: document.querySelector("#save-settings"),
  refreshButton: document.querySelector("#refresh-button"),
  oauthButton: document.querySelector("#oauth-button"),
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

function truncateMiddle(value, max = 42) {
  const text = String(value || "");
  if (text.length <= max) return text;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
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
    const name = account.email || account.name || "unknown";
    node.querySelector("h2").textContent = truncateMiddle(name, 34);

    const plan = node.querySelector(".plan-pill");
    plan.textContent = account.planType || "CODEX";
    if ((account.planType || "").toLowerCase() === "free") plan.classList.add("free");

    node.querySelector(".account-id").textContent = account.accountId
      ? `用户 ID: ${truncateMiddle(account.accountId, 56)}`
      : "用户 ID: -";

    const statusMessage = node.querySelector(".status-message");
    const statusBits = [account.status, account.statusMessage].filter(Boolean);
    statusMessage.textContent = statusBits.length ? statusBits.join(" | ") : "状态: -";

    const windows = account.quota?.windows || [];
    const stack = node.querySelector(".quota-stack");
    stack.innerHTML = windows.length
      ? windows.map(quotaRow).join("")
      : `<div class="meta-line">未获取到 5h / Weekly 数据</div>`;

    const errorBox = node.querySelector(".error-box");
    errorBox.textContent = account.error || "";

    els.cardsGrid.append(node);
  }
}

function scheduleRefresh() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  const seconds = Number(els.refreshInterval.value || 0);
  if (seconds > 0) {
    state.timer = window.setInterval(() => refreshQuotas({ silent: true }), seconds * 1000);
  }
}

async function loadSettings() {
  state.settings = await api("/api/settings");
  els.cpaBaseUrl.value = state.settings.cpaBaseUrl || "";
  els.refreshInterval.value = String(state.settings.refreshIntervalSeconds || 0);
  els.managementKey.placeholder = state.settings.managementKeySet ? "已保存，留空则保持不变" : "请输入管理密钥";
  scheduleRefresh();
}

async function saveSettings() {
  els.saveSettings.disabled = true;
  setStatus("正在保存配置...");
  try {
    const key = els.managementKey.value.trim();
    const payload = {
      cpaBaseUrl: els.cpaBaseUrl.value.trim(),
      refreshIntervalSeconds: Number(els.refreshInterval.value || 0),
      managementKey: key ? key : "__KEEP__"
    };
    state.settings = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    els.managementKey.value = "";
    els.managementKey.placeholder = state.settings.managementKeySet ? "已保存，留空则保持不变" : "请输入管理密钥";
    scheduleRefresh();
    setStatus("配置已保存");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.saveSettings.disabled = false;
  }
}

async function ensureManagementSettings() {
  const typedKey = els.managementKey.value.trim();
  if (state.settings?.managementKeySet && !typedKey) return true;

  if (!typedKey) {
    setStatus("请先填写并保存 CLIProxyAPI 的 Management Key", "error");
    els.managementKey.focus();
    return false;
  }

  setStatus("正在保存管理密钥...");
  const payload = {
    cpaBaseUrl: els.cpaBaseUrl.value.trim(),
    refreshIntervalSeconds: Number(els.refreshInterval.value || 0),
    managementKey: typedKey
  };
  state.settings = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  els.managementKey.value = "";
  els.managementKey.placeholder = state.settings.managementKeySet ? "已保存，留空则保持不变" : "请输入管理密钥";
  scheduleRefresh();
  return true;
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

function pollOAuth(stateId) {
  if (state.oauthTimer) window.clearInterval(state.oauthTimer);
  state.oauthTimer = window.setInterval(async () => {
    try {
      const payload = await api(`/api/oauth/status?state=${encodeURIComponent(stateId)}`);
      if (payload.status === "wait") {
        setStatus("OAuth 授权等待中...");
        return;
      }
      window.clearInterval(state.oauthTimer);
      state.oauthTimer = null;
      if (payload.status === "ok") {
        setStatus("OAuth 授权完成");
        await refreshQuotas();
      } else {
        setStatus(payload.error || "OAuth 授权失败", "error");
      }
    } catch (error) {
      window.clearInterval(state.oauthTimer);
      state.oauthTimer = null;
      setStatus(error.message, "error");
    }
  }, 1800);
}

async function startOAuth() {
  els.oauthButton.disabled = true;
  setStatus("正在创建 OAuth 授权...");
  let oauthWindow = null;
  try {
    oauthWindow = window.open("about:blank", "_blank");
    if (oauthWindow) {
      oauthWindow.document.title = "Codex OAuth";
      oauthWindow.document.body.innerHTML = "<p style=\"font-family: system-ui; padding: 24px;\">正在打开 Codex OAuth...</p>";
    }

    const ready = await ensureManagementSettings();
    if (!ready) {
      if (oauthWindow && !oauthWindow.closed) oauthWindow.close();
      return;
    }

    const payload = await api("/api/oauth/codex", { method: "POST" });
    if (!payload.url) throw new Error("OAuth URL missing");
    if (oauthWindow) {
      oauthWindow.location.href = payload.url;
    } else {
      setStatus("授权链接已生成，但浏览器拦截了弹窗，请允许弹窗后重试", "error");
      return;
    }
    if (payload.state) pollOAuth(payload.state);
    setStatus("OAuth 页面已打开");
  } catch (error) {
    if (oauthWindow && !oauthWindow.closed) oauthWindow.close();
    setStatus(error.message, "error");
  } finally {
    els.oauthButton.disabled = false;
  }
}

els.saveSettings.addEventListener("click", saveSettings);
els.refreshButton.addEventListener("click", () => refreshQuotas());
els.oauthButton.addEventListener("click", startOAuth);
els.refreshInterval.addEventListener("change", scheduleRefresh);

await loadSettings().catch((error) => setStatus(error.message, "error"));
await refreshQuotas().catch(() => {});
