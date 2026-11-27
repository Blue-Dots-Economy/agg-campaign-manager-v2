// Error types and narrowing helpers shared by server and browser code.

const UNKNOWN_ERROR = "Unknown error";

/** Returns `e` when it is an Error; otherwise wraps it, keeping the original value as `cause`. */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "string") return new Error(e);
  return new Error(UNKNOWN_ERROR, { cause: e });
}

/** Returns a readable message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return UNKNOWN_ERROR;
}

/** Details of a failed call to an external service. */
export interface UpstreamErrorOptions {
  service: string;
  /** HTTP status, when the service answered. */
  status?: number;
  /** Parsed response body. May hold personal data: never log it or send it to the browser. */
  body?: unknown;
  cause?: unknown;
}

/** A call to an external service failed: an error status, a timeout or a network error. */
export class UpstreamError extends Error {
  readonly service: string;
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, options: UpstreamErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "UpstreamError";
    this.service = options.service;
    this.status = options.status;
    this.body = options.body;
  }
}

/** An external service answered with a body that does not match the expected schema. */
export class ResponseShapeError extends Error {
  readonly code = "RESPONSE_SHAPE";
  readonly service: string;
  /** Schema issues as `path: message`. */
  readonly issues: string[];

  constructor(service: string, issues: string[]) {
    super(`${service} returned an unexpected response`);
    this.name = "ResponseShapeError";
    this.service = service;
    this.issues = issues;
  }
}
