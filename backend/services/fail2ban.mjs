import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";
import { FAIL2BAN_JAIL } from "../config.mjs";
import { httpError } from "../http.mjs";

const execFileAsync = promisify(execFile);

// 当前 jail 的封禁统计与封禁 IP 列表
export async function status() {
  try {
    const stdout = await run(["status", FAIL2BAN_JAIL]);
    const totalFailedMatch = stdout.match(/Total failed:\s*(\d+)/i);
    const currentlyBannedMatch = stdout.match(/Currently banned:\s*(\d+)/i);
    const totalBannedMatch = stdout.match(/Total banned:\s*(\d+)/i);
    const bannedListMatch = stdout.match(/Banned IP list:\s*(.*)/i);

    const bannedIps = bannedListMatch && bannedListMatch[1]
      ? bannedListMatch[1].trim().split(/\s+/).filter(Boolean)
      : [];

    return {
      jail: FAIL2BAN_JAIL,
      active: true,
      totalFailed: Number(totalFailedMatch?.[1] || 0),
      currentlyBanned: Number(currentlyBannedMatch?.[1] || bannedIps.length),
      totalBanned: Number(totalBannedMatch?.[1] || 0),
      bannedIps,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      jail: FAIL2BAN_JAIL,
      active: false,
      error: error.message,
      totalFailed: 0,
      currentlyBanned: 0,
      totalBanned: 0,
      bannedIps: [],
      updatedAt: new Date().toISOString()
    };
  }
}

export async function ban(ip) {
  await run(["set", FAIL2BAN_JAIL, "banip", validIp(ip)]);
}

export async function unban(ip) {
  await run(["set", FAIL2BAN_JAIL, "unbanip", validIp(ip)]);
}

// 一键解封：解除所有 jail（不止当前 jail）的封禁
export async function unbanAll() {
  await run(["unban", "--all"]);
}

// 执行 fail2ban-client，失败时转换为带中文提示的错误
async function run(args) {
  try {
    const { stdout } = await execFileAsync("fail2ban-client", args);
    return stdout;
  } catch (error) {
    throw httpError(500, `fail2ban 命令执行失败：${(error.stderr || error.message).trim()}`);
  }
}

// 校验外部传入的 IP（请求体、登录来源）
function validIp(ip) {
  const target = String(ip || "").trim();
  if (!isIP(target)) {
    throw httpError(400, "无效的 IP 地址格式 (仅支持合法 IPv4 或 IPv6)");
  }
  return target;
}
