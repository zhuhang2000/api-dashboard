import http from "node:http";
import { loadConfig, PORT, HOST, frontDir } from "./backend/config.mjs";
import { jsonResponse } from "./backend/utils/http.mjs";
import { handleApi } from "./backend/routes/api.mjs";
import { serveStatic } from "./backend/routes/static.mjs";

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);
    const config = await loadConfig();

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname, config);
    }
    return await serveStatic(req, res, url.pathname, frontDir);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    jsonResponse(res, statusCode, {
      error: error.message || "server error",
      code: error.code || undefined,
      details: error.details || undefined
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Codex API dashboard running at http://${HOST}:${PORT}`);
});
