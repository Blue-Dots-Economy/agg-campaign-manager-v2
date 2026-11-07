import { describe, expect, test } from "bun:test";
import { normaliseSpeaker, normaliseTranscript } from "@/lib/review/transcript";

describe("normaliseTranscript", () => {
  test("reads a JSON array of turns with alternative field names", () => {
    expect(
      normaliseTranscript([
        { speaker: "Bot", content: "Namaste" },
        { role: "user", text: "Haan" },
        { message: "no audio here" },
        { speaker: "bot", content: "", no_audio: true },
      ]),
    ).toEqual([
      { speaker: "Bot", content: "Namaste", no_audio: false },
      { speaker: "user", content: "Haan", no_audio: false },
      { speaker: "", content: "no audio here", no_audio: false },
      { speaker: "bot", content: "", no_audio: true },
    ]);
  });

  test("flags turns whose content says no audio", () => {
    expect(normaliseTranscript([{ speaker: "User", content: "[No Audio]" }])).toEqual([
      { speaker: "User", content: "[No Audio]", no_audio: true },
    ]);
  });

  test("parses a JSON string of turns", () => {
    expect(normaliseTranscript(' [{"speaker":"Bot","content":"Hi"}] ')).toEqual([
      { speaker: "Bot", content: "Hi", no_audio: false },
    ]);
  });

  test("reads speaker lines and joins continuation lines", () => {
    const text = "Bot: Hello\r\nthere\nEmployer - Yes\n\nSpeaker 2: ok\nnot a speaker line";
    expect(normaliseTranscript(text)).toEqual([
      { speaker: "Bot", content: "Hello there" },
      { speaker: "Employer", content: "Yes" },
      { speaker: "Speaker 2", content: "ok not a speaker line" },
    ]);
  });

  test("drops text before the first speaker line", () => {
    expect(normaliseTranscript("intro\nUser: hi")).toEqual([{ speaker: "User", content: "hi" }]);
  });

  test("returns no turns for empty, broken JSON or unknown shapes", () => {
    expect(normaliseTranscript("")).toEqual([]);
    expect(normaliseTranscript(null)).toEqual([]);
    expect(normaliseTranscript("[not json")).toEqual([]);
    expect(normaliseTranscript({ speaker: "Bot" })).toEqual([]);
    expect(normaliseTranscript(42)).toEqual([]);
  });
});

describe("normaliseSpeaker", () => {
  test("maps bot-like labels to Bot", () => {
    for (const s of ["Bot", "assistant", "Speaker 1", "1", "chatbot"]) {
      expect(normaliseSpeaker(s)).toBe("Bot");
    }
  });

  test("maps everything else to Employer", () => {
    for (const s of ["User", "Employer", "Speaker 2", "", "11"]) {
      expect(normaliseSpeaker(s)).toBe("Employer");
    }
  });
});

describe("speaker lines", () => {
  const cases: [string, { speaker: string; content: string }[]][] = [
    ["Bot: hello", [{ speaker: "Bot", content: "hello" }]],
    ["  user -  hi there", [{ speaker: "user", content: "hi there" }]],
    ["Speaker 2: yes", [{ speaker: "Speaker 2", content: "yes" }]],
    ["Speaker  12 - ok", [{ speaker: "Speaker  12", content: "ok" }]],
    ["Speaker3:x", [{ speaker: "Speaker3", content: "x" }]],
    ["ASSISTANT :  spaced  ", [{ speaker: "ASSISTANT", content: "spaced" }]],
    ["Employer:", [{ speaker: "Employer", content: "" }]],
    ["Botanist: not a speaker", []],
    ["Speaker: missing number", []],
  ];
  for (const [line, turns] of cases) {
    test(`reads ${JSON.stringify(line)}`, () => {
      expect(
        normaliseTranscript(line).map((t) => ({ speaker: t.speaker, content: t.content })),
      ).toEqual(turns.map((t) => ({ speaker: t.speaker, content: t.content })));
    });
  }

  test("handles a very long line without a separator quickly", () => {
    const line = "Speaker 1" + " ".repeat(50_000) + "x";
    const start = performance.now();
    expect(normaliseTranscript(line)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
