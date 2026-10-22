
export class DomainError extends Error {
  constructor(message, code = "DOMAIN_ERROR") {
    super(message);

    this.name = "DomainError";
    this.code = code;
  }
}
