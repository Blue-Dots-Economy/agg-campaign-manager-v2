import { describe, expect, test } from "bun:test";
import {
  fieldFromIssue,
  registrationUrl,
  slugify,
} from "../../src/components/ecosystem/onboarding-helpers";

describe("slugify", () => {
  test("lower-cases, drops symbols and joins words with hyphens", () => {
    expect(slugify("  Purple Dots   Aggregator! ")).toBe("purple-dots-aggregator");
    expect(slugify("Hubli-Dharwad")).toBe("hubli-dharwad");
    expect(slugify("!!!")).toBe("");
  });
});

describe("registrationUrl", () => {
  test("uses the slugs, with placeholders when blank", () => {
    expect(registrationUrl("Ghaziabad", "Purple Dots")).toBe(
      "purpledots.in/join/ghaziabad/purple-dots",
    );
    expect(registrationUrl("", "@@")).toBe("purpledots.in/join/district/org");
  });
});

describe("fieldFromIssue", () => {
  test("reads the field after Missing or Format error", () => {
    expect(fieldFromIssue("Missing: Phone number ")).toBe("Phone number");
    expect(fieldFromIssue("format error:email")).toBe("email");
  });

  test("returns Field for other issues", () => {
    expect(fieldFromIssue("Duplicate profile")).toBe("Field");
  });
});
