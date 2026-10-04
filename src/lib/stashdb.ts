// Minimal StashDB (stash-box) GraphQL client. Auth is an "ApiKey" header;
// keys come from your StashDB profile page.

const ENDPOINT = process.env.STASHDB_ENDPOINT ?? "https://stashdb.org/graphql";
const MIN_INTERVAL_MS = Number(process.env.STASHDB_MIN_INTERVAL_MS ?? 1000);

let last = 0;

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.STASHDB_API_KEY;
  if (!key) throw new Error("STASHDB_API_KEY is not set (see .env.example)");

  for (let attempt = 1; ; attempt++) {
    // Be a polite client: at most one request per MIN_INTERVAL_MS.
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ApiKey: key },
      body: JSON.stringify({ query, variables }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const backoff = 2 ** attempt * 1000;
      console.warn(`StashDB ${res.status}, retrying in ${backoff / 1000}s`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (!res.ok) throw new Error(`StashDB HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`StashDB: ${body.errors.map((e) => e.message).join("; ")}`);
    return body.data as T;
  }
}

export interface SdbTag {
  id: string;
  name: string;
  aliases: string[];
}

export interface SdbPerformer {
  id: string;
  name: string;
  disambiguation: string | null;
  aliases: string[];
  gender: string | null;
  birth_date: string | null;
  images: { url: string; width: number; height: number }[];
}

export interface SdbScene {
  id: string;
  title: string | null;
  details: string | null;
  release_date: string | null;
  updated: string;
  studio: { name: string } | null;
  tags: { name: string }[];
  images: { url: string; width: number; height: number }[];
  performers: { as: string | null; performer: SdbPerformer }[];
}

// Note: TagQueryInput.text is ignored by current StashDB (returns every tag);
// `names` searches name + aliases.
export async function searchTags(names: string): Promise<SdbTag[]> {
  const data = await gql<{ queryTags: { tags: SdbTag[] } }>(
    `query($input: TagQueryInput!) { queryTags(input: $input) { tags { id name aliases } } }`,
    { input: { names, page: 1, per_page: 100 } },
  );
  return data.queryTags.tags;
}

/**
 * Look a performer up by StashDB id or name. Despite the schema docs, quoting
 * the name returns nothing, so search loosely and prefer an exact name match,
 * then the most prolific.
 */
export async function findPerformer(nameOrId: string): Promise<{ id: string; name: string; disambiguation: string | null } | undefined> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId);
  if (isId) {
    const d = await gql<{ findPerformer: { id: string; name: string; disambiguation: string | null } | null }>(
      `query($id: ID!) { findPerformer(id: $id) { id name disambiguation } }`,
      { id: nameOrId },
    );
    return d.findPerformer ?? undefined;
  }
  const data = await gql<{ queryPerformers: { performers: { id: string; name: string; disambiguation: string | null; scene_count: number }[] } }>(
    `query($input: PerformerQueryInput!) { queryPerformers(input: $input) { performers { id name disambiguation scene_count } } }`,
    { input: { name: nameOrId, page: 1, per_page: 25 } },
  );
  const exact = (p: { name: string }) => p.name.toLowerCase() === nameOrId.toLowerCase();
  return data.queryPerformers.performers.sort((a, b) => Number(exact(b)) - Number(exact(a)) || b.scene_count - a.scene_count)[0];
}

export async function scenesPage(tagIds: string[], page: number, perPage: number, performerId?: string) {
  const data = await gql<{ queryScenes: { count: number; scenes: SdbScene[] } }>(
    `query($input: SceneQueryInput!) {
      queryScenes(input: $input) {
        count
        scenes {
          id title details release_date updated
          studio { name }
          tags { name }
          images { url width height }
          performers {
            as
            performer { id name disambiguation aliases gender birth_date images { url width height } }
          }
        }
      }
    }`,
    {
      input: {
        tags: { value: tagIds, modifier: "INCLUDES" },
        ...(performerId ? { performers: { value: [performerId], modifier: "INCLUDES" } } : {}),
        page,
        per_page: perPage,
        sort: "UPDATED_AT",
        direction: "DESC",
      },
    },
  );
  return data.queryScenes;
}

/** Smallest image that is still at least `min` px wide, else the largest. */
export function pickImage(images: { url: string; width: number }[], min = 300): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => a.width - b.width);
  return (sorted.find((i) => i.width >= min) ?? sorted[sorted.length - 1]).url;
}
