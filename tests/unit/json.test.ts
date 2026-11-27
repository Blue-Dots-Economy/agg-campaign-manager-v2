import { describe, expect, test } from "bun:test";
import { JsonObjectSchema, JsonValueSchema } from "../../src/lib/json";

describe("JsonValueSchema", () => {
  test("accepts nested JSON and drops undefined object values", () => {
    expect(JsonValueSchema.parse({ a: [1, "x", null, { b: true, c: undefined }] })).toEqual({
      a: [1, "x", null, { b: true }],
    });
  });

  test("refuses values JSON cannot hold", () => {
    expect(JsonValueSchema.safeParse(() => 1).success).toBe(false);
    expect(JsonValueSchema.safeParse(NaN).success).toBe(false);
    expect(JsonValueSchema.safeParse({ a: Symbol("x") }).success).toBe(false);
  });

  test("JsonObjectSchema refuses arrays and scalars", () => {
    expect(JsonObjectSchema.parse({ name: "A", extra: undefined })).toEqual({ name: "A" });
    expect(JsonObjectSchema.safeParse("x").success).toBe(false);
    expect(JsonObjectSchema.safeParse(null).success).toBe(false);
  });
});
