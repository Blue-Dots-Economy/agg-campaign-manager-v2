import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

// Inputs the schema type does not allow are cast with `as never`: the browser can send anything.

const statuses: number[] = [];
mock.module("@tanstack/react-start/server", () => ({
  setResponseStatus: (status: number) => {
    statuses.push(status);
  },
}));

const { parseInput, INVALID_INPUT_MESSAGE } = await import("../../src/server/validation");

const schema = z.object({ program: z.enum(["seekers", "providers"]), limit: z.number().max(10) });

beforeEach(() => {
  statuses.length = 0;
});

describe("parseInput", () => {
  test("returns the parsed value for valid input", async () => {
    const validate = parseInput(schema);
    expect(await validate({ program: "seekers", limit: 3 })).toEqual({
      program: "seekers",
      limit: 3,
    });
    expect(statuses).toEqual([]);
  });

  test("drops keys the schema does not name", async () => {
    const out = await parseInput(schema)({ program: "providers", limit: 1, extra: true } as never);
    expect(out).toEqual({ program: "providers", limit: 1 });
  });

  test("applies schema defaults when the caller sends undefined", async () => {
    const optional = z.object({ program: z.string().default("seekers") }).default({});
    expect(await parseInput(optional)(undefined)).toEqual({ program: "seekers" });
  });

  test("sets status 400 and names the bad fields on invalid input", async () => {
    const validate = parseInput(schema);
    const err = await validate({ program: "other", limit: 99 } as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(statuses).toEqual([400]);
    const message = err instanceof Error ? err.message : "";
    expect(message.startsWith(INVALID_INPUT_MESSAGE)).toBe(true);
    expect(message).toContain("program");
    expect(message).toContain("limit");
  });

  test("never echoes the rejected value in the message", async () => {
    const phone = z.object({ phone: z.string().regex(/^\d{10}$/) });
    const err = await parseInput(phone)({ phone: "+91 98765 43210" }).catch((e: unknown) => e);
    const message = err instanceof Error ? err.message : "";
    expect(message).not.toContain("98765");
    expect(message).toContain("phone");
  });

  test("refuses a missing body for a schema that needs one", async () => {
    const err = await parseInput(schema)(undefined as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(statuses).toEqual([400]);
  });
});
