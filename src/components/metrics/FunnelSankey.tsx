import { useMemo, useRef, useState, useEffect } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  type SankeyLink,
  type SankeyNode,
} from "d3-sankey";
import { dropValue, type DropRow } from "./drop-rows";
import type { KkbMetrics } from "./overview-metrics";
import { reasonColor } from "./reasonColors";

const SINK_GREY = "var(--muted-foreground)";
const TRUNK = "var(--brand)";
const TRUNK_END = "color-mix(in srgb, var(--brand) 82%, var(--foreground))";

// Which trunk node a drop stage peels off from
const STAGE_SOURCE: Record<string, string> = {
  "Profile fetch & name confirmation": "Picked up",
  "Profile completion & verification": "Engaged",
  "Identify disability type": "Profile captured",
  "Needs & challenges evaluation": "Profile captured",
  "Options delivery & decision making": "Needs captured",
  "Summary & profile update": "Needs captured",
  "Match provider": "Needs captured",
  "Connect to provider": "Providers found",
};

const fmt = (n: number) => n.toLocaleString();

type NodeIn = { name: string; kind: "trunk" | "sink"; color: string };
type LinkIn = {
  source: string;
  target: string;
  value: number;
  color: string;
  kind: "trunk" | "leak";
};
type LinkExtra = Omit<LinkIn, "source" | "target">;
type LaidOutNode = SankeyNode<NodeIn, LinkExtra>;

/** Name of a laid-out link end; d3-sankey replaces the index with the node object. */
function endName(end: SankeyLink<NodeIn, LinkExtra>["source"]): string {
  return typeof end === "object" ? end.name : "";
}

