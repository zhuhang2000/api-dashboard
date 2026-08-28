import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = "/opt/services/cli-proxy/logs/count_ips.py";
const RESULT_PATH = "/opt/services/cli-proxy/logs/result.txt";

export function parseResultText(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let files = "";
  let timeSpan = "";
  let totalLines = 0;
  let uniqueIps = 0;
  let totalMatches = 0;
  const items = [];

  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("统计文件:")) {
      files = line.replace("统计文件:", "").trim();
    } else if (line.startsWith("时间区间:")) {
      timeSpan = line.replace("时间区间:", "").trim();
    } else if (line.startsWith("读取总行数:")) {
      totalLines = Number(line.replace(/[^0-9]/g, "")) || 0;
    } else if (line.startsWith("独立 IP 数量:")) {
      uniqueIps = Number(line.replace(/[^0-9]/g, "")) || 0;
    } else if (line.startsWith("IP 匹配总次数:")) {
      totalMatches = Number(line.replace(/[^0-9]/g, "")) || 0;
    } else if (line.startsWith("排名") && line.includes("IP 地址")) {
      inTable = true;
    } else if (inTable && line.startsWith("=")) {
      inTable = false;
    } else if (inTable && !line.startsWith("-")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const rank = Number(parts[0]);
        const ip = parts[1];
        const count = Number(parts[2].replace(/,/g, ""));
        const percentage = parts[3];
        if (!isNaN(rank) && ip) {
          items.push({
            rank,
            ip,
            count,
            percentage,
            isV6: ip.includes(":")
          });
        }
      }
    }
  }

  return {
    files,
    timeSpan,
    totalLines,
    uniqueIps,
    totalMatches,
    items,
    updatedAt: new Date().toISOString()
  };
}

export async function getLatestIpStats() {
  try {
    const info = await stat(RESULT_PATH);
    if (!info.isFile()) return null;
    const raw = await readFile(RESULT_PATH, "utf8");
    const parsed = parseResultText(raw);
    if (parsed) {
      parsed.updatedAt = info.mtime.toISOString();
    }
    return parsed;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error reading latest IP stats:", error);
    }
    return null;
  }
}

export async function executeIpStats() {
  const scriptDir = path.dirname(SCRIPT_PATH);
  await execFileAsync("python3", [SCRIPT_PATH, "-o", RESULT_PATH], {
    cwd: scriptDir,
    timeout: 30000
  });

  const raw = await readFile(RESULT_PATH, "utf8");
  return parseResultText(raw);
}
