import { useMemo, useRef, useState, useEffect } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";
import type { DropRow } from "./DropAnalysisTable";
import type { KkbMetrics } from "./program-overviews";

const REASON_COLORS: Record<string, string> = {
  "Hung up / disengaged": "#378ADD",
  "Not interested / declined": "#D85A30",
  "No / unclear audio": "#EF9F27",
  "Bot / tech difficulty": "#7F77DD",
  "Language barrier": "#D4537E",
  "Profile friction": "#1D9E75",
  "No matching jobs": "#639922",
  "Job mismatch (salary/location)": "#A98F5D",
  "Apply failure (API)": "#E24B4A",
  Other: "#B6B3AC",
};
const SINK_GREY = "#888780";
const TRUNK = "#7C3AED"; // brand violet
const TRUNK_END = "#6D28D9";

// Which trunk node a drop stage peels off from
const STAGE_SOURCE: Record<string, string> = {
  "Before / at greeting": "Picked up",
  "Mid-call": "Picked up",
  "Profile collection": "Engaged",
  "Job matching": "Engaged",
  "After jobs shown": "Jobs shown",
  "Apply step": "High-intent",
};

const fmt = (n: number) => n.toLocaleString();

type NodeIn = { name: string; kind: "trunk" | "sink"; color: string };
type LinkIn = { source: string; target: string; value: number; color: string; kind: "trunk" | "leak" };

