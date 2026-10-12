import http from "node:http";
import { PORT, HOST } from "./backend/config.mjs";
import { jsonResponse } from "./backend/http.mjs";
import { handleApi } from "./backend/routes/api.mjs";
import { serveStatic } from "./backend/routes/static.mjs";

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    // 只有 httpError 的提示会返回给前端；其他异常属于程序错误，记录日志后返回通用提示
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error(`[${req.method} ${req.url}]`, error);
    }
    jsonResponse(res, statusCode, {
      error: error.statusCode ? error.message : "服务器内部错误",
      code: error.code
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Codex API dashboard running at http://${HOST}:${PORT}`);
});
