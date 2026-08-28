import { getAdminPassword } from "../config.mjs";

export function verifyAdminAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : "";
  const expectedPassword = getAdminPassword();

  if (!expectedPassword || !token || token !== expectedPassword) {
    const error = new Error("未授权访问，登录已失效");
    error.statusCode = 401;
    error.code = "TOKEN_EXPIRED";
    throw error;
  }
}

