import { describe, expect, test } from "bun:test";
import { parseOverrides } from "../../src/lib/program-overrides";

describe("parseOverrides", () => {
  test("reads the stored agent id and sheet URL", () => {
    expect(parseOverrides('{"rayaAgentId":"a1","sheetCsvUrl":"https://x"}')).toEqual({
      rayaAgentId: "a1",
      sheetCsvUrl: "https://x",
    });
    expect(parseOverrides('{"rayaAgentId":"a1"}')).toEqual({ rayaAgentId: "a1" });
  });

  test("returns no overrides when nothing is stored", () => {
    expect(parseOverrides(null)).toEqual({});
  });

  test("returns no overrides for unreadable or wrongly shaped values", () => {
    expect(parseOverrides("{not json")).toEqual({});
    expect(parseOverrides('{"rayaAgentId":5}')).toEqual({});
    expect(parseOverrides("[]")).toEqual({});
  });

  test("drops unknown keys", () => {
    expect(parseOverrides('{"rayaAgentId":"a1","extra":true}')).toEqual({ rayaAgentId: "a1" });
  });
});
