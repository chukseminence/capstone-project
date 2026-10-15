// Build 3: the HTTP application, built on node:http only.
//
// It does four things and nothing more:
//   1. turn a request into { params, body, query } and call the matching route,
//   2. answer unknown /api paths with a JSON 404,
//   3. answer bad JSON with a JSON 400,
//   4. serve static files from public/ without letting a path escape that folder.
//
// Every error is the same shape: {"error":{"code","message"}}. A stack trace is
// never sent to the client.

import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { DomainError } from '../domain/errors.js';

const MAX_BODY_BYTES = 1_000_000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// DomainError code -> HTTP status. One place, so handlers just throw.
const STATUS_BY_CODE = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  INVALID_STATE: 409,
  INVALID_TRANSITION: 409,
  NOT_SOLD_OUT: 409,
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new DomainError('VALIDATION', 'Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text) {
  if (!text || text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('VALIDATION', 'Request body must be valid JSON');
  }
}

function hasBody(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

async function serveStatic(req, res, publicDir, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    sendError(res, 400, 'VALIDATION', 'Malformed path');
    return true;
  }

  // resolve() strips trailing separators and collapses "..", so the guard
  // below is reliable on both Windows and POSIX.
  const root = resolve(publicDir);
  const cleaned = relative.replace(/^[/\\]+/, '');
  const target = resolve(root, cleaned === '' ? 'index.html' : cleaned);

  // Never let a path escape public/ (for example ../../etc/passwd).
  if (target !== root && !target.startsWith(root + sep)) {
    sendError(res, 403, 'FORBIDDEN', 'Path is outside the public folder');
    return true;
  }

  try {
    const data = await readFile(target);
    const type = MIME_TYPES[extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
    return true;
  } catch {
    return false;
  }
}

export function createApp({ router, publicDir }) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const { pathname } = url;

      const route = router.match(req.method, pathname);
      if (route) {
        const body = hasBody(req.method) ? parseJson(await readBody(req)) : undefined;
        const result = await route.handler({ req, res, params: route.params, body, query: url.searchParams });
        if (res.writableEnded) return;
        sendJson(res, 200, result === undefined ? null : result);
        return;
      }

      // Anything under /api that no route matched is a JSON 404.
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        sendError(res, 404, 'NOT_FOUND', `No route for ${req.method} ${pathname}`);
        return;
      }

      // Otherwise it might be a static file.
      if (await serveStatic(req, res, publicDir, pathname)) return;
      sendError(res, 404, 'NOT_FOUND', 'Not found');
    } catch (error) {
      if (error instanceof DomainError) {
        sendError(res, STATUS_BY_CODE[error.code] || 400, error.code, error.message);
        return;
      }
      // Unknown failure: log it server-side, tell the client nothing useful.
      console.error(error);
      sendError(res, 500, 'INTERNAL', 'Something went wrong');
    }
  };
}
