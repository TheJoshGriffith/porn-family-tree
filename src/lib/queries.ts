import "server-only";
import { all, one } from "./db";
import type { EdgeKind } from "./relations";

export interface PerformerCard {
  id: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  image_url: string | null;
  relatives: number;
}

const CARD_COLS = `p.id, p.name, p.disambiguation, p.gender, p.image_url,
  (SELECT count(DISTINCT CASE WHEN r.a = p.id THEN r.b ELSE r.a END) FROM rel_scoped r WHERE r.a = p.id OR r.b = p.id) AS relatives`;

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => "\\" + c);

// SQLite's LIKE is already case-insensitive for ASCII.
export function searchPerformers(q: string, limit = 48): PerformerCard[] {
  const contains = `%${escapeLike(q)}%`;
  return all<PerformerCard>(
    `SELECT ${CARD_COLS} FROM performers p
     WHERE p.in_scope = 1 AND (p.name LIKE ? ESCAPE '\\'
        OR p.id IN (SELECT performer_id FROM performer_aliases WHERE alias LIKE ? ESCAPE '\\'))
     ORDER BY (p.name LIKE ? ESCAPE '\\') DESC, relatives DESC, p.name
     LIMIT ?`,
    contains,
    contains,
    `${escapeLike(q)}%`,
    limit,
  );
}

export function mostConnected(limit = 24): PerformerCard[] {
  return all<PerformerCard>(`SELECT ${CARD_COLS} FROM performers p WHERE p.in_scope = 1 ORDER BY relatives DESC, p.name LIMIT ?`, limit);
}

export function getPerformer(id: string) {
  const p = one<PerformerCard>(`SELECT ${CARD_COLS} FROM performers p WHERE p.id = ?`, id);
  if (!p) return undefined;
  const aliases = all<{ alias: string }>("SELECT alias FROM performer_aliases WHERE performer_id = ? ORDER BY alias", id).map((a) => a.alias);
  return { ...p, aliases };
}

export interface FamilyEdge {
  a: string;
  b: string;
  kind: EdgeKind;
  step: boolean;
  scenes: number;
}

export interface FamilyGraph {
  nodes: PerformerCard[];
  edges: FamilyEdge[];
}

/**
 * Relatives within `depth` hops. Generic "family" links are shown but never
 * walked through, otherwise one unresolved group scene drags in everyone.
 */
export function getFamily(focus: string, depth = 2, maxNodes = 60): FamilyGraph {
  const seen = new Set([focus]);
  const edges = new Map<string, FamilyEdge>();
  let frontier = [focus];

  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const rows = all<{ a: string; b: string; kind: EdgeKind; step: number; scenes: number }>(
        `SELECT a, b, kind, max(step) AS step, count(*) AS scenes FROM rel_scoped
         WHERE a = ? OR b = ? GROUP BY a, b, kind ORDER BY scenes DESC`,
        id,
        id,
      );
      for (const r of rows) {
        const other = r.a === id ? r.b : r.a;
        if (!seen.has(other)) {
          if (seen.size >= maxNodes) continue;
          seen.add(other);
          if (r.kind !== "family") next.push(other);
        }
        edges.set(`${r.a}|${r.b}|${r.kind}`, { a: r.a, b: r.b, kind: r.kind, step: !!r.step, scenes: r.scenes });
      }
    }
    frontier = next;
  }

  const ids = [...seen];
  const nodes = all<PerformerCard>(`SELECT ${CARD_COLS} FROM performers p WHERE p.id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return { nodes, edges: [...edges.values()] };
}

export interface SceneRow {
  id: string;
  title: string | null;
  release_date: string | null;
  studio: string | null;
  image_url: string | null;
  role: string | null;
  step: number;
  cast: { id: string; name: string; role: string | null; step: number; in_scope: number }[];
}

export function getScenes(performerId: string): SceneRow[] {
  const scenes = all<Omit<SceneRow, "cast">>(
    `SELECT s.id, s.title, s.release_date, s.studio, s.image_url, sp.role, sp.step
     FROM scene_performers sp JOIN scenes s ON s.id = sp.scene_id
     WHERE sp.performer_id = ? ORDER BY s.release_date DESC`,
    performerId,
  );
  return scenes.map((s) => ({
    ...s,
    cast: all<SceneRow["cast"][number]>(
      `SELECT p.id, p.name, sp.role, sp.step, p.in_scope FROM scene_performers sp JOIN performers p ON p.id = sp.performer_id
       WHERE sp.scene_id = ? AND sp.performer_id != ? ORDER BY p.name`,
      s.id,
      performerId,
    ),
  }));
}

export function stats() {
  return one<{ scenes: number; performers: number; links: number }>(
    "SELECT (SELECT count(*) FROM scenes) AS scenes, (SELECT count(*) FROM performers WHERE in_scope = 1) AS performers, (SELECT count(*) FROM rel_scoped WHERE kind != 'family') AS links",
  )!;
}
