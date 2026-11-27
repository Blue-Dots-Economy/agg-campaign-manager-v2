import { describe, expect, test } from "bun:test";
import { ResponseShapeError, UpstreamError, errorMessage, toError } from "../../src/lib/errors";

describe("toError", () => {
  test("returns an Error unchanged", () => {
    const e = new TypeError("bad");
    expect(toError(e)).toBe(e);
  });

  test("wraps a string", () => {
    const e = toError("boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("boom");
  });

  test("wraps other values and keeps them as the cause", () => {
    const e = toError({ code: 7 });
    expect(e.message).toBe("Unknown error");
    expect(e.cause).toEqual({ code: 7 });
    expect(toError(undefined).message).toBe("Unknown error");
  });
});

describe("errorMessage", () => {
  test("reads the message of an Error", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
  });

  test("returns a string as it is", () => {
    expect(errorMessage("plain")).toBe("plain");
  });

  test("falls back for anything else", () => {
    expect(errorMessage(null)).toBe("Unknown error");
    expect(errorMessage(42)).toBe("Unknown error");
  });
});

describe("UpstreamError", () => {
  test("carries the service, status, body and cause", () => {
    const cause = new Error("socket");
    const e = new UpstreamError("Raya failed", {
      service: "raya",
      status: 502,
      body: { x: 1 },
      cause,
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("UpstreamError");
    expect(e.service).toBe("raya");
    expect(e.status).toBe(502);
    expect(e.body).toEqual({ x: 1 });
    expect(e.cause).toBe(cause);
  });

  test("has no status when the call never got a response", () => {
    expect(new UpstreamError("timed out", { service: "sheets" }).status).toBeUndefined();
  });
});

describe("ResponseShapeError", () => {
  test("names the service and lists the failing paths", () => {
    const e = new ResponseShapeError("sheets", ["values.0: Expected array"]);
    expect(e.name).toBe("ResponseShapeError");
    expect(e.code).toBe("RESPONSE_SHAPE");
    expect(e.service).toBe("sheets");
    expect(e.issues).toEqual(["values.0: Expected array"]);
    expect(e.message).toContain("sheets");
  });
});
