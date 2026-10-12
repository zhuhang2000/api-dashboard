import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { IP_STATS_SCRIPT, IP_STATS_RESULT } from "../config.mjs";
import { httpError } from "../http.mjs";

const execFileAsync = promisify(execFile);

// 最近一次统计结果；从未运行过（结果文件不存在）时返回 null
export async function latest() {
  try {
    return await readResult();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// 运行统计脚本并返回新的统计结果
export async function run() {
  try {
    await execFileAsync("python3", [IP_STATS_SCRIPT, "-o", IP_STATS_RESULT], {
      cwd: path.dirname(IP_STATS_SCRIPT),
      timeout: 30000
    });
  } catch (error) {
    throw httpError(500, `IP 统计脚本执行失败：${(error.stderr || error.message).trim()}`);
  }
  return readResult();
}

// 读取并解析结果文件，更新时间取结果文件的修改时间
async function readResult() {
  const [text, info] = await Promise.all([readFile(IP_STATS_RESULT, "utf8"), stat(IP_STATS_RESULT)]);
  return { ...parseResult(text), updatedAt: info.mtime.toISOString() };
}

// 解析 count_ips.py 输出的文本报告
function parseResult(text) {
  let timeSpan = "";
  let totalLines = 0;
  let uniqueIps = 0;
  let totalMatches = 0;
  const items = [];

  let inTable = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("时间区间:")) {
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

  return { timeSpan, totalLines, uniqueIps, totalMatches, items };
}
