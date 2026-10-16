// Build 3: configuration read from the environment, with sensible defaults.
// Build 5 adds the SQLite database path.

import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = fileURLToPath(new URL('../data/ticketing.db', import.meta.url));

export function loadConfig(env = process.env) {
  const raw = env.PORT;
  const port = raw === undefined || raw === '' ? DEFAULT_PORT : Number(raw);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }

  const dbPath = env.DB_PATH && env.DB_PATH.trim() !== '' ? env.DB_PATH : DEFAULT_DB_PATH;

  return {
    port,
    dbPath,
    publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  };
}
