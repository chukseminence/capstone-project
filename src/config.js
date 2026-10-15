// Build 3: configuration read from the environment, with sensible defaults.

import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3000;

export function loadConfig(env = process.env) {
  const raw = env.PORT;
  const port = raw === undefined || raw === '' ? DEFAULT_PORT : Number(raw);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }

  return {
    port,
    publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  };
}
