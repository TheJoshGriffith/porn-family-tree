import type { EdgeKind } from "./relations";

export interface LayoutEdge {
  a: string;
  b: string;
  kind: EdgeKind;
  scenes?: number;
}

// How many generations b sits below a for each edge kind.
export const DROP_BY_KIND: Record<EdgeKind, number> = { parent: 1, grandparent: 2, auncle: 1, sibling: 0, spouse: 0, cousin: 0, family: 0 };

/**
 * Generation of every node relative to `focus` (0). Parents are -1, children
 * +1. Roleplay graphs are full of contradictions (A is B's mom in one scene
 * and her sister in another), so we BFS outward and the shortest path wins;
 * among a node's links, the role seen in the most scenes wins.
 */
export function generations(focus: string, edges: LayoutEdge[]): Map<string, number> {
  const adj = new Map<string, { to: string; d: number }[]>();
  const add = (x: string, to: string, d: number) => {
    if (!adj.has(x)) adj.set(x, []);
    adj.get(x)!.push({ to, d });
  };
  // Prefer typed edges over generic "family" ones, then the best-attested role.
  const sorted = [...edges].sort(
    (x, y) => Number(x.kind === "family") - Number(y.kind === "family") || (y.scenes ?? 1) - (x.scenes ?? 1),
  );
  for (const e of sorted) {
    add(e.a, e.b, DROP_BY_KIND[e.kind]);
    add(e.b, e.a, -DROP_BY_KIND[e.kind]);
  }
  const gen = new Map([[focus, 0]]);
  const queue = [focus];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { to, d } of adj.get(cur) ?? []) {
      if (gen.has(to)) continue;
      gen.set(to, gen.get(cur)! + d);
      queue.push(to);
    }
  }
  return gen;
}

export const NODE_W = 150;
export const NODE_H = 190;
const GAP_X = 90;
const GAP_Y = 90;

const MAX_PER_ROW = 6;

/**
 * Rows by generation, oldest at the top, centred on x = 0. A generation with
 * more than MAX_PER_ROW people wraps onto extra rows; the focus sits in the
 * middle of the first row of its generation.
 */
export function layout(focus: string, edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const gen = generations(focus, edges);
  const byGen = new Map<number, string[]>();
  for (const [id, g] of gen) {
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(id);
  }

  const pos = new Map<string, { x: number; y: number }>();
  const place = (ids: string[], rowY: number) => {
    const width = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    ids.forEach((id, i) => pos.set(id, { x: -width / 2 + i * (NODE_W + GAP_X), y: rowY }));
  };
  const chunk = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / MAX_PER_ROW) }, (_, i) => ids.slice(i * MAX_PER_ROW, (i + 1) * MAX_PER_ROW));
  const ROW = NODE_H + GAP_Y;

  // Focus generation first, focus centred in its first row.
  const level = byGen.get(0) ?? [focus];
  const rest = level.filter((i) => i !== focus);
  const first = rest.slice(0, MAX_PER_ROW - 1);
  const half = Math.floor(first.length / 2);
  const rows0 = [[...first.slice(0, half), focus, ...first.slice(half)], ...chunk(rest.slice(MAX_PER_ROW - 1))];
  rows0.forEach((r, i) => place(r, i * ROW));

  // Younger generations stack downwards below the focus rows, older upwards.
  let y = rows0.length * ROW;
  const gens = [...byGen.keys()];
  for (const g of gens.filter((g) => g > 0).sort((a, b) => a - b)) {
    for (const r of chunk(byGen.get(g)!)) {
      place(r, y);
      y += ROW;
    }
  }
  let up = 0;
  for (const g of gens.filter((g) => g < 0).sort((a, b) => b - a)) {
    // Within an upper generation, the row nearest the focus is placed first.
    for (const r of chunk(byGen.get(g)!)) {
      up -= ROW;
      place(r, up);
    }
  }
  return pos;
}
