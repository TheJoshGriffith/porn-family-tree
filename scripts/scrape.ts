// Pulls family-roleplay scenes from StashDB into the local SQLite database and
// infers on-screen relationships between cast members.
//
//   pnpm scrape                 incremental: stops at scenes seen last run
//   pnpm scrape --full          re-walk everything
//   pnpm scrape --list-tags     show which StashDB tags would be used, then exit
//   pnpm scrape --max-pages 3   cap pages (handy for a first test)
//   pnpm scrape --reinfer       recompute roles/edges from stored scenes, no network
//   pnpm scrape --layout        recompute the home-page map layout only
//                               (every other mode does this automatically)
//   pnpm scrape --every 6h      incremental sync now, then every 6 hours (for the
//                               long-running sync container)
//   pnpm scrape --from "Lexi Lore" --limit 30
//                               crawl outward from one performer through their
//                               on-screen relatives, stopping after N people

import { getDb, tx } from "../src/lib/db";
import { inferScene, storeScene } from "../src/lib/ingest";
import { computeMapLayout } from "../src/lib/maplayout";
import { runScheduled } from "../src/lib/schedule";
import { findPerformer, scenesPage, searchTags, type SdbTag } from "../src/lib/stashdb";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const PER_PAGE = Number(process.env.STASHDB_PER_PAGE ?? 100);
const db = getDb();

const getMeta = (k: string) => (db.prepare("SELECT value FROM meta WHERE key = ?").get(k) as { value: string } | undefined)?.value;
const setMeta = (k: string, v: string) => db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);

// Tags that mark a scene as family roleplay. Searched by keyword, then kept
// only if the tag's own *name* is on this list. "Taboo" is left out: it also
// covers non-family scenes (teacher/student). Matching on aliases pulled in
// junk like "Menstrual Blood" (alias "Aunt Flo") and "Other Person's Mom".
const SEARCH_TERMS = ["incest", "family", "step", "mother", "father", "sister", "brother", "daughter", "son", "aunt", "uncle", "cousin", "grand"];
const ALLOW = /^(incest|family roleplay|step [a-z ]+|aunt|uncle|cousins?|mother|father|son|daughter|sister|brother|grand(father|mother))$/i;

async function discoverTags(): Promise<SdbTag[]> {
  const override = process.env.STASHDB_TAG_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (override?.length) return override.map((id) => ({ id, name: id, aliases: [] }));

  const found = new Map<string, SdbTag>();
  for (const term of SEARCH_TERMS) {
    for (const t of await searchTags(term)) if (ALLOW.test(t.name)) found.set(t.id, t);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function sync(): Promise<boolean> {
  if (flag("--reinfer")) {
    const ids = (db.prepare("SELECT id FROM scenes").all() as { id: string }[]).map((r) => r.id);
    tx(() => ids.forEach(inferScene));
    console.log(`Re-inferred ${ids.length} scenes.`);
    return true;
  }

  const tags = await discoverTags();
  console.log(`Using ${tags.length} tags:\n  ${tags.map((t) => `${t.name} (${t.id})`).join("\n  ")}`);
  if (flag("--list-tags")) return false;
  if (!tags.length) throw new Error("No tags found; set STASHDB_TAG_IDS manually.");

  const from = opt("--from");
  if (from) {
    await crawl(from, Number(opt("--limit") ?? 30), tags.map((t) => t.id));
    return true;
  }

  const since = flag("--full") ? undefined : getMeta("last_updated");
  const maxPages = Number(opt("--max-pages") ?? Infinity);
  let newest = since;
  let stored = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { count, scenes } = await scenesPage(tags.map((t) => t.id), page, PER_PAGE);
    if (page === 1) console.log(`${count} matching scenes on StashDB${since ? `, fetching changes since ${since}` : ""}`);
    if (!scenes.length) break;

    let reachedOld = false;
    for (const s of scenes) {
      if (since && s.updated <= since) { reachedOld = true; break; }
      storeScene(s);
      stored++;
      if (!newest || s.updated > newest) newest = s.updated;
    }
    console.log(`page ${page}: ${stored} scenes stored`);
    if (reachedOld || scenes.length < PER_PAGE) break;
  }

  // Only advance the watermark after a complete pass, so a capped or
  // interrupted run does not skip older scenes next time.
  db.exec("UPDATE performers SET in_scope = 1");
  if (newest && Number.isFinite(maxPages)) {
    console.log("Run was capped with --max-pages; watermark not advanced.");
  } else if (newest) {
    setMeta("last_updated", newest);
  }

  const totals = db.prepare("SELECT (SELECT count(*) FROM scenes) s, (SELECT count(*) FROM performers) p, (SELECT count(*) FROM relationships) r").get() as { s: number; p: number; r: number };
  console.log(`Database: ${totals.s} scenes, ${totals.p} performers, ${totals.r} relationship links.`);
  return true;
}

function relayout() {
  const { nodes, edges, ms } = computeMapLayout();
  console.log(`Map layout: ${nodes} performers, ${edges} links in ${(ms / 1000).toFixed(1)}s.`);
}

async function main() {
  if (flag("--layout")) return relayout();
  if (await sync()) relayout();
}

/**
 * Breadth-first from one performer: fetch their family-roleplay scenes, infer
 * relationships, then visit relatives (typed links before unresolved ones,
 * most shared scenes first) until `limit` people have been crawled. Co-stars
 * of the last people crawled are stored too, so they appear at the edges.
 */
async function crawl(name: string, limit: number, tagIds: string[]) {
  const seed = await findPerformer(name);
  if (!seed) throw new Error(`No StashDB performer named "${name}"`);
  console.log(`Seed: ${seed.name}${seed.disambiguation ? ` (${seed.disambiguation})` : ""} ${seed.id}`);

  const queue = [seed.id];
  const queued = new Set(queue);
  const neighbours = db.prepare(
    `SELECT CASE WHEN a = ? THEN b ELSE a END AS other,
            sum(kind != 'family') AS typed, count(*) AS n
     FROM relationships WHERE a = ? OR b = ?
     GROUP BY other ORDER BY typed DESC, n DESC`,
  );
  const nameOf = db.prepare("SELECT name FROM performers WHERE id = ?");

  const visited: string[] = [];
  for (let done = 0; queue.length && done < limit; done++) {
    const id = queue.shift()!;
    visited.push(id);
    let stored = 0;
    for (let page = 1; ; page++) {
      const { scenes } = await scenesPage(tagIds, page, PER_PAGE, id);
      scenes.forEach(storeScene);
      stored += scenes.length;
      if (scenes.length < PER_PAGE) break;
    }
    const who = (nameOf.get(id) as { name: string } | undefined)?.name ?? id;
    console.log(`[${done + 1}/${limit}] ${who}: ${stored} family-roleplay scenes`);

    for (const r of neighbours.all(id, id, id) as { other: string }[]) {
      if (!queued.has(r.other)) {
        queued.add(r.other);
        queue.push(r.other);
      }
    }
  }

  // Only the people actually crawled are shown; their other co-stars stay in
  // the database (named in cast lists) but out of search and the tree.
  db.prepare("UPDATE performers SET in_scope = (id IN (SELECT value FROM json_each(?)))").run(JSON.stringify(visited));

  const totals = db.prepare("SELECT (SELECT count(*) FROM scenes) s, (SELECT count(*) FROM performers WHERE in_scope = 1) p, (SELECT count(*) FROM rel_scoped WHERE kind != 'family') r").get() as { s: number; p: number; r: number };
  console.log(`Database: ${totals.s} scenes; showing ${totals.p} performers with ${totals.r} typed links between them.`);
}

runScheduled(main);
