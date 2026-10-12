import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const frontDir = path.join(rootDir, "front");

function loadEnv() {
  const envFilePath = path.join(rootDir, ".env");
  let raw = "";
  try {
    raw = readFileSync(envFilePath, "utf8");
  } catch (error) {
    throw new Error(`[Config Error] 未找到配置文件: ${envFilePath}`);
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) process.env[key] = value;
  }

  // 严格校验必要字段
  const required = ["PORT", "HOST", "CPA_BASE_URL", "MANAGEMENT_KEY"];
  const missing = required.filter((k) => !process.env[k] || !process.env[k].trim());
  if (missing.length > 0) {
    throw new Error(`[Config Error] .env 文件中缺少必要配置项: ${missing.join(", ")}`);
  }

  if (Number.isNaN(Number(process.env.PORT))) {
    throw new Error(`[Config Error] PORT 必须为有效数字端口，当前为: ${process.env.PORT}`);
  }
}

loadEnv();

export const PORT = Number(process.env.PORT);
export const HOST = process.env.HOST;
export const CPA_BASE_URL = process.env.CPA_BASE_URL;
export const MANAGEMENT_KEY = process.env.MANAGEMENT_KEY;
