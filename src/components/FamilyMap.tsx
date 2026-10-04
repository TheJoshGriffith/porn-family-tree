"use client";

// Home-page network map of every performer, drawn with sigma (WebGL) from the
// positions the sync job precomputes (lib/maplayout.ts). Names and dots only,
// so it is unaffected by the NSFW filter and regional image rules.
//
// Pointer: hover highlights someone's relatives, click opens their profile.
// Touch has no hover, so the first tap highlights and a second tap opens.

import type Graph from "graphology";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type Sigma from "sigma";
import type { NodeHoverDrawingFunction } from "sigma/rendering";

type Payload = {
  kinds: string[];
  minScenes: number;
  nodes: [id: string, name: string, x: number, y: number, gender: string, relatives: number][];
  edges: [a: number, b: number, kind: number, scenes: number][];
};

const EDGE_VAR: Record<string, string> = {
  parent: "--edge-parent",
  grandparent: "--edge-parent",
  auncle: "--edge-auncle",
  cousin: "--edge-auncle",
  sibling: "--edge-sibling",
  spouse: "--edge-spouse",
};

type Palette = ReturnType<typeof palette>;

// WebGL can't read CSS variables, so resolve the theme tokens to real colours
// (and again whenever the theme flips).
function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    fg: v("--fg"),
    surface: v("--surface"),
    border: v("--border"),
    dim: v("--map-dim"),
    node: { F: v("--map-f"), M: v("--map-m"), "": v("--map-o") } as Record<string, string>,
    edge: Object.fromEntries(Object.entries(EDGE_VAR).map(([k, name]) => [k, v(name)])),
  };
}

function alpha(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const hoverLabel =
  (colors: () => Palette): NodeHoverDrawingFunction =>
  (ctx, d, settings) => {
    const c = colors();
    const size = settings.labelSize;
    const label = d.label ?? "";
    ctx.font = `600 ${size}px ${settings.labelFont}`;
    const w = ctx.measureText(label).width;
    const x = d.x + d.size + 6;
    ctx.fillStyle = c.surface;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 5, d.y - size / 2 - 5, w + 10, size + 10, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.fg;
    ctx.fillText(label, x, d.y + size / 3);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size + 2, 0, Math.PI * 2);
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

export function FamilyMap({ version }: { version: string }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "empty" | "ready" | "error">("loading");
  const [count, setCount] = useState(0);
  const [minScenes, setMinScenes] = useState(2);

  useEffect(() => {
    let cancelled = false;
    let sigma: Sigma | undefined;
    let observer: MutationObserver | undefined;

    (async () => {
      // sigma touches window/WebGL at import time, so load it in the browser only.
      const [{ default: SigmaCtor }, { default: GraphCtor }, res] = await Promise.all([
        import("sigma"),
        import("graphology"),
        fetch(`/api/map?v=${encodeURIComponent(version)}`),
      ]);
      if (!res.ok) throw new Error(`map ${res.status}`);
      const data = (await res.json()) as Payload;
      if (cancelled || !box.current) return;
      if (!data.nodes.length) return setStatus("empty");

      const graph: Graph = new GraphCtor({ type: "undirected" });
      for (const [id, name, x, y, gender, relatives] of data.nodes) {
        graph.addNode(id, { x, y, label: name, gender, size: Math.min(12, 3.5 + Math.sqrt(relatives) * 1.2) });
      }
      for (const [a, b, k, scenes] of data.edges) {
        graph.addEdge(data.nodes[a][0], data.nodes[b][0], { kind: data.kinds[k], size: Math.min(2.5, 0.3 + Math.log2(scenes + 1) * 0.3) });
      }

      let colors = palette();
      let focus: string | null = null; // hovered (pointer) or tapped (touch)
      let near = new Set<string>();
      const setFocus = (node: string | null) => {
        focus = node;
        near = new Set(node ? graph.neighbors(node) : []);
        sigma?.refresh({ skipIndexation: true });
      };

      sigma = new SigmaCtor(graph, box.current, {
        hideEdgesOnMove: true,
        renderEdgeLabels: false,
        labelRenderedSizeThreshold: 7,
        labelFont: "system-ui, -apple-system, sans-serif",
        labelColor: { color: colors.fg },
        zIndex: true,
        minCameraRatio: 0.03,
        maxCameraRatio: 3,
        defaultDrawNodeHover: hoverLabel(() => colors),
        nodeReducer: (node, attr) => {
          const lit = focus !== null && (node === focus || near.has(node));
          if (focus && !lit) return { ...attr, color: colors.dim, label: "", zIndex: 0 };
          return { ...attr, color: colors.node[attr.gender] ?? colors.node[""], zIndex: lit ? 1 : 0, forceLabel: lit };
        },
        edgeReducer: (edge, attr) => {
          const colour = colors.edge[attr.kind] ?? colors.dim;
          if (!focus) return { ...attr, color: alpha(colour, 0.25) };
          return graph.hasExtremity(edge, focus) ? { ...attr, color: colour, size: attr.size + 1 } : { ...attr, hidden: true };
        },
      });

      sigma.on("enterNode", ({ node }) => {
        setFocus(node);
        box.current!.style.cursor = "pointer";
      });
      sigma.on("leaveNode", () => {
        setFocus(null);
        box.current!.style.cursor = "";
      });
      sigma.on("clickNode", ({ node }) => (node === focus ? router.push(`/performer/${node}`) : setFocus(node)));
      sigma.on("clickStage", () => setFocus(null));

      observer = new MutationObserver(() => {
        colors = palette();
        sigma?.setSetting("labelColor", { color: colors.fg });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      setCount(data.nodes.length);
      setMinScenes(data.minScenes);
      setStatus("ready");
    })().catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
      observer?.disconnect();
      sigma?.kill();
    };
  }, [router, version]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Recurring families</h2>
          <p className="text-xs text-muted">Performers who&apos;ve played relatives in {minScenes}+ scenes together</p>
        </div>
        <p className="text-xs text-muted">
          {status === "ready" && `${count.toLocaleString()} performers · `}
          <span className="hidden sm:inline">hover to see relatives, click to open</span>
          <span className="sm:hidden">tap to see relatives, tap again to open</span>
        </p>
      </div>
      <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-lg border border-border bg-surface">
        <div ref={box} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
            {status === "loading" && "Drawing the map…"}
            {status === "empty" && "The map appears after the first sync finishes."}
            {status === "error" && "The map couldn't be loaded."}
          </div>
        )}
        <MapLegend />
      </div>
    </section>
  );
}

function MapLegend() {
  const items: [string, string][] = [
    ["parent", "var(--edge-parent)"],
    ["siblings", "var(--edge-sibling)"],
    ["partners", "var(--edge-spouse)"],
    ["aunt/uncle, cousins", "var(--edge-auncle)"],
  ];
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded bg-surface/80 px-2 py-1 text-[11px] text-muted">
      {items.map(([label, colour]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3" style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  );
}
