// Turns a stored call transcript (JSON turns or "Speaker: text" lines) into a list of turns.

/** One spoken turn in a call transcript. */
export interface Turn {
  speaker: string;
  content: string;
  no_audio?: boolean;
}

const SPEAKER_LINE = /^\s*(Bot|Employer|Assistant|User|Speaker\s*\d+)\s*[:-]\s*(.*)$/i;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * Reads a transcript stored as a JSON array of turns, a JSON string of one, or plain
 * "Speaker: text" lines. Lines without a speaker continue the previous turn.
 */
export function normaliseTranscript(raw: unknown): Turn[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[")) {
      try {
        return normaliseTranscript(JSON.parse(s));
      } catch {
        // Text that looks like JSON but does not parse has no readable turns.
        return [];
      }
    }
    const turns: Turn[] = [];
    for (const line of s.split(/\r?\n/)) {
      const m = line.match(SPEAKER_LINE);
      const last = turns.at(-1);
      if (m) turns.push({ speaker: m[1] ?? "", content: m[2] ?? "" });
      else if (line.trim() && last) last.content += " " + line.trim();
    }
    return turns;
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((t: unknown) => ({
    speaker: String(field(t, "speaker") ?? field(t, "role") ?? ""),
    content: String(field(t, "content") ?? field(t, "text") ?? field(t, "message") ?? ""),
    no_audio: field(t, "no_audio") === true || /no audio/i.test(String(field(t, "content") ?? "")),
  }));
}

/** Maps a raw speaker label to "Bot" or "Employer". */
export function normaliseSpeaker(s: string): "Bot" | "Employer" {
  const x = s.toLowerCase();
  if (x.includes("bot") || x.includes("assistant") || x.includes("speaker 1") || x === "1")
    return "Bot";
  return "Employer";
}