export function FunnelSankey({
  m,
  rows,
  onlyRegion,
  selectedReason,
  onSelectReason,
}: {
  m: KkbMetrics;
  rows: DropRow[];
  onlyRegion?: string;
  selectedReason?: string | null;
  onSelectReason?: (reason: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.max(360, w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { nodes, links, height, unmappedStageCount } = useMemo(() => {
    const calls = m.totalCalls;
    const picked = m.answeredCalls;
    const engaged = m.engagedCalls;
    const profileCaptured = m.profileCapturedCalls;
    const needsCaptured = m.needsCapturedCalls;
    const providersFound = m.providersFoundCalls;
    const providersConnected = m.providersConnectedCalls;

    const trunk = [
      { name: "Calls made", value: calls },
      { name: "Picked up", value: picked },
      { name: "Engaged", value: engaged },
      { name: "Profile captured", value: profileCaptured },
      { name: "Needs captured", value: needsCaptured },
      { name: "Providers found", value: providersFound },
      { name: "Providers connected", value: providersConnected },
    ];
    const survivingTrunk = trunk.filter((node, index) => index === 0 || node.value > 0);
    const survivingNames = new Set(survivingTrunk.map((node) => node.name));
    const trunkIndex = new Map(trunk.map((node, index) => [node.name, index]));
    const nearestSurviving = (name: string) => {
      const start = trunkIndex.get(name);
      if (start === undefined)
        return survivingTrunk[survivingTrunk.length - 1]?.name ?? "Calls made";
      for (let index = start; index >= 0; index -= 1) {
        const candidate = trunk[index]?.name;
        if (candidate && survivingNames.has(candidate)) return candidate;
      }
      return "Calls made";
    };

    const nodeMap = new Map<string, NodeIn>();
    const addNode = (name: string, kind: "trunk" | "sink", color: string) => {
      if (!nodeMap.has(name)) nodeMap.set(name, { name, kind, color });
    };
    const ll: LinkIn[] = [];
    const addLink = (s: string, t: string, v: number, color: string, kind: "trunk" | "leak") => {
      if (!Number.isFinite(v) || v <= 0) return;
      ll.push({ source: s, target: t, value: v, color, kind });
    };

    survivingTrunk.forEach((node) => addNode(node.name, "trunk", TRUNK));
    for (let index = 1; index < survivingTrunk.length; index += 1) {
      const source = survivingTrunk[index - 1];
      const target = survivingTrunk[index];
      if (!source || !target) continue;
      const color =
        survivingTrunk[survivingTrunk.length - 1]?.name === "Providers connected" &&
        index === survivingTrunk.length - 1
          ? TRUNK_END
          : TRUNK;
      addLink(source.name, target.name, target.value, color, "trunk");
    }

    const noPickup = Math.max(0, calls - picked);
    if (noPickup > 0) {
      addNode("No pickup", "sink", SINK_GREY);
      addLink("Calls made", "No pickup", noPickup, SINK_GREY, "leak");
    }

    const unmappedStages = new Set<string>();
    for (const r of rows) {
      const v = dropValue(r, onlyRegion);
      if (v <= 0) continue;
      const mappedSource = STAGE_SOURCE[r.stage];
      if (!mappedSource) unmappedStages.add(r.stage);
      const source = mappedSource
        ? nearestSurviving(mappedSource)
        : (survivingTrunk[survivingTrunk.length - 1]?.name ?? "Calls made");
      const color = reasonColor(r.reason);
      const sinkName = r.reason;
      addNode(sinkName, "sink", color);
      addLink(source, sinkName, v, color, "leak");
    }

    const notConnected = Math.max(0, providersFound - providersConnected);
    if (notConnected > 0) {
      addNode("Not connected", "sink", SINK_GREY);
      addLink(
        nearestSurviving("Providers found"),
        "Not connected",
        notConnected,
        SINK_GREY,
        "leak",
      );
    }

    const nodeArr = Array.from(nodeMap.values()).map((n) => ({ ...n }));
    const nameToIdx = new Map(nodeArr.map((n, i) => [n.name, i]));
    const linkArr = ll.flatMap((link) => {
      const source = nameToIdx.get(link.source);
      const target = nameToIdx.get(link.target);
      return source === undefined || target === undefined ? [] : [{ ...link, source, target }];
    });

    const sinkCount = nodeArr.filter((n) => n.kind === "sink").length;
    const h = Math.max(420, sinkCount * 36 + 80);

    const sk = sankey<NodeIn, LinkExtra>()
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

    return {
      nodes: graph.nodes,
      links: graph.links,
      height: h,
      unmappedStageCount: unmappedStages.size,
    };
  }, [m, rows, onlyRegion, width]);

  const isSelectable = (name: string) => name !== "No pickup" && name !== "Not connected";

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
          {links.map((l, i) => {
            const d = sankeyLinkHorizontal<NodeIn, LinkExtra>()(l) ?? "";
            const targetName = endName(l.target);
            const sourceName = endName(l.source);
            const baseOp = l.kind === "trunk" ? 0.45 : 0.65;
            const dim = selectedReason && targetName !== selectedReason ? 0.08 : baseOp;
            const clickable = l.kind === "leak" && isSelectable(targetName);
            return (
              <path
                // Two leaks can share source and target (one reason at two stages), so the index keeps keys unique.
                key={`${sourceName}-${targetName}-${i}`}
                className={`sk-link ${clickable ? "sk-clickable" : ""}`}
                d={d}
                fill="none"
                style={{ stroke: l.color }}
                strokeOpacity={dim}
                strokeWidth={Math.max(1, l.width ?? 1)}
                onClick={
                  clickable
                    ? () => onSelectReason?.(targetName === selectedReason ? null : targetName)
                    : undefined
                }
              >
                <title>
                  {`${sourceName} → ${targetName}: ${fmt(l.value)}${clickable ? " (click to filter)" : ""}`}
                </title>
              </path>
            );
          })}
        </g>
        <g>
          {nodes.map((n: LaidOutNode) => {
            const x = n.x0 ?? 0;
            const y = n.y0 ?? 0;
            const w = (n.x1 ?? 0) - x;
            const h = Math.max(2, (n.y1 ?? 0) - y);
            const isRight = x > width / 2;
            const labelX = isRight ? x - 6 : x + w + 6;
            const anchor = isRight ? "end" : "start";
            const labelY = y + h / 2;
            const clickable = n.kind === "sink" && isSelectable(n.name);
            const dim = selectedReason && n.kind === "sink" && n.name !== selectedReason ? 0.25 : 1;
            return (
              <g
                key={n.name}
                opacity={dim}
                className={clickable ? "sk-clickable" : undefined}
                onClick={
                  clickable
                    ? () => onSelectReason?.(n.name === selectedReason ? null : n.name)
                    : undefined
                }
              >
                <rect x={x} y={y} width={w} height={h} style={{ fill: n.color }} rx={2} />
                <text
                  x={labelX}
                  y={labelY}
                  dy="0.32em"
                  textAnchor={anchor}
                  fontSize={11}
                  fontWeight={n.name === selectedReason ? 700 : 500}
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
      {unmappedStageCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {unmappedStageCount} drop {unmappedStageCount === 1 ? "stage" : "stages"} not mapped to a
          funnel step
        </p>
      ) : null}
    </div>
  );
}
