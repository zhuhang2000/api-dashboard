import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";

const execFileAsync = promisify(execFile);

export async function getFail2banStatus(jail = "cliproxy-401") {
  try {
    const { stdout } = await execFileAsync("fail2ban-client", ["status", jail]);
    const currentlyFailedMatch = stdout.match(/Currently failed:\s*(\d+)/i);
    const totalFailedMatch = stdout.match(/Total failed:\s*(\d+)/i);
    const currentlyBannedMatch = stdout.match(/Currently banned:\s*(\d+)/i);
    const totalBannedMatch = stdout.match(/Total banned:\s*(\d+)/i);
    const bannedListMatch = stdout.match(/Banned IP list:\s*(.*)/i);

    const bannedIps = bannedListMatch && bannedListMatch[1]
      ? bannedListMatch[1].trim().split(/\s+/).filter(Boolean)
      : [];

    return {
      jail,
      active: true,
      currentlyFailed: Number(currentlyFailedMatch?.[1] || 0),
      totalFailed: Number(totalFailedMatch?.[1] || 0),
      currentlyBanned: Number(currentlyBannedMatch?.[1] || bannedIps.length),
      totalBanned: Number(totalBannedMatch?.[1] || 0),
      bannedIps,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      jail,
      active: false,
      error: error.message || "fail2ban status unavailable",
      currentlyFailed: 0,
      totalFailed: 0,
      currentlyBanned: 0,
      totalBanned: 0,
      bannedIps: [],
      updatedAt: new Date().toISOString()
    };
  }
}

export async function banFail2banIp(ip, jail = "cliproxy-401") {
  const targetIp = String(ip || "").trim();
  if (!isIP(targetIp)) {
    const error = new Error("无效的 IP 地址格式 (仅支持合法 IPv4 或 IPv6)");
    error.statusCode = 400;
    throw error;
  }
  const { stdout, stderr } = await execFileAsync("fail2ban-client", ["set", jail, "banip", targetIp]);
  return {
    success: true,
    ip: targetIp,
    output: (stdout || stderr || "").trim()
  };
}

export async function unbanFail2banIp(ip, jail = "cliproxy-401") {
  const targetIp = String(ip || "").trim();
  if (!isIP(targetIp)) {
    const error = new Error("无效的 IP 地址格式 (仅支持合法 IPv4 或 IPv6)");
    error.statusCode = 400;
    throw error;
  }
  const { stdout, stderr } = await execFileAsync("fail2ban-client", ["set", jail, "unbanip", targetIp]);
  return {
    success: true,
    ip: targetIp,
    output: (stdout || stderr || "").trim()
  };
}

export async function unbanAllFail2ban() {
  const { stdout, stderr } = await execFileAsync("fail2ban-client", ["unban", "--all"]);
  return {
    success: true,
    output: (stdout || stderr || "").trim()
  };
}
