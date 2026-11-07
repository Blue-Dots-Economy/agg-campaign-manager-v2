import { describe, expect, test } from "bun:test";
import {
  ExportBatchToStagingInput,
  GetExportTargetInput,
  SetExportTargetInput,
} from "../../src/lib/raya-export.functions";

describe("GetExportTargetInput", () => {
  test("accepts a registered program and refuses others", () => {
    expect(GetExportTargetInput.parse({ program: "providers" })).toEqual({ program: "providers" });
    expect(GetExportTargetInput.safeParse({ program: "x" }).success).toBe(false);
    expect(GetExportTargetInput.safeParse(undefined).success).toBe(false);
  });
});

describe("SetExportTargetInput", () => {
  test("accepts what the settings page sends", () => {
    const input = {
      program: "seekers",
      sheetUrlOrId: "https://x/d/abc",
      tabName: "Sheet1",
      label: "",
    };
    expect(SetExportTargetInput.parse(input)).toEqual(input);
  });
  test("refuses a missing sheet or wrong types", () => {
    expect(SetExportTargetInput.safeParse({ program: "seekers" }).success).toBe(false);
    expect(SetExportTargetInput.safeParse({ program: "seekers", sheetUrlOrId: 1 }).success).toBe(
      false,
    );
  });
});

describe("ExportBatchToStagingInput", () => {
  test("accepts what the campaigns page sends", () => {
    const input = { program: "seekers", batchId: "12", batchName: "B", agentName: "A" };
    expect(ExportBatchToStagingInput.parse(input)).toEqual(input);
  });
  test("refuses a missing batch id", () => {
    expect(
      ExportBatchToStagingInput.safeParse({ program: "seekers", batchId: "" }).error?.issues[0]
        ?.message,
    ).toBe("batchId required");
  });
});
