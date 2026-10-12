import { CPA_BASE_URL, MANAGEMENT_KEY } from "../config.mjs";

const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const WINDOW_5H = 5 * 3600;
const WINDOW_7D = 7 * 24 * 3600;

// 1. 底层 CPA 代理请求（带超时控制与错误规范化）
async function cpaRequest(apiPath, options = {}) {
  if (!MANAGEMENT_KEY) {
    const err = new Error("management key is not configured");
    err.statusCode = 400;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000);

  try {
    const res = await fetch(`${CPA_BASE_URL}${apiPath}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${MANAGEMENT_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(body?.error || body?.raw || `CPA HTTP ${res.status}`);
      err.statusCode = res.status;
      err.details = body;
      throw err;
    }
    return body || {};
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("quota service timed out");
      e.statusCode = 504;
      throw e;
    }
    if (err instanceof TypeError) {
      const e = new Error("quota service unavailable");
      e.statusCode = 502;
      e.details = { cause: err.message };
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// 2. JWT Payload 解析辅助
function parseJwt(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// 3. 获取并筛选 Codex 账号列表
async function listCodexAccounts() {
  const payload = await cpaRequest("/v0/management/auth-files");
  const files = Array.isArray(payload.files) ? payload.files : [];

  return files
    .filter((f) => String(f?.provider || f?.type || "").toLowerCase() === "codex")
    .map((f) => {
      const token = f?.id_token || f?.metadata?.id_token || f?.attributes?.id_token;
      const claims = typeof token === "object" ? token : (parseJwt(token) || {});
      const auth = claims["https://api.openai.com/auth"] || {};

      const accountId = claims.chatgpt_account_id || auth.chatgpt_account_id || f?.account_id || f?.account || f?.project_id || "";
      const rawPlan = claims.plan_type || auth.plan_type || f?.plan_type || f?.planType || "";
      const planType = rawPlan ? String(rawPlan).toUpperCase() : "CODEX";

      return {
        authIndex: f?.auth_index || f?.authIndex || "",
        accountId: String(accountId),
        planType,
        disabled: Boolean(f?.disabled),
        unavailable: Boolean(f?.unavailable)
      };
    });
}

// 4. 解析配额窗口数据（5小时与周限额）
function parseQuota(payload) {
  const rateLimit = payload?.rate_limit || payload?.rateLimit || {};
  const windows = [];

  const list = [
    rateLimit.primary_window || rateLimit.primaryWindow,
    rateLimit.secondary_window || rateLimit.secondaryWindow
  ].filter(Boolean);

  const fiveHour = list.find((w) => (w.limit_window_seconds || w.limitWindowSeconds) === WINDOW_5H) || list[0];
  const weekly = list.find((w) => (w.limit_window_seconds || w.limitWindowSeconds) === WINDOW_7D) || list[1];

  const buildWindow = (id, label, w) => {
    if (!w) return null;
    const rawUsed = w.used_percent ?? w.usedPercent;
    const hasUsed = rawUsed !== undefined && rawUsed !== null && rawUsed !== "";
    const used = Math.max(0, Math.min(100, Number(hasUsed ? rawUsed : (rateLimit.limit_reached ? 100 : 0)) || 0));
    const remaining = Math.max(0, Math.min(100, 100 - used));

    const resetSec = w.reset_at ?? w.resetAt;
    const resetAfter = w.reset_after_seconds ?? w.resetAfterSeconds;
    const resetAt = resetSec ? Number(resetSec) * 1000 : (resetAfter ? Date.now() + Number(resetAfter) * 1000 : null);

    return { id, label, usedPercent: used, remainingPercent: remaining, level: quotaLevel(remaining), resetAt, exhausted: used >= 100 };
  };

  if (fiveHour) windows.push(buildWindow("5h", "5h", fiveHour));
  if (weekly) windows.push(buildWindow("weekly", "Weekly", weekly));

  const plan = payload?.plan_type || payload?.planType;
  return {
    planType: plan ? String(plan).toUpperCase() : "",
    windows: windows.filter(Boolean)
  };
}

// 5. 请求 Wham 额度接口
async function callWhamUsage(account) {
  if (!account.authIndex) throw new Error("missing auth_index");
  if (!account.accountId) throw new Error("missing chatgpt_account_id");

  const res = await cpaRequest("/v0/management/api-call", {
    method: "POST",
    timeoutMs: 60000,
    body: {
      auth_index: account.authIndex,
      method: "GET",
      url: WHAM_USAGE_URL,
      header: {
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
        "Chatgpt-Account-Id": account.accountId
      }
    }
  });

  const statusCode = Number(res.status_code || res.statusCode || 0);
  const bodyText = typeof res.body === "string" ? res.body : JSON.stringify(res.body || {});
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(bodyText || `upstream HTTP ${statusCode}`);
  }

  return parseQuota(JSON.parse(bodyText));
}

// 6. 状态推导辅助
// 剩余额度分级阈值：窗口 level 与账户 dashboardStatus 共用，前端直接使用 level，不另行判断
const DANGER_BELOW = 15;
const LOW_BELOW = 35;

function quotaLevel(remainingPercent) {
  if (remainingPercent < DANGER_BELOW) return "danger";
  if (remainingPercent < LOW_BELOW) return "low";
  return "ready";
}

function deriveStatus(account, quota, error) {
  if (error) return "error";
  if (account.disabled || account.unavailable) return "disabled";
  const remList = (quota?.windows || []).map((w) => w.remainingPercent);
  if (!remList.length) return "unknown";
  const lowest = Math.min(...remList);
  if (lowest <= 0) return "exhausted";
  return quotaLevel(lowest);
}

// 7. 导出接口：刷新并聚合汇总所有额度
export async function refreshQuotas() {
  const accounts = await listCodexAccounts();

  const reports = await Promise.all(
    accounts.map(async (account) => {
      try {
        const quota = await callWhamUsage(account);
        const planType = quota.planType || account.planType;
        return {
          provider: "Codex",
          planType,
          quota,
          dashboardStatus: deriveStatus(account, quota, null),
          error: ""
        };
      } catch (err) {
        return {
          provider: "Codex",
          planType: account.planType || "CODEX",
          quota: { windows: [] },
          dashboardStatus: deriveStatus(account, null, err),
          error: "quota refresh failed"
        };
      }
    })
  );

  const summary = { total: reports.length, ready: 0, low: 0, danger: 0, exhausted: 0, error: 0 };
  for (const r of reports) {
    if (summary[r.dashboardStatus] !== undefined) {
      summary[r.dashboardStatus]++;
    }
  }

  return {
    refreshedAt: new Date().toISOString(),
    accounts: reports,
    summary
  };
}
