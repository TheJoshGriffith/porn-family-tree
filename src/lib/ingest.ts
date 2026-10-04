import { getDb, tx } from "./db";
import { ageAt, assignRoles, buildEdges, findRoles, normaliseGender, roleTags } from "./relations";
import { pickImage, type SdbScene } from "./stashdb";

// Writes StashDB scenes into SQLite and (re)derives roles and relationship edges.
// Shared by the scraper and the demo seed so both exercise the same path.

const db = getDb();

const upsertPerformer = db.prepare(`
  INSERT INTO performers (id, name, disambiguation, gender, birth_date, image_url)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, disambiguation = excluded.disambiguation,
    gender = excluded.gender, birth_date = excluded.birth_date, image_url = excluded.image_url`);
const insertAlias = db.prepare("INSERT OR IGNORE INTO performer_aliases (performer_id, alias) VALUES (?, ?)");
const upsertScene = db.prepare(`
  INSERT INTO scenes (id, title, details, release_date, studio, image_url, updated)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, details = excluded.details,
    release_date = excluded.release_date, studio = excluded.studio, image_url = excluded.image_url, updated = excluded.updated`);
const insertTag = db.prepare("INSERT OR IGNORE INTO scene_tags (scene_id, tag) VALUES (?, ?)");
const insertCast = db.prepare("INSERT OR REPLACE INTO scene_performers (scene_id, performer_id, role, step) VALUES (?, ?, ?, ?)");
const insertRel = db.prepare("INSERT OR IGNORE INTO relationships (a, b, kind, step, scene_id) VALUES (?, ?, ?, ?, ?)");

/** Re-derive roles and edges for one stored scene. */
export function inferScene(sceneId: string) {
  const scene = db.prepare("SELECT title, details, release_date FROM scenes WHERE id = ?").get(sceneId) as
    | { title: string | null; details: string | null; release_date: string | null }
    | undefined;
  if (!scene) return;
  const tags = (db.prepare("SELECT tag FROM scene_tags WHERE scene_id = ?").all(sceneId) as { tag: string }[]).map((t) => t.tag);
  const cast = db
    .prepare("SELECT p.id, p.gender, p.birth_date FROM scene_performers sp JOIN performers p ON p.id = sp.performer_id WHERE sp.scene_id = ?")
    .all(sceneId) as { id: string; gender: string | null; birth_date: string | null }[];

  const found = findRoles([scene.title, scene.details, ...roleTags(tags)].filter(Boolean).join("\n"));
  const assignments = assignRoles(
    cast.map((c) => ({ id: c.id, gender: normaliseGender(c.gender), age: ageAt(c.birth_date, scene.release_date) })),
    found,
  );

  db.prepare("DELETE FROM relationships WHERE scene_id = ?").run(sceneId);
  for (const a of assignments) insertCast.run(sceneId, a.performerId, a.role, a.step ? 1 : 0);
  for (const e of buildEdges(assignments)) insertRel.run(e.a, e.b, e.kind, e.step ? 1 : 0, sceneId);
}

export function storeScene(s: SdbScene) {
  tx(() => {
    upsertScene.run(s.id, s.title, s.details, s.release_date, s.studio?.name ?? null, pickImage(s.images, 400), s.updated);
    db.prepare("DELETE FROM scene_tags WHERE scene_id = ?").run(s.id);
    for (const t of s.tags) insertTag.run(s.id, t.name);
    db.prepare("DELETE FROM scene_performers WHERE scene_id = ?").run(s.id);
    for (const { performer: p } of s.performers) {
      upsertPerformer.run(p.id, p.name, p.disambiguation, p.gender, p.birth_date, pickImage(p.images, 300));
      for (const alias of p.aliases) insertAlias.run(p.id, alias);
      insertCast.run(s.id, p.id, null, 0);
    }
    inferScene(s.id);
  });
}

