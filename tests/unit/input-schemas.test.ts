import { describe, expect, test } from "bun:test";
import { contactSchema, programIdSchema } from "../../src/lib/input-schemas";

describe("programIdSchema", () => {
  test("accepts the registry programs", () => {
    expect(programIdSchema.parse("seekers")).toBe("seekers");
    expect(programIdSchema.parse("providers")).toBe("providers");
  });

  test("refuses other strings, inherited keys and non-strings", () => {
    expect(programIdSchema.safeParse("kkb").success).toBe(false);
    expect(programIdSchema.safeParse("toString").success).toBe(false);
    expect(programIdSchema.safeParse(1).success).toBe(false);
  });
});

describe("contactSchema", () => {
  test("accepts flat CSV cells and drops undefined values", () => {
    expect(
      contactSchema.parse({ contact_name: "A", age: 3, ok: true, x: null, y: undefined }),
    ).toEqual({ contact_name: "A", age: 3, ok: true, x: null });
  });

  test("refuses nested values", () => {
    expect(contactSchema.safeParse({ a: { b: "c" } }).success).toBe(false);
    expect(contactSchema.safeParse({ a: ["b"] }).success).toBe(false);
  });
});