export function FunnelSankey({
  m,
  rows,
  hideRegion,
  selectedReason,
  onSelectReason,
}: {
  m: KkbMetrics;
  rows: DropRow[];
  hideRegion?: "GZB" | "KA";
  selectedReason?: string | null;
  onSelectReason?: (reason: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(Math.max(360, w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { nodes, links, height } = useMemo(() => {
    const valueOf = (r: DropRow) =>
      hideRegion === "KA" ? r.gzb : hideRegion === "GZB" ? r.ka : r.total;

    const calls = m.totalCalls;
    const picked = m.answeredCalls;
    const engaged = m.engagedCalls;
    const jobs = m.jobsShownCalls;
    const intent = m.highIntentCalls;
    const applied = m.applicationsTotal;
    const submitted = m.applicationsSubmitted;
    const blocked = m.applicationsBlocked;

    const nodeMap = new Map<string, NodeIn>();
    const addNode = (name: string, kind: "trunk" | "sink", color: string) => {
      if (!nodeMap.has(name)) nodeMap.set(name, { name, kind, color });
    };
    const ll: LinkIn[] = [];
    const addLink = (s: string, t: string, v: number, color: string, kind: "trunk" | "leak") => {
      if (!Number.isFinite(v) || v <= 0) return;
      ll.push({ source: s, target: t, value: v, color, kind });
    };

    ["Calls made", "Picked up", "Engaged", "Jobs shown", "High-intent", "Applied", "Submitted"].forEach((n) =>
      addNode(n, "trunk", TRUNK),
    );

    addLink("Calls made", "Picked up", picked, TRUNK, "trunk");
    addLink("Picked up", "Engaged", engaged, TRUNK, "trunk");
    addLink("Engaged", "Jobs shown", jobs, TRUNK, "trunk");
    addLink("Jobs shown", "High-intent", intent, TRUNK, "trunk");
    addLink("High-intent", "Applied", applied, TRUNK, "trunk");
    addLink("Applied", "Submitted", submitted, TRUNK_END, "trunk");

    const noPickup = Math.max(0, calls - picked);
    if (noPickup > 0) {
      addNode("No pickup", "sink", SINK_GREY);
      addLink("Calls made", "No pickup", noPickup, SINK_GREY, "leak");
    }

    for (const r of rows) {
      const v = valueOf(r);
      if (v <= 0) continue;
      const source = STAGE_SOURCE[r.stage];
      if (!source) continue;
      const color = REASON_COLORS[r.reason] ?? REASON_COLORS.Other;
      const sinkName = r.reason;
      addNode(sinkName, "sink", color);
      addLink(source, sinkName, v, color, "leak");
    }

    const didNotApply = Math.max(0, intent - applied);
    if (didNotApply > 0) {
      addNode("Did not apply", "sink", SINK_GREY);
      addLink("High-intent", "Did not apply", didNotApply, SINK_GREY, "leak");
    }

    if (blocked > 0) {
      addNode("Apply failure", "sink", REASON_COLORS["Apply failure (API)"]);
      addLink("Applied", "Apply failure", blocked, REASON_COLORS["Apply failure (API)"], "leak");
    }

    const nodeArr = Array.from(nodeMap.values()).map((n) => ({ ...n }));
    const nameToIdx = new Map(nodeArr.map((n, i) => [n.name, i]));
    const linkArr = ll
      .map((l) => ({
        ...l,
        source: nameToIdx.get(l.source)!,
        target: nameToIdx.get(l.target)!,
      }))
      .filter((l) => l.source !== undefined && l.target !== undefined);

    const sinkCount = nodeArr.filter((n) => n.kind === "sink").length;
    const h = Math.max(420, sinkCount * 36 + 80);

    const sk = sankey<any, any>()
      .nodeWidth(14)
      .nodePadding(14)
      .nodeAlign(sankeyJustify)
      .extent([
        [8, 16],
        [width - 8, h - 16],
      ]);

    const graph = sk({
      nodes: nodeArr.map((n) => ({ ...n })),
      links: linkArr.map((l) => ({ ...l })),
    });

    return { nodes: graph.nodes, links: graph.links, height: h };
  }, [m, rows, hideRegion, width]);

  const isSelectable = (name: string) => name !== "No pickup" && name !== "Did not apply";

  return (
    <div ref={containerRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ display: "block" }}
      >
        <defs>
          <style>
            {`.sk-link{transition:opacity .15s} .sk-link:hover{opacity:.95 !important} .sk-clickable{cursor:pointer}`}
          </style>
        </defs>
        <g>
          {links.map((l: any, i: number) => {
            const d = sankeyLinkHorizontal()(l) ?? "";
            const targetName = (l.target as any).name as string;
            const sourceName = (l.source as any).name as string;
            const baseOp = l.kind === "trunk" ? 0.45 : 0.65;
            const dim = selectedReason && targetName !== selectedReason ? 0.08 : baseOp;
            const clickable = l.kind === "leak" && isSelectable(targetName);
            return (
              <path
                key={i}
                className={`sk-link ${clickable ? "sk-clickable" : ""}`}
                d={d}
                fill="none"
                stroke={l.color}
                strokeOpacity={dim}
                strokeWidth={Math.max(1, l.width ?? 1)}
                onClick={clickable ? () => onSelectReason?.(targetName === selectedReason ? null : targetName) : undefined}
              >
                <title>
                  {`${sourceName} → ${targetName}: ${fmt(l.value)}${clickable ? " (click to filter)" : ""}`}
                </title>
              </path>
            );
          })}
        </g>
        <g>
          {nodes.map((n: any, i: number) => {
            const x = n.x0;
            const y = n.y0;
            const w = n.x1 - n.x0;
            const h = Math.max(2, n.y1 - n.y0);
            const isRight = x > width / 2;
            const labelX = isRight ? x - 6 : x + w + 6;
            const anchor = isRight ? "end" : "start";
            const labelY = y + h / 2;
            const clickable = n.kind === "sink" && isSelectable(n.name);
            const dim = selectedReason && n.kind === "sink" && n.name !== selectedReason ? 0.25 : 1;
            return (
              <g
                key={i}
                opacity={dim}
                className={clickable ? "sk-clickable" : undefined}
                onClick={clickable ? () => onSelectReason?.(n.name === selectedReason ? null : n.name) : undefined}
              >
                <rect x={x} y={y} width={w} height={h} fill={n.color} rx={2} />
                <text
                  x={labelX}
                  y={labelY}
                  dy="0.32em"
                  textAnchor={anchor}
                  fontSize={11}
                  fontWeight={n.name === selectedReason ? 700 : 500}
                  fill="hsl(var(--foreground))"
                  style={{ fill: "currentColor" }}
                  className="text-foreground"
                >
                  {n.name}
                  <tspan
                    dx={6}
                    fontWeight={400}
                    className="text-muted-foreground"
                    style={{ fill: "currentColor", opacity: 0.65 }}
                  >
                    {fmt(n.value ?? 0)}
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export { REASON_COLORS as FUNNEL_REASON_COLORS };
