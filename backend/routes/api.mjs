import { httpError, jsonResponse } from "../http.mjs";
import * as adminAuth from "../services/admin-auth.mjs";
import * as fail2ban from "../services/fail2ban.mjs";
import * as ipStats from "../services/ip-stats.mjs";
import { refreshQuotas } from "../services/codex-quota.mjs";

// 全部接口清单："方法 路径" → handler(req)
// /api/admin/* 除 verify 外统一在 handleApi 中校验 Bearer Token，handler 内无需再处理鉴权
const routes = {
  // Codex 额度
  "POST /api/quotas/refresh": () => refreshQuotas(),

  // 控制台登录
  "POST /api/admin/verify": async (req) => {
    const { password } = await readJsonBody(req);
    await adminAuth.verifyLogin(req, password);
    return null;
  },

  // Fail2ban：写操作完成后返回最新状态，结构与 GET status 一致
  "GET /api/admin/fail2ban/status": () => fail2ban.status(),
  "POST /api/admin/fail2ban/ban": async (req) => {
    const { ip } = await readJsonBody(req);
    await fail2ban.ban(ip);
    return fail2ban.status();
  },
  "POST /api/admin/fail2ban/unban": async (req) => {
    const { ip } = await readJsonBody(req);
    await fail2ban.unban(ip);
    return fail2ban.status();
  },
  "POST /api/admin/fail2ban/unban-all": async () => {
    await fail2ban.unbanAll();
    return fail2ban.status();
  },

  // 日志 IP 请求频次统计
  "GET /api/admin/ip-stats/latest": () => ipStats.latest(),
  "POST /api/admin/ip-stats/run": () => ipStats.run()
};

export async function handleApi(req, res, pathname) {
  const handler = routes[`${req.method} ${pathname}`];
  if (!handler) {
    throw httpError(404, "接口不存在");
  }
  if (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/verify") {
    adminAuth.requireAdmin(req);
  }
  jsonResponse(res, 200, await handler(req));
}

// 读取 JSON 请求体：空请求体视为 {}，不是 JSON 对象一律拒绝（请求体只在这里校验一次）
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        reject(httpError(413, "请求体过大"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        const body = JSON.parse(raw);
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new TypeError();
        resolve(body);
      } catch {
        reject(httpError(400, "请求体必须是 JSON 对象"));
      }
    });
    req.on("error", reject);
  });
}
