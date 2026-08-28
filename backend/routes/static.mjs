import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { textResponse } from "../utils/http.mjs";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

export async function serveStatic(req, res, pathname, frontDir) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(frontDir, safePath);

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
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300"
    });
    createReadStream(fullPath).pipe(res);
  } catch {
    textResponse(res, 404, "not found");
  }
}
