// Build 4/5: the server entry point.
//
//   npm start                 # PORT defaults to 3000
//   PORT=8080 npm start       # pick a port
//   DB_PATH=/tmp/x.db npm start
//
// `buildServer()` composes the pieces: a repository, the services that hold the
// business rules, the routes that translate HTTP, and the app. It returns a
// node:http server WITHOUT starting it, so the tests can listen on a free port
// and pass their own in-memory repository.
//
// Build 5 swaps the default repository from memory to SQLite. The services do
// not change because both repositories share the same async interface.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createRouter } from './http/router.js';
import { registerRoutes } from './http/routes.js';
import { createApp } from './http/app.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';

export function buildServer({
  config = loadConfig(),
  repository = createSqliteRepository({ path: config.dbPath }),
  paymentGateway = createMockPaymentGateway(),
} = {}) {
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, paymentGateway);

  const router = createRouter();
  registerRoutes(router, { eventService, bookingService });

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
    console.log(`Database: ${config.dbPath}`);
  });
}
