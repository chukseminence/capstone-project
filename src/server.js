// Build 3: the server entry point.
//
//   npm start                 # PORT defaults to 3000
//   PORT=8080 npm start       # pick a port
//
// `buildServer()` wires the router and the app together and returns a node:http
// server without starting it, so the tests can listen on a random port.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createRouter } from './http/router.js';
import { registerRoutes } from './http/routes.js';
import { createApp } from './http/app.js';

export function buildServer({ config = loadConfig() } = {}) {
  const router = createRouter();
  registerRoutes(router);

  const app = createApp({ router, publicDir: config.publicDir });
  return createServer((req, res) => {
    app(req, res);
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const config = loadConfig();
  const server = buildServer({ config });
  server.listen(config.port, () => {
    console.log(`Ticketing server listening on http://localhost:${config.port}`);
  });
}
