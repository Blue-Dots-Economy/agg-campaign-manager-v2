import { describe, expect, test } from "bun:test";
import type { Participant } from "../../src/lib/purple-dots-participants";
import {
  fieldCompletion,
  filterParticipants,
  formatJoined,
  initials,
  lifecycleCounts,
} from "../../src/lib/user-level-analysis";

const breakdown = { requested: 0, accepted: 0, declined: 0, cancelled: 0 };
const participant = (o: Partial<Participant>): Participant => ({
  id: "p1",
  name: "Ravi Kumar",
  joined: "",
  lastSeen: "",
  profileCompletion: 50,
  initiated: 0,
  received: 0,
  initiatedBreakdown: breakdown,
  receivedBreakdown: breakdown,
  lifecycle: "Active",
  ...o,
});

describe("formatJoined", () => {
  test("formats ISO and US dates", () => {
    expect(formatJoined("2026-03-05")).toBe("Mar 5, 2026");
    expect(formatJoined("12/31/2025")).toBe("Dec 31, 2025");
    expect(formatJoined(" 1/2/2026 ")).toBe("Jan 2, 2026");
  });

  test("keeps other text and dashes empty values", () => {
    expect(formatJoined("")).toBe("—");
    expect(formatJoined("last week")).toBe("last week");
    expect(formatJoined("0/2/2026")).toBe("0/2/2026");
    expect(formatJoined("2026-3-5")).toBe("2026-3-5");
  });

  test("keeps the raw text for an impossible month", () => {
    expect(formatJoined("2026-13-01")).toBe("2026-13-01");
    expect(formatJoined("13/1/2026")).toBe("13/1/2026");
  });
});

describe("initials", () => {
  test("takes the first letter of the first two words", () => {
    expect(initials("ravi kumar singh")).toBe("RK");
    expect(initials("  Asha ")).toBe("A");
  });

  test("returns ? for a blank name", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("fieldCompletion", () => {
  test("counts passed checks per field", () => {
    const profiles = [
      { profileFieldChecks: [{ passed: true }, { passed: false }] },
      { profileFieldChecks: [{ passed: true }, { passed: true }] },
      { profileFieldChecks: [{ passed: false }] },
    ];
    expect(fieldCompletion(["Name", "Age"], profiles)).toEqual([
      { label: "Name", count: 2, pct: 67 },
      { label: "Age", count: 1, pct: 33 },
    ]);
  });

  test("is zero for no profiles", () => {
    expect(fieldCompletion(["Name"], [])).toEqual([{ label: "Name", count: 0, pct: 0 }]);
  });
});

describe("participants", () => {
  const list = [
    participant({ id: "a1", name: "Asha", lifecycle: "New", profileCompletion: 90 }),
    participant({ id: "b2", name: "Bina", lifecycle: "Inactive", profileCompletion: 20 }),
    participant({ id: "c3", name: "Chetan", lifecycle: "New", profileCompletion: 60 }),
  ];

  test("lifecycleCounts counts every stage", () => {
    expect(lifecycleCounts(list)).toEqual({ New: 2, Active: 0, "At Risk": 0, Inactive: 1 });
  });

  test("filterParticipants applies lifecycle, completion and search", () => {
    const ids = (f: Partial<{ search: string; lifecycle: string; minCompletion: number }>) =>
      filterParticipants(list, { search: "", lifecycle: "all", minCompletion: 0, ...f }).map(
        (p) => p.id,
      );
    expect(ids({})).toEqual(["a1", "b2", "c3"]);
    expect(ids({ lifecycle: "New" })).toEqual(["a1", "c3"]);
    expect(ids({ minCompletion: 60 })).toEqual(["a1", "c3"]);
    expect(ids({ search: " BIN " })).toEqual(["b2"]);
    expect(ids({ search: "c3" })).toEqual(["c3"]);
  });
});
