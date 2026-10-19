// One kind of error for all "you broke a rule" problems.
// The `code` is a short label, so code can check it without reading the message.
export class DomainError extends Error {
  // details: optional extra facts to send back with the error (for example when a ticket was first used).
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
