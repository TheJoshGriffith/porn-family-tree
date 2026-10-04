// Positions for the home-page network map. Laid out once on the server (in the
// sync job) with ForceAtlas2 so browsers only have to draw, not simulate.
//
// Only typed links between pairs who played relatives in at least
// MAP_MIN_SCENES scenes (default 2) count. Porn casting is a small world: with
// every one-off pairing included, almost everyone joins one giant hairball;
// recurring pairs split into readable families. Generic "related" links are
// left out for the same reason. Previous positions seed the next run, so the map stays
// recognisable from one sync to the next instead of reshuffling.

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { all, getDb, tx } from "./db";

/** Deterministic pseudo-random start position from an id, so runs are repeatable. */
function seed(id: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) / 2 ** 32) * Math.PI * 2;
  const r = 50 + (((h >>> 16) & 0xffff) / 0xffff) * 450;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export const mapMinScenes = () => Math.max(1, Number(process.env.MAP_MIN_SCENES ?? 2) || 2);

/** Changes whenever the layout or the threshold does; used to version the map URL. */
export function mapVersion(): string {
  const at = getDb().prepare("SELECT value FROM meta WHERE key = 'map_layout_at'").get() as { value: string } | undefined;
  return `${at?.value ?? "none"}.${mapMinScenes()}`;
}

export function computeMapLayout(): { nodes: number; edges: number; ms: number } {
  const started = Date.now();
  const pairs = all<{ a: string; b: string; n: number }>(
    `SELECT min(a, b) AS a, max(a, b) AS b, count(*) AS n FROM rel_scoped
     WHERE kind != 'family' GROUP BY 1, 2 HAVING n >= ?`,
    mapMinScenes(),
  );
  const previous = new Map(all<{ performer_id: string; x: number; y: number }>("SELECT * FROM map_layout").map((r) => [r.performer_id, r]));

  const graph = new Graph({ type: "undirected" });
  const add = (id: string) => {
    if (!graph.hasNode(id)) graph.addNode(id, previous.get(id) ?? seed(id));
  };
  for (const p of pairs) {
    add(p.a);
    add(p.b);
    graph.addEdge(p.a, p.b, { weight: p.n });
  }

  const n = graph.order;
  if (n) {
    forceAtlas2.assign(graph, {
      iterations: n < 2000 ? 600 : n < 10000 ? 300 : 150,
      getEdgeWeight: "weight",
      // Strong gravity keeps the many separate families grouped on screen
      // instead of drifting apart. Measured on real data (mean link length /
      // layout spread, lower = relatives closer): 0.019 vs 0.17 for LinLog.
      settings: { ...forceAtlas2.inferSettings(graph), strongGravityMode: true, gravity: 0.05, barnesHutOptimize: n > 500 },
    });
  }

  const insert = getDb().prepare("INSERT INTO map_layout (performer_id, x, y) VALUES (?, ?, ?)");
  tx(() => {
    getDb().exec("DELETE FROM map_layout");
    graph.forEachNode((id, a) => insert.run(id, Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10));
    // New layout -> new map URL, so cached copies of the old one are never used.
    getDb()
      .prepare("INSERT INTO meta (key, value) VALUES ('map_layout_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(new Date().toISOString());
  });
  return { nodes: n, edges: graph.size, ms: Date.now() - started };
}
