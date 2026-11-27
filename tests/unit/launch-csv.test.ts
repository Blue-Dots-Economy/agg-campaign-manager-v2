import { describe, expect, test } from "bun:test";
import { detectRegion, parseLaunchCsv, regionInfo } from "@/lib/launch/csv";

describe("parseLaunchCsv", () => {
  test("splits headers and rows and trims every cell", () => {
    expect(
      parseLaunchCsv(" contact_name , contact_phone\nAsha, 9876543210 \r\nRavi,9123456780\n"),
    ).toEqual({
      headers: ["contact_name", "contact_phone"],
      rows: [
        ["Asha", "9876543210"],
        ["Ravi", "9123456780"],
      ],
    });
  });

  test("keeps blank lines inside the file and ignores surrounding whitespace", () => {
    expect(parseLaunchCsv("\n\na,b\n\nx,y\n\n")).toEqual({
      headers: ["a", "b"],
      rows: [[""], ["x", "y"]],
    });
  });

  test("returns one empty header for empty text", () => {
    expect(parseLaunchCsv("")).toEqual({ headers: [""], rows: [] });
    expect(parseLaunchCsv("   ")).toEqual({ headers: [""], rows: [] });
  });

  test("does not treat quotes specially", () => {
    expect(parseLaunchCsv('name\n"Kumar, Ravi"').rows).toEqual([['"Kumar', 'Ravi"']]);
  });
});

describe("detectRegion", () => {
  test("maps Karnataka file names to KA", () => {
    expect(detectRegion("Hubli_contacts.csv")).toEqual({
      region: "KA",
      language: "Kannada",
      city: "Hubli-Dharwad",
    });
    expect(detectRegion("KANNADA.csv").region).toBe("KA");
  });

  test("matches 'ka' anywhere in the name", () => {
    expect(detectRegion("kaam-ki-baat.csv").region).toBe("KA");
    expect(detectRegion("Lucknow-Kanpur.csv").region).toBe("KA");
  });

  test("falls back to GZB", () => {
    expect(detectRegion("ghaziabad.csv")).toEqual({
      region: "GZB",
      language: "Hindi",
      city: "Ghaziabad",
    });
    expect(detectRegion("").region).toBe("GZB");
  });
});

describe("regionInfo", () => {
  test("returns language and city for known regions", () => {
    expect(regionInfo("KA")).toEqual({ language: "Kannada", city: "Hubli-Dharwad" });
    expect(regionInfo("GZB")).toEqual({ language: "Hindi", city: "Ghaziabad" });
  });

  test("returns empty strings for an unknown or empty region", () => {
    expect(regionInfo("")).toEqual({ language: "", city: "" });
    expect(regionInfo("ka")).toEqual({ language: "", city: "" });
  });
});
