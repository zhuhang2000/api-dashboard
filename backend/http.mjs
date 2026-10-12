// 接口约定：
// - 成功：路由 handler 直接返回数据，统一以 200 输出；没有数据时返回 null
// - 失败：throw httpError(状态码, 中文提示, 错误码)，由 server.mjs 统一输出 { error, code }

export function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}
