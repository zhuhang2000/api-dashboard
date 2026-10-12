import path from "node:path";

// 1. 原生加载当前 backend 目录下的 .env
process.loadEnvFile(path.resolve(import.meta.dirname, ".env"));
// 2. 必要配置校验
const required = ["PORT", "HOST", "CPA_BASE_URL", "MANAGEMENT_KEY"];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`[Config Error] 缺少必要配置项: ${key}`);
  }
}
// 3. 导出配置
export const PORT = Number(process.env.PORT);
export const HOST = process.env.HOST;
export const CPA_BASE_URL = process.env.CPA_BASE_URL;
export const MANAGEMENT_KEY = process.env.MANAGEMENT_KEY;

// 部署相关的可选配置，未设置时使用生产环境默认值
export const FAIL2BAN_JAIL = process.env.FAIL2BAN_JAIL || "cliproxy-401";
export const IP_STATS_SCRIPT = process.env.IP_STATS_SCRIPT || "/opt/services/cli-proxy/logs/count_ips.py";
export const IP_STATS_RESULT = process.env.IP_STATS_RESULT || "/opt/services/cli-proxy/logs/result.txt";
