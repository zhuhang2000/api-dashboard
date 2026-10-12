import net from "node:net";
import { MANAGEMENT_KEY } from "../config.mjs";
import { httpError } from "../http.mjs";
import * as fail2ban from "./fail2ban.mjs";

// 控制台登录防暴力破解：15 分钟内连续输错 5 次，自动封禁来源 IP
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

// 控制台登录：校验 MANAGEMENT_KEY，输错时计数，达到上限后封禁来源 IP
export async function verifyLogin(req, password) {
  const ip = getClientIp(req);
  if (String(password || "").trim() === MANAGEMENT_KEY) {
    failedAttempts.delete(ip);
    return;
  }

  const remaining = await recordFailure(ip);
  if (remaining === 0) {
    throw httpError(403, `MANAGEMENT_KEY 连续错误已达 ${MAX_ATTEMPTS} 次，您的 IP (${ip}) 已被安全系统自动封禁。`, "IP_BANNED");
  }
  throw httpError(401, `MANAGEMENT_KEY 错误，剩余尝试次数：${remaining} 次`, "INVALID_PASSWORD");
}

// 受保护接口鉴权：请求头需携带 Authorization: Bearer <MANAGEMENT_KEY>
export function requireAdmin(req) {
  const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : "";
  if (token !== MANAGEMENT_KEY) {
    throw httpError(401, "未授权访问，登录已失效", "TOKEN_EXPIRED");
  }
}

function getClientIp(req) {
  const xRealIp = req.headers["x-real-ip"];
  if (xRealIp && net.isIP(String(xRealIp).trim())) {
    return String(xRealIp).trim();
  }

  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor) {
    const first = String(xForwardedFor).split(",")[0].trim();
    if (net.isIP(first)) return first;
  }

  const remoteAddress = req.socket?.remoteAddress || "";
  return remoteAddress.replace(/^::ffff:/, "");
}

function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

// 记录一次登录失败并返回剩余尝试次数；返回 0 表示已达上限（本机地址不会被封禁）
async function recordFailure(ip) {
  if (!ip) return MAX_ATTEMPTS - 1;

  const now = Date.now();
  let record = failedAttempts.get(ip);
  if (!record || now - record.lastFailedAt > WINDOW_MS) {
    record = { count: 1, lastFailedAt: now };
  } else {
    record.count += 1;
    record.lastFailedAt = now;
  }
  failedAttempts.set(ip, record);

  if (record.count < MAX_ATTEMPTS) {
    return MAX_ATTEMPTS - record.count;
  }

  if (!isLoopbackIp(ip) && net.isIP(ip)) {
    try {
      await fail2ban.ban(ip);
    } catch (err) {
      console.error(`[LoginGuard] Failed to auto-ban IP ${ip}:`, err);
    }
  }
  return 0;
}
