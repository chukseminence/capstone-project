import { securityHeaders } from "../http/securityHeaders.js";

// ROUTES layer helpers: every reply is built here, so replies always look the same.
// Errors always have this shape:  { "error": { "code": "...", "message": "..." } }

export function sendJson(req, res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

// details (optional): extra facts for the caller, like { checkedInAt } on a repeated scan.
export function sendError(req, res, status, code, message, extraHeaders = {}, details = undefined) {
  sendJson(req, res, status, { error: { code, message, ...(details ?? {}) } }, extraHeaders);
}
