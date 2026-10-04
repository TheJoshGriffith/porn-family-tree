# Family Tree

Maps the on-screen family roleplay ("stepmom", "stepsister", …) between adult performers using [StashDB](https://stashdb.org) metadata, and draws it as a family tree.

The relationships are fictional roles, inferred automatically. They are not real family ties.

## Stack

- **Next.js 16** (App Router, server components): the pages read SQLite directly.
- **SQLite** through Node's built-in `node:sqlite`, so there are no native modules. Needs **Node ≥ 22.13** (`.nvmrc`).
- **React Flow** (`@xyflow/react`) for the tree canvas, with a custom generation-row layout.
- **Tailwind v4**. Theme and NSFW state live in `data-*` attributes on `<html>`, set by an inline script before first paint.

## Setup

```bash
nvm use
pnpm install
cp .env.example .env.local   # add STASHDB_API_KEY
pnpm scrape --list-tags      # check which tags will be used
pnpm scrape --from "Lexi Lore" --limit 30   # crawl outward from one performer
pnpm dev
```

`--from` (a name or StashDB performer id) visits that performer and then their on-screen relatives, breadth-first, until `--limit` people have been visited. Only those people show in search and the tree. Their other co-stars are stored but appear only as plain names in scene cast lists.

To pull *every* family-roleplay scene on StashDB instead (tens of thousands of scenes, slow at 1 request/second):

```bash
pnpm scrape                  # full run; later runs are incremental
pnpm scrape --max-pages 2    # or just a sample
```

Without a key you can try the UI on made-up placeholder data:

```bash
DATABASE_PATH=./data/demo.db pnpm seed:demo
DATABASE_PATH=./data/demo.db pnpm dev
```

## How relationships are inferred

StashDB tags whole scenes but never says *which* performer played which role, so `src/lib/relations.ts` reconstructs it:

1. **Find scenes.** Discover family-roleplay tags (`Incest`, `Family Roleplay`, `Step Mother`, …) by name, from a strict allowlist. Then pull scenes carrying any of them. Tags that name a relative who isn't in the scene ("Daughter's Friend", "Mother In Law") are ignored when guessing roles.
2. **Find roles.** Match role words (mom, stepdaughter, aunt, …) in the title, description and tags. A "step" prefix is noted.
3. **Assign roles** per gender, using each performer's age at release:
   - When the scene names one role for a gender, everyone of that gender gets it (two stepsisters). The exception is parent-like roles, which go to the eldest only.
   - When it names several roles, the oldest performer gets the oldest role. If anyone's age is unknown we don't guess.
4. **Build edges** between cast members from their role pair: parent, grandparent, aunt/uncle, sibling, partner or cousin. When roles can't be resolved in a small cast (4 or fewer), the performers get a generic "related" link.

Re-run inference over stored scenes after changing the rules:

```bash
pnpm scrape --reinfer
```

The home page also has a **map of recurring families**: everyone who has played relatives with the same partner in 2+ scenes (`MAP_MIN_SCENES`), drawn with sigma.js (WebGL). Positions are computed with ForceAtlas2 by the scraper after every sync (`pnpm scrape --layout` to redo just that), so browsers only draw. One-off pairings are left out deliberately. Porn casting is a small world: with every pairing included, almost everyone joins one giant hairball.

Contradictions are normal: A can be B's stepmom in one scene and her stepsister in another. Every edge is kept with its scene count. The tree layout places each person at the generation reached by the shortest path from whoever you're viewing.

## Deploying

Docker + Compose, published through a Cloudflare Tunnel (no open ports). See **[DEPLOY.md](DEPLOY.md)**.

## Scripts

| | |
|---|---|
| `pnpm scrape` | incremental StashDB sync (`--full`, `--max-pages N`, `--list-tags`, `--reinfer`) |
| `pnpm backup` | snapshot the database to `data/backups/` (keeps 14) |
| `pnpm test` | unit tests for role inference and layout |
| `pnpm typecheck` / `pnpm lint` | |

## Licence

MIT. Performer and scene metadata comes from StashDB and is not part of this repository.
