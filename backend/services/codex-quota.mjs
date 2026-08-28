const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const WINDOW_5H_SECONDS = 5 * 60 * 60;
const WINDOW_7D_SECONDS = 7 * 24 * 60 * 60;

function requireManagementKey(config) {
  if (!config.managementKey) {
    const error = new Error("management key is not configured");
    error.statusCode = 400;
    throw error;
  }
}

async function cpaRequest(config, apiPath, options = {}) {
  requireManagementKey(config);
  const url = `${config.cpaBaseUrl}${apiPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const headers = {
      Authorization: `Bearer ${config.managementKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    if (!response.ok) {
      const message = body?.error || body?.raw || `CPA HTTP ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.details = body;
      throw error;
    }
    return body || {};
  } catch (error) {
    if (error.name === "AbortError") {
      const next = new Error("quota service timed out");
      next.statusCode = 504;
      throw next;
    }
    if (error instanceof TypeError) {
      const next = new Error("quota service unavailable");
      next.statusCode = 502;
      next.details = { cause: error.message };
      throw next;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isCodexEntry(entry) {
  const provider = String(entry?.provider || entry?.type || "").toLowerCase();
  return provider === "codex";
}

function parseJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function normalizePlan(value) {
  const plan = String(value || "").trim();
  if (!plan) return "";
  if (plan.toLowerCase() === "plus") return "PLUS";
  if (plan.toLowerCase() === "pro") return "PRO";
  if (plan.toLowerCase() === "free") return "FREE";
  return plan.toUpperCase();
}

function extractCodexClaims(entry) {
  const claimSources = [];
  if (entry?.id_token && typeof entry.id_token === "object") claimSources.push(entry.id_token);
  if (entry?.metadata?.id_token) claimSources.push(parseJwtPayload(entry.metadata.id_token));
  if (entry?.attributes?.id_token) claimSources.push(parseJwtPayload(entry.attributes.id_token));

  for (const claims of claimSources) {
    if (!claims || typeof claims !== "object") continue;
    if (claims.chatgpt_account_id || claims.plan_type) return claims;
    const nested = claims["https://api.openai.com/auth"];
    if (nested && typeof nested === "object") return nested;
  }
  return {};
}

function codexAccountFromEntry(entry) {
  const claims = extractCodexClaims(entry);
  const accountId = pickString(
    claims.chatgpt_account_id,
    entry?.account_id,
    entry?.account,
    entry?.project_id
  );
  const planType = normalizePlan(pickString(
    claims.plan_type,
    claims.chatgpt_plan_type,
    entry?.plan_type,
    entry?.planType
  ));
  return {
    id: pickString(entry?.id, entry?.name, entry?.auth_index),
    authIndex: pickString(entry?.auth_index, entry?.authIndex),
    name: pickString(entry?.name, entry?.label, entry?.email, entry?.id, "unknown"),
    email: pickString(entry?.email, entry?.label),
    accountId,
    planType,
    status: pickString(entry?.status, "unknown"),
    statusMessage: pickString(entry?.status_message, entry?.statusMessage),
    disabled: Boolean(entry?.disabled),
    unavailable: Boolean(entry?.unavailable),
    updatedAt: pickString(entry?.updated_at, entry?.modtime),
    subscriptionUntil: claims.chatgpt_subscription_active_until || ""
  };
}

async function listCodexAccounts(config) {
  const payload = await cpaRequest(config, "/v0/management/auth-files");
  const files = Array.isArray(payload.files) ? payload.files : [];
  return files.filter(isCodexEntry).map(codexAccountFromEntry);
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numberFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function booleanFrom(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findQuotaWindows(rateLimit) {
  const primary = firstObject(rateLimit?.primary_window, rateLimit?.primaryWindow);
  const secondary = firstObject(rateLimit?.secondary_window, rateLimit?.secondaryWindow);
  let fiveHour = null;
  let weekly = null;
  for (const candidate of [primary, secondary]) {
    if (!candidate) continue;
    const duration = numberFrom(firstValue(candidate.limit_window_seconds, candidate.limitWindowSeconds));
    if (duration === WINDOW_5H_SECONDS && !fiveHour) fiveHour = candidate;
    if (duration === WINDOW_7D_SECONDS && !weekly) weekly = candidate;
  }
  return {
    fiveHour: fiveHour || primary,
    weekly: weekly || secondary
  };
}

function quotaResetAt(window) {
  const resetAt = numberFrom(firstValue(window?.reset_at, window?.resetAt));
  if (resetAt > 0) return resetAt * 1000;
  const resetAfter = numberFrom(firstValue(window?.reset_after_seconds, window?.resetAfterSeconds));
  if (resetAfter > 0) return Date.now() + resetAfter * 1000;
  return null;
}

function buildWindow(id, label, window, rateLimit) {
  if (!window) return null;
  const usedRaw = firstValue(window.used_percent, window.usedPercent);
  let usedPercent = numberFrom(usedRaw);
  const hasUsed = usedRaw !== undefined && usedRaw !== null && usedRaw !== "";
  if (!hasUsed) {
    const exhaustedHint = booleanFrom(firstValue(rateLimit?.limit_reached, rateLimit?.limitReached)) ||
      firstValue(rateLimit?.allowed) === false;
    usedPercent = exhaustedHint ? 100 : 0;
  }
  usedPercent = clamp(usedPercent, 0, 100);
  const remainingPercent = clamp(100 - usedPercent, 0, 100);
  return {
    id,
    label,
    usedPercent,
    remainingPercent,
    resetAt: quotaResetAt(window),
    exhausted: usedPercent >= 100
  };
}

function parseCodexQuota(payload) {
  const rateLimit = firstObject(payload?.rate_limit, payload?.rateLimit);
  const { fiveHour, weekly } = findQuotaWindows(rateLimit);
  const windows = [
    buildWindow("5h", "5h", fiveHour, rateLimit),
    buildWindow("weekly", "Weekly", weekly, rateLimit)
  ].filter(Boolean);
  return {
    planType: normalizePlan(pickString(payload?.plan_type, payload?.planType)),
    allowed: firstValue(rateLimit?.allowed) !== false,
    limitReached: booleanFrom(firstValue(rateLimit?.limit_reached, rateLimit?.limitReached)),
    windows
  };
}

async function callWhamUsage(config, account) {
  if (!account.authIndex) throw new Error("missing auth_index");
  if (!account.accountId) throw new Error("missing chatgpt_account_id");
  const payload = {
    auth_index: account.authIndex,
    method: "GET",
    url: WHAM_USAGE_URL,
    header: {
      Authorization: "Bearer $TOKEN$",
      "Content-Type": "application/json",
      "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
      "Chatgpt-Account-Id": account.accountId
    }
  };
  const response = await cpaRequest(config, "/v0/management/api-call", {
    method: "POST",
    body: payload,
    timeoutMs: 60000
  });
  const statusCode = Number(response.status_code || response.statusCode || 0);
  const bodyText = typeof response.body === "string" ? response.body : JSON.stringify(response.body || {});
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(bodyText || `upstream HTTP ${statusCode}`);
  }
  try {
    const parsed = JSON.parse(bodyText);
    return parseCodexQuota(parsed);
  } catch {
    throw new Error("empty or invalid quota payload");
  }
}

function deriveAccountState(account, quota, error) {
  if (error) return "error";
  if (account.disabled || account.unavailable) return "disabled";
  const percentages = (quota?.windows || []).map((item) => item.remainingPercent);
  if (percentages.length === 0) return "unknown";
  const lowest = Math.min(...percentages);
  if (lowest <= 0) return "exhausted";
  if (lowest < 15) return "low";
  return "ready";
}

function publicQuotaReport(report) {
  return {
    provider: "Codex",
    planType: report.planType || "CODEX",
    quota: report.quota || { windows: [] },
    dashboardStatus: report.dashboardStatus || "unknown",
    error: report.error ? "quota refresh failed" : ""
  };
}

function summarizeReports(reports) {
  const summary = {
    total: reports.length,
    ready: 0,
    low: 0,
    exhausted: 0,
    error: 0
  };
  for (const report of reports) {
    if (report.dashboardStatus === "ready") summary.ready += 1;
    if (report.dashboardStatus === "low") summary.low += 1;
    if (report.dashboardStatus === "exhausted") summary.exhausted += 1;
    if (report.dashboardStatus === "error") summary.error += 1;
  }
  return summary;
}

export async function refreshQuotas(config) {
  const accounts = await listCodexAccounts(config);
  const reports = await Promise.all(accounts.map(async (account) => {
    try {
      const quota = await callWhamUsage(config, account);
      const planType = quota.planType || account.planType;
      return {
        ...account,
        planType,
        quota,
        dashboardStatus: deriveAccountState(account, quota, null),
        error: ""
      };
    } catch (error) {
      return {
        ...account,
        quota: { windows: [] },
        dashboardStatus: deriveAccountState(account, null, error),
        error: error.message || "quota refresh failed"
      };
    }
  }));
  return {
    refreshedAt: new Date().toISOString(),
    accounts: reports.map(publicQuotaReport),
    summary: summarizeReports(reports)
  };
}
