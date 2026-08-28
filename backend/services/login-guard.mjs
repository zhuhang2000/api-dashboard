import net from "node:net";
import { banFail2banIp } from "./fail2ban.mjs";

const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 分钟统计窗口

export function getClientIp(req) {
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

export function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

export function recordLoginSuccess(ip) {
  if (ip) {
    failedAttempts.delete(ip);
  }
}

export async function recordLoginFailure(ip) {
  if (!ip) {
    return { count: 1, remaining: MAX_ATTEMPTS - 1, banned: false };
  }

  const now = Date.now();
  let record = failedAttempts.get(ip);

  if (!record || now - record.lastFailedAt > WINDOW_MS) {
    record = { count: 1, firstFailedAt: now, lastFailedAt: now };
  } else {
    record.count += 1;
    record.lastFailedAt = now;
  }

  failedAttempts.set(ip, record);
  const remaining = Math.max(0, MAX_ATTEMPTS - record.count);

  if (record.count >= MAX_ATTEMPTS) {
    if (!isLoopbackIp(ip) && net.isIP(ip)) {
      try {
        await banFail2banIp(ip, "cliproxy-401");
      } catch (err) {
        console.error(`[LoginGuard] Failed to auto-ban IP ${ip}:`, err);
      }
    }
    return { count: record.count, remaining: 0, banned: true, ip };
  }

  return { count: record.count, remaining, banned: false, ip };
}
