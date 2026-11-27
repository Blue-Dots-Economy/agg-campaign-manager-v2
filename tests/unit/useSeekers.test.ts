import { describe, expect, test } from "bun:test";
import { loadSeekersOrEmpty } from "../../src/hooks/useSeekers";

const meta = { name: "x.csv", uploadedAt: "", rows: 0 };

describe("loadSeekersOrEmpty", () => {
  test("returns the loaded seekers", async () => {
    const seekers = [{ phone: "1" }, { phone: "2" }];
    const load = async () => ({ seekers, meta });
    expect(await loadSeekersOrEmpty(load)).toEqual(seekers);
  });

  test("returns an empty list when loading fails", async () => {
    const load = async (): Promise<{ seekers: { phone: string }[]; meta: typeof meta }> => {
      throw new Error("offline");
    };
    expect(await loadSeekersOrEmpty(load)).toEqual([]);
  });
});
