// Shared, pure validation helpers. Both the Build 1 domain rules and the Build 4
// services use these, so the rules are written once. They throw a DomainError
// with the code VALIDATION.

import { DomainError } from './errors.js';

export const MAX_TICKETS_PER_BOOKING = 10;

export function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

export function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export function requireValidDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', `${field} must be a valid date`);
  }
  return date;
}

export function requireQuantity(value, max = MAX_TICKETS_PER_BOOKING) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${max}`);
  }
  return value;
}
