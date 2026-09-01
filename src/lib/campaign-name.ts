// Humanize a raw campaign_type identifier for display.
// Examples:
//   KKB_Hindi_Day24            -> "KKB · Hindi · Day 24"
//   HigherEducation_Campaign_Day2 -> "Higher Education · Day 2"
//   KKB_KA_19June_HighIntent_Recall -> "KKB · KA · 19June · High Intent · Recall"
export function humanizeCampaignType(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s) return "—";

  const parts = s.split("_").filter(Boolean);
  const formatted = parts.flatMap((part) => {
    // "Day24" -> "Day 24"
    const dayMatch = part.match(/^([A-Za-z]+?)(\d+)$/);
    if (dayMatch) return [`${splitCamel(dayMatch[1])} ${dayMatch[2]}`];
    return [splitCamel(part)];
  });
  // Drop a redundant "Campaign" filler segment if it sits alone.
  const cleaned = formatted.filter((p) => p.toLowerCase() !== "campaign");
  return cleaned.join(" · ");
}

function splitCamel(s: string): string {
  // "HigherEducation" -> "Higher Education"
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}
