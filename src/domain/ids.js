
import { randomBytes, randomUUID } from "node:crypto";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newId() {
  return randomUUID();
}

export function newReference() {
  const bytes = randomBytes(8);

  let reference = "";

  for (const byte of bytes) {
    reference += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }

  return reference;
}
