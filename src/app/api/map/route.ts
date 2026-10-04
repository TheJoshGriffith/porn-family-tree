import { all } from "@/lib/db";
import { mapMinScenes } from "@/lib/maplayout";
import type { EdgeKind } from "@/lib/relations";

// Compact payload for the home-page map: positional arrays and node indexes
// instead of objects and UUIDs, which keeps a ~10k-node map to a few hundred KB.
//
//   nodes: [id, name, x, y, gender ("F" | "M" | ""), relatives][]
//   edges: [nodeIndexA, nodeIndexB, kindIndex, scenes][]   (kind = most-seen)

const KINDS: EdgeKind[] = ["parent", "grandparent", "auncle", "sibling", "spouse", "cousin"];

export async function GET() {
  const rows = all<{ id: string; name: string; x: number; y: number; gender: string | null }>(
    `SELECT p.id, p.name, l.x, l.y, p.gender FROM map_layout l
     JOIN performers p ON p.id = l.performer_id AND p.in_scope = 1`,
  );
  const index = new Map(rows.map((r, i) => [r.id, i]));

  const links = all<{ a: string; b: string; kind: EdgeKind; n: number }>(
    `SELECT min(a, b) AS a, max(a, b) AS b, kind, count(*) AS n FROM rel_scoped
     WHERE kind != 'family' GROUP BY 1, 2, 3`,
  );
  // One edge per pair, coloured by the relationship seen in the most scenes.
  const best = new Map<string, { a: number; b: number; k: number; n: number; total: number }>();
  for (const l of links) {
    const a = index.get(l.a);
    const b = index.get(l.b);
    if (a === undefined || b === undefined) continue;
    const key = `${a}:${b}`;
    const cur = best.get(key);
    if (!cur) best.set(key, { a, b, k: KINDS.indexOf(l.kind), n: l.n, total: l.n });
    else {
      cur.total += l.n;
      if (l.n > cur.n) Object.assign(cur, { k: KINDS.indexOf(l.kind), n: l.n });
    }
  }

  // Same rule as the layout: only pairs who played relatives in enough scenes.
  const min = mapMinScenes();
  for (const [key, e] of best) if (e.total < min) best.delete(key);

  const degree = new Array(rows.length).fill(0);
  for (const e of best.values()) {
    degree[e.a]++;
    degree[e.b]++;
  }

  const female = (g: string | null) => g === "FEMALE" || g === "TRANSGENDER_FEMALE";
  const male = (g: string | null) => g === "MALE" || g === "TRANSGENDER_MALE";
  return Response.json(
    {
      kinds: KINDS,
      minScenes: min,
      nodes: rows.map((r, i) => [r.id, r.name, r.x, r.y, female(r.gender) ? "F" : male(r.gender) ? "M" : "", degree[i]]),
      edges: [...best.values()].map((e) => [e.a, e.b, e.k, e.total]),
    },
    // The page requests /api/map?v=<layout version>, which changes with every
    // new layout, so a versioned response can be cached for a long time.
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
