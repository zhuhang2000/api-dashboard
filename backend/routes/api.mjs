import { jsonResponse, readJsonBody } from "../utils/http.mjs";
import { verifyAdminAuth } from "../middleware/auth.mjs";
import { getAdminPassword } from "../config.mjs";
import { refreshQuotas } from "../services/codex-quota.mjs";
import {
  getFail2banStatus,
  banFail2banIp,
  unbanFail2banIp,
  unbanAllFail2ban
} from "../services/fail2ban.mjs";
import {
  executeIpStats,
  getLatestIpStats
} from "../services/ip-analyzer.mjs";
import {
  getClientIp,
  recordLoginFailure,
  recordLoginSuccess
} from "../services/login-guard.mjs";

export async function handleApi(req, res, pathname, config) {
  // Codex 额度刷新
  if (req.method === "POST" && pathname === "/api/quotas/refresh") {
    const payload = await refreshQuotas(config);
    return jsonResponse(res, 200, payload);
  }

  // 管理员密码验证
  if (req.method === "POST" && pathname === "/api/admin/verify") {
    const clientIp = getClientIp(req);
    const body = await readJsonBody(req);
    const inputPassword = String(body?.password || "").trim();
    const adminPassword = getAdminPassword();

    if (!adminPassword || inputPassword !== adminPassword) {
      const guard = await recordLoginFailure(clientIp);
      if (guard.banned) {
        return jsonResponse(res, 403, {
          error: `密码连续错误已达 5 次，您的 IP (${clientIp}) 已被安全系统自动封禁。`,
          code: "IP_BANNED",
          banned: true,
          ip: clientIp
        });
      }
      return jsonResponse(res, 401, {
        error: `管理密码错误，剩余尝试次数：${guard.remaining} 次`,
        code: "INVALID_PASSWORD",
        remaining: guard.remaining
      });
    }

    recordLoginSuccess(clientIp);
    return jsonResponse(res, 200, { success: true, message: "验证成功" });
  }

  // 获取 Fail2ban 状态与封禁 IP 列表
  if (req.method === "GET" && pathname === "/api/admin/fail2ban/status") {
    verifyAdminAuth(req);
    const status = await getFail2banStatus("cliproxy-401");
    return jsonResponse(res, 200, status);
  }

  // 手动封禁 IP
  if (req.method === "POST" && pathname === "/api/admin/fail2ban/ban") {
    verifyAdminAuth(req);
    const body = await readJsonBody(req);
    const result = await banFail2banIp(body?.ip, "cliproxy-401");
    const status = await getFail2banStatus("cliproxy-401");
    return jsonResponse(res, 200, { ...result, status });
  }

  // 解封单个 IP
  if (req.method === "POST" && pathname === "/api/admin/fail2ban/unban") {
    verifyAdminAuth(req);
    const body = await readJsonBody(req);
    const result = await unbanFail2banIp(body?.ip, "cliproxy-401");
    const status = await getFail2banStatus("cliproxy-401");
    return jsonResponse(res, 200, { ...result, status });
  }

  // 一键解封所有 IP
  if (req.method === "POST" && pathname === "/api/admin/fail2ban/unban-all") {
    verifyAdminAuth(req);
    const result = await unbanAllFail2ban();
    const status = await getFail2banStatus("cliproxy-401");
    return jsonResponse(res, 200, { ...result, status });
  }

  // 执行 Python IP 频次统计分析
  if (req.method === "POST" && pathname === "/api/admin/ip-stats/run") {
    verifyAdminAuth(req);
    const stats = await executeIpStats();
    return jsonResponse(res, 200, stats || {});
  }

  // 获取最近一次 IP 统计分析结果
  if (req.method === "GET" && pathname === "/api/admin/ip-stats/latest") {
    verifyAdminAuth(req);
    const stats = await getLatestIpStats();
    return jsonResponse(res, 200, stats || {});
  }

  return jsonResponse(res, 404, { error: "not found" });
}
