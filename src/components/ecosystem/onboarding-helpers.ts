// Text helpers for the ecosystem onboarding tab.

/** Lower-case, hyphenated form of a name for use in a link path. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Registration link (without the scheme) for a district and organisation, with placeholders for blanks. */
export function registrationUrl(district: string, org: string): string {
  return `purpledots.in/join/${slugify(district) || "district"}/${slugify(org) || "org"}`;
}

/** Field name from a flagged-profile issue such as "Missing: Phone"; "Field" when there is none. */
export function fieldFromIssue(issue: string): string {
  const m = issue.match(/(?:Missing|Format error):\s*(.+)/i);
  return m?.[1]?.trim() ?? "Field";
}
