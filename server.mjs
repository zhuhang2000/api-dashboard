import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = normalized.slice(0, equalsIndex).trim();
  let value = normalized.slice(equalsIndex + 1).trim();
  if (!key) return null;

  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value[value.length - 1] === quote) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3456);
const HOST = process.env.HOST || process.env.DASHBOARD_HOST || "127.0.0.1";
const DEFAULT_CPA_BASE_URL = "http://127.0.0.1:8317";
const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const WINDOW_5H_SECONDS = 5 * 60 * 60;
const WINDOW_7D_SECONDS = 7 * 24 * 60 * 60;

const defaultConfig = {
  cpaBaseUrl: DEFAULT_CPA_BASE_URL,
  managementKey: "",
  refreshIntervalSeconds: 0
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function cleanBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_CPA_BASE_URL;
  return raw.replace(/\/+$/, "");
}

async function loadConfig() {
  let config = { ...defaultConfig };
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    config = { ...config, ...parsed };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const envCpaBaseUrl = process.env.CPA_BASE_URL || process.env.cpa_base_url;
  const envManagementKey = process.env.MANAGEMENT_KEY ||
    process.env.management_key ||
    process.env.MANAGEMENTKEY ||
    process.env.managementkey;

  if (envCpaBaseUrl) config.cpaBaseUrl = envCpaBaseUrl;
  if (envManagementKey) {
    config.managementKey = envManagementKey;
  }
  config.cpaBaseUrl = cleanBaseUrl(config.cpaBaseUrl);
  config.managementKey = String(config.managementKey || "").trim();
  config.refreshIntervalSeconds = Number(config.refreshIntervalSeconds || 0);
  return config;
}

async function saveConfig(next) {
  await mkdir(dataDir, { recursive: true });
  const current = await loadConfig();
  const config = {
    cpaBaseUrl: cleanBaseUrl(next.cpaBaseUrl ?? current.cpaBaseUrl),
    managementKey: Object.prototype.hasOwnProperty.call(next, "managementKey")
      ? String(next.managementKey || "").trim()
      : current.managementKey,
    refreshIntervalSeconds: Number(next.refreshIntervalSeconds ?? current.refreshIntervalSeconds ?? 0)
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

function publicConfig(config) {
  return {
    cpaBaseUrl: config.cpaBaseUrl,
    managementKeySet: Boolean(config.managementKey),
    refreshIntervalSeconds: config.refreshIntervalSeconds
  };
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function textResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

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
      const next = new Error(`CLIProxyAPI request timed out: ${url}`);
      next.statusCode = 504;
      throw next;
    }
    if (error instanceof TypeError) {
      const next = new Error(`cannot reach CLIProxyAPI at ${config.cpaBaseUrl}`);
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

function pickNestedString(source, ...paths) {
  for (const path of paths) {
    let value = source;
    for (const key of path) {
      value = value?.[key];
    }
    const picked = pickString(value);
    if (picked) return picked;
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

async function refreshQuotas(config) {
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
    accounts: reports,
    summary: summarizeReports(reports)
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

async function startCodexOAuth(config) {
  const payload = await cpaRequest(config, "/v0/management/codex-auth-url?is_webui=1");
  const url = pickNestedString(
    payload,
    ["url"],
    ["auth_url"],
    ["authUrl"],
    ["oauth_url"],
    ["oauthUrl"],
    ["data", "url"],
    ["data", "auth_url"],
    ["data", "authUrl"],
    ["data", "oauth_url"],
    ["data", "oauthUrl"]
  );
  const state = pickNestedString(
    payload,
    ["state"],
    ["data", "state"]
  );
  return {
    status: payload.status || "ok",
    url,
    state,
    raw: url ? undefined : payload
  };
}

async function getOAuthStatus(config, state) {
  const query = encodeURIComponent(String(state || ""));
  return cpaRequest(config, `/v0/management/get-auth-status?state=${query}`);
}

async function handleApi(req, res, pathname) {
  const config = await loadConfig();
  if (req.method === "GET" && pathname === "/api/settings") {
    return jsonResponse(res, 200, publicConfig(config));
  }
  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await readJsonBody(req);
    const next = {
      cpaBaseUrl: body.cpaBaseUrl,
      refreshIntervalSeconds: body.refreshIntervalSeconds
    };
    if (Object.prototype.hasOwnProperty.call(body, "managementKey") && body.managementKey !== "__KEEP__") {
      next.managementKey = body.managementKey;
    }
    const saved = await saveConfig(next);
    return jsonResponse(res, 200, publicConfig(saved));
  }
  if (req.method === "GET" && pathname === "/api/accounts") {
    const accounts = await listCodexAccounts(config);
    return jsonResponse(res, 200, { accounts });
  }
  if (req.method === "POST" && pathname === "/api/quotas/refresh") {
    const payload = await refreshQuotas(config);
    return jsonResponse(res, 200, payload);
  }
  if (req.method === "POST" && pathname === "/api/oauth/codex") {
    const payload = await startCodexOAuth(config);
    return jsonResponse(res, 200, payload);
  }
  if (req.method === "GET" && pathname === "/api/oauth/status") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const state = url.searchParams.get("state") || "";
    const payload = await getOAuthStatus(config, state);
    return jsonResponse(res, 200, payload);
  }
  return jsonResponse(res, 404, { error: "not found" });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(publicDir, safePath);
  if (!fullPath.startsWith(publicDir)) {
    return textResponse(res, 403, "forbidden");
  }
  const extension = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) return textResponse(res, 404, "not found");
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300"
    });
    createReadStream(fullPath).pipe(res);
  } catch {
    textResponse(res, 404, "not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    jsonResponse(res, statusCode, {
      error: error.message || "server error",
      details: error.details || undefined
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Codex API dashboard running at http://${HOST}:${PORT}`);
});
