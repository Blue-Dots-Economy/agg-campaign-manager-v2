const REASON_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--brand-muted)",
] as const;

const MUTED_REASON = "color-mix(in srgb, var(--muted-foreground) 45%, transparent)";

export function reasonColor(reason: string): string {
  if (reason === "Not captured" || reason === "Other") return MUTED_REASON;

  // Hash rather than index so a reason keeps its colour when filtered reasons disappear.
  let hash = 0;
  for (let i = 0; i < reason.length; i += 1) {
    hash = ((hash << 5) - hash + reason.charCodeAt(i)) | 0;
  }

  return REASON_PALETTE[Math.abs(hash) % REASON_PALETTE.length] ?? REASON_PALETTE[0];
}