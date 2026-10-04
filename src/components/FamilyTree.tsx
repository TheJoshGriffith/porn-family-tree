"use client";

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { KIND_COLOURS } from "@/lib/labels";
import { DROP_BY_KIND, layout, NODE_H, NODE_W } from "@/lib/layout";
import type { FamilyEdge, PerformerCard } from "@/lib/queries";
import { Avatar } from "./Avatar";

type PNode = Node<{ p: PerformerCard; focus: boolean }, "performer">;

const hidden = "!h-1 !w-1 !min-w-0 !border-0 !bg-transparent";

function PerformerNode({ data }: NodeProps<PNode>) {
  const { p, focus } = data;
  return (
    <div
      style={{ width: NODE_W, height: NODE_H }}
      className={`cursor-pointer overflow-hidden rounded-lg border bg-surface shadow-sm ${focus ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent"}`}
    >
      <Handle type="target" position={Position.Top} id="top" className={hidden} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={hidden} />
      <Handle type="source" position={Position.Right} id="right" className={hidden} />
      <Handle type="target" position={Position.Left} id="left" className={hidden} />
      <Avatar src={p.image_url} name={p.name} className="h-[150px] w-full" />
      <div className="truncate px-2 py-1.5 text-center text-xs font-medium">{p.name}</div>
    </div>
  );
}

const nodeTypes = { performer: PerformerNode };

const KIND_LABEL: Record<FamilyEdge["kind"], string> = {
  parent: "parent",
  grandparent: "grandparent",
  auncle: "aunt/uncle",
  sibling: "siblings",
  spouse: "partners",
  cousin: "cousins",
  family: "related",
};

export function FamilyTree({ focus, nodes, edges }: { focus: string; nodes: PerformerCard[]; edges: FamilyEdge[] }) {
  const router = useRouter();
  // By default only the focus's own links are drawn; with ~30 people all
  // linked to each other, drawing everything is a hairball.
  const [showAll, setShowAll] = useState(false);

  const pos = useMemo(() => layout(focus, edges), [focus, edges]);
  const { rfNodes, rfEdges } = useMemo(() => {
    const rfNodes: PNode[] = nodes
      .filter((n) => pos.has(n.id))
      .map((n) => ({ id: n.id, type: "performer", position: pos.get(n.id)!, data: { p: n, focus: n.id === focus }, draggable: true }));

    const visible = showAll ? edges : edges.filter((e) => e.a === focus || e.b === focus);
    const rfEdges: Edge[] = visible.map((e) => {
      const vertical = DROP_BY_KIND[e.kind] > 0;
      // Same-row links run left-to-right, whichever node is further left.
      const [source, target] = vertical || (pos.get(e.a)?.x ?? 0) <= (pos.get(e.b)?.x ?? 0) ? [e.a, e.b] : [e.b, e.a];
      const colour = KIND_COLOURS[e.kind];
      return {
        id: `${e.a}-${e.b}-${e.kind}`,
        source,
        target,
        sourceHandle: vertical ? "bottom" : "right",
        targetHandle: vertical ? "top" : "left",
        type: vertical ? "smoothstep" : "default",
        label: `${e.step ? "step-" : ""}${KIND_LABEL[e.kind]}${e.scenes > 1 ? ` ×${e.scenes}` : ""}`,
        labelStyle: { fontSize: 11 },
        style: {
          stroke: colour,
          strokeWidth: e.kind === "family" ? 1 : 2,
          strokeDasharray: e.kind === "family" ? "2 4" : e.step ? "6 4" : undefined,
        },
        markerEnd: vertical ? { type: MarkerType.ArrowClosed, color: colour } : undefined,
      };
    });
    return { rfNodes, rfEdges };
  }, [focus, nodes, edges, pos, showAll]);

  const others = edges.filter((e) => e.a !== focus && e.b !== focus).length;

  return (
    <div className="space-y-2">
      {others > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Also show the {others} links between these relatives
        </label>
      )}
      <div className="h-[75vh] min-h-[520px] overflow-hidden rounded-lg border border-border">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          nodesConnectable={false}
          attributionPosition="top-right"
          onNodeClick={(_, n) => n.id !== focus && router.push(`/performer/${n.id}`)}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <Legend />
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, string, string?][] = [
    ["parent / grandparent", KIND_COLOURS.parent],
    ["siblings", KIND_COLOURS.sibling],
    ["partners", KIND_COLOURS.spouse],
    ["aunt/uncle, cousins", KIND_COLOURS.auncle],
    ["step (dashed)", "var(--muted)", "6 4"],
    ["unresolved", KIND_COLOURS.family, "2 4"],
  ];
  return (
    <div className="pointer-events-none relative -mt-10 flex flex-wrap justify-end gap-3 px-3 pb-2 text-[11px] text-muted">
      {items.map(([label, colour, dash]) => (
        <span key={label} className="flex items-center gap-1">
          <svg width="18" height="4">
            <line x1="0" y1="2" x2="18" y2="2" stroke={colour} strokeWidth="2" strokeDasharray={dash} />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
