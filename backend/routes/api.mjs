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

export async function handleApi(req, res, pathname, config) {
  // Codex 额度刷新
  if (req.method === "POST" && pathname === "/api/quotas/refresh") {
    const payload = await refreshQuotas(config);
    return jsonResponse(res, 200, payload);
  }

  // 管理员密码验证
  if (req.method === "POST" && pathname === "/api/admin/verify") {
    const body = await readJsonBody(req);
    const inputPassword = String(body?.password || "").trim();
    const adminPassword = getAdminPassword();

    if (!adminPassword || inputPassword !== adminPassword) {
      return jsonResponse(res, 401, { error: "管理密码错误" });
    }
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

  return jsonResponse(res, 404, { error: "not found" });
}
