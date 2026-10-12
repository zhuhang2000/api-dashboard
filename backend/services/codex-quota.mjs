import { CPA_BASE_URL, MANAGEMENT_KEY } from "../config.mjs";
import { httpError } from "../http.mjs";

const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const WINDOW_5H = 5 * 3600;
const WINDOW_7D = 7 * 24 * 3600;

// 1. 底层 CPA 代理请求（带超时控制与错误规范化）
async function cpaRequest(apiPath, { method = "GET", body, timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${CPA_BASE_URL}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${MANAGEMENT_KEY}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    // CPA 响应是外部数据：在这里统一规范为对象，后续代码直接使用
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text || "{}") || {};
    } catch {
      payload = { raw: text };
    }

    if (!res.ok) {
      throw httpError(res.status, `CPA 请求失败：${payload.error || payload.raw || `HTTP ${res.status}`}`);
    }
    return payload;
  } catch (err) {
    if (err.name === "AbortError") throw httpError(504, "额度服务请求超时");
    if (err instanceof TypeError) throw httpError(502, "额度服务不可用");
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
      const planType = rawPlan ? String(rawPlan).toLowerCase() : null;

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

  const buildWindow = (id, w) => {
    const rawUsed = w.used_percent ?? w.usedPercent;
    const hasUsed = rawUsed !== undefined && rawUsed !== null && rawUsed !== "";
    const used = Math.max(0, Math.min(100, Number(hasUsed ? rawUsed : (rateLimit.limit_reached ? 100 : 0)) || 0));
    const remaining = Math.max(0, Math.min(100, 100 - used));

    const resetSec = w.reset_at ?? w.resetAt;
    const resetAfter = w.reset_after_seconds ?? w.resetAfterSeconds;
    const resetAt = resetSec ? Number(resetSec) * 1000 : (resetAfter ? Date.now() + Number(resetAfter) * 1000 : null);

    return { id, remainingPercent: remaining, level: quotaLevel(remaining), resetAt };
  };

  if (fiveHour) windows.push(buildWindow("5h", fiveHour));
  if (weekly) windows.push(buildWindow("weekly", weekly));

  const plan = payload?.plan_type || payload?.planType;
  return {
    planType: plan ? String(plan).toLowerCase() : null,
    windows
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

function deriveStatus(account, windows) {
  if (account.disabled || account.unavailable) return "disabled";
  if (!windows.length) return "unknown";
  const lowest = Math.min(...windows.map((w) => w.remainingPercent));
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
        return {
          planType: quota.planType || account.planType,
          dashboardStatus: deriveStatus(account, quota.windows),
          windows: quota.windows
        };
      } catch {
        // 单个账号查询失败不影响其他账号，该账号标记为 error
        return { planType: account.planType, dashboardStatus: "error", windows: [] };
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
