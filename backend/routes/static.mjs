import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

const frontDir = path.resolve(import.meta.dirname, "../../front");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

export async function serveStatic(req, res, pathname) {
  // 1. 首页映射与相对路径提取（去首斜杠）
  const relPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
  const fullPath = path.resolve(frontDir, relPath);
  // 2. 唯一必要的安全校验：如果越界跳出了 frontDir，直接 403
  if (!fullPath.startsWith(frontDir)) {
    return textResponse(res, 403, "forbidden");
  }

  const extension = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  try {
    const info = await stat(fullPath);
    if (!info.isFile()) return textResponse(res, 404, "not found");
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ["html", "js", "css"].includes(extension.replace(".", "")) ? "no-store, no-cache, must-revalidate" : "public, max-age=300"
    });
    createReadStream(fullPath).pipe(res);
  } catch {
    textResponse(res, 404, "not found");
  }
}

function textResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
