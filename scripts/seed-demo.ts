// Fills a throwaway database with fictional placeholder performers so the UI can
// be tried without a StashDB key. Uses the real ingest + inference path.
//
//   DATABASE_PATH=./data/demo.db pnpm seed:demo

import { storeScene } from "../src/lib/ingest";
import type { SdbPerformer, SdbScene } from "../src/lib/stashdb";

const P = (id: string, name: string, gender: "FEMALE" | "MALE", birth: string): SdbPerformer => ({
  id, name, disambiguation: "demo", aliases: [], gender, birth_date: birth, images: [],
});

const ada = P("demo-ada", "Ada Example", "FEMALE", "1980-03-01");
const bea = P("demo-bea", "Bea Example", "FEMALE", "2001-06-12");
const cal = P("demo-cal", "Cal Example", "MALE", "1999-09-30");
const dot = P("demo-dot", "Dot Example", "FEMALE", "2002-01-20");
const eve = P("demo-eve", "Eve Example", "FEMALE", "1978-11-11");
const fin = P("demo-fin", "Fin Example", "MALE", "1975-04-04");
const gus = P("demo-gus", "Gus Example", "MALE", "2000-02-02");

let n = 0;
const scene = (title: string, cast: SdbPerformer[]): SdbScene => ({
  id: `demo-scene-${++n}`,
  title,
  details: null,
  release_date: "2024-05-01",
  updated: `2024-05-01T00:00:${String(n).padStart(2, "0")}Z`,
  studio: { name: "Demo Studio" },
  tags: [{ name: "Family Roleplay" }],
  images: [],
  performers: cast.map((performer) => ({ as: null, performer })),
});

[
  scene("Stepmom and Stepdaughter", [ada, bea]),
  scene("Stepsister Meets Stepbrother", [bea, cal]),
  scene("Mom Catches Son", [ada, cal]),
  scene("Two Stepsisters", [bea, dot]),
  scene("Aunt Visits Her Niece", [eve, dot]),
  scene("Stepdad and Stepdaughter", [fin, dot]),
  scene("Stepdad and Stepmom Get Caught", [fin, ada, gus]),
  scene("Cousins", [gus, bea]),
  scene("Untitled Group Scene", [eve, gus]),
].forEach(storeScene);

console.log(`Seeded ${n} demo scenes.`);
