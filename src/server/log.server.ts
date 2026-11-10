// Structured server logs: one JSON line per event on stdout/stderr.

/** Log level; picks the console method. */
export type LogLevel = "info" | "warn" | "error";

/** Fields of one log line. Never put personal data (phones, names, transcripts, emails, tokens) here. */
export interface LogFields {
  operation: string;
  status: "success" | "failure" | "skipped";
  /** Error or message, for failures. An Error is written as its message plus `error_type`. */
  error?: unknown;
  latency_ms?: number;
  [key: string]: unknown;
}

/** Writes one JSON log line at the given level. */
export function logEvent(level: LogLevel, fields: LogFields): void {
  const { error, ...rest } = fields;
  const line: Record<string, unknown> = { level, ...rest };
  if (error instanceof Error) {
    line.error = error.message;
    line.error_type = error.name;
  } else if (error !== undefined) {
    line.error = String(error);
  }
  console[level](JSON.stringify(line));
}
