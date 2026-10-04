// Consistent online snapshot of the database (safe while the site is running),
// written next to it as backups/family-<timestamp>.db. Keeps the newest N.
//
//   pnpm backup [--keep 14]

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "family.db");
const i = process.argv.indexOf("--keep");
const keep = i >= 0 ? Number(process.argv[i + 1]) : 14;

const dir = path.join(path.dirname(DB_PATH), "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(dir, `family-${stamp}.db`);

// VACUUM INTO writes a compacted, transactionally consistent copy.
getDb().prepare("VACUUM INTO ?").run(out);
console.log(`Backup written: ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

const old = fs.readdirSync(dir).filter((f) => /^family-.*\.db$/.test(f)).sort().reverse().slice(keep);
for (const f of old) fs.unlinkSync(path.join(dir, f));
if (old.length) console.log(`Removed ${old.length} old backup(s); keeping ${keep}.`);
