// Infers on-screen family roles for a scene's cast.
//
// StashDB tags a *scene* ("Stepmom", "Step Daughter") but never says which
// performer played which part. We recover that from the title/details/tag
// text plus each performer's gender and age at release. Everything here is
// pure so it can be unit-tested without a database or network.

export type Gender = "MALE" | "FEMALE" | null;

// Role families. gen = generation relative to the scene's "child" generation
// being -1 and the parents +1.
export type RoleFamily =
  | "parent" // mom, dad
  | "child" // son, daughter
  | "sibling" // brother, sister
  | "grandparent"
  | "grandchild"
  | "auncle" // aunt, uncle
  | "nibling" // niece, nephew
  | "cousin";

export interface RoleDef {
  key: string; // e.g. "mother"
  family: RoleFamily;
  gender: Gender; // null = gender-neutral
  gen: number;
  pattern: RegExp; // matches the bare word; "step" prefix handled separately
}

const r = (key: string, family: RoleFamily, gender: Gender, gen: number, words: string) => ({
  key,
  family,
  gender,
  gen,
  pattern: new RegExp(`\\b(step[\\s-]?)?(?:${words})s?\\b`, "gi"),
});

// Order matters only for readability; matching is independent per role.
// "wife"/"husband" are deliberately absent: they mostly appear in cheating
// scenes and would add false spouse links.
export const ROLES: RoleDef[] = [
  r("mother", "parent", "FEMALE", 1, "mom|mommy|momma|mother|mum|mummy|stepmom|stepmother|stepmum"),
  r("father", "parent", "MALE", 1, "dad|daddy|father|stepdad|stepfather"),
  r("daughter", "child", "FEMALE", -1, "daughter|stepdaughter"),
  r("son", "child", "MALE", -1, "son|stepson"),
  r("sister", "sibling", "FEMALE", 0, "sister|sis|stepsis|stepsister"),
  r("brother", "sibling", "MALE", 0, "brother|bro|stepbro|stepbrother"),
  r("grandmother", "grandparent", "FEMALE", 2, "grandma|grandmother|granny"),
  r("grandfather", "grandparent", "MALE", 2, "grandpa|grandfather|gramps"),
  r("granddaughter", "grandchild", "FEMALE", -2, "granddaughter"),
  r("grandson", "grandchild", "MALE", -2, "grandson"),
  r("aunt", "auncle", "FEMALE", 1, "aunt|auntie|aunty"),
  r("uncle", "auncle", "MALE", 1, "uncle"),
  r("niece", "nibling", "FEMALE", -1, "niece"),
  r("nephew", "nibling", "MALE", -1, "nephew"),
  r("cousin", "cousin", null, 0, "cousin"),
  r("sibling", "sibling", null, 0, "sibling|stepsibling"),
];

// Scene tags that name a family word but not a family role in the scene
// ("Daughter's Friend", "Mother In Law", "Other Person's Mom"). Dropped before
// role matching.
const NOISE_TAG = /other person|friend|in law|swapping|boss|bod\b|old (man|woman)|housewife|onēsan|twins/i;
export const roleTags = (tags: string[]) => tags.filter((t) => !NOISE_TAG.test(t));

export const ROLE_BY_KEY = new Map(ROLES.map((x) => [x.key, x]));

export interface FoundRole {
  role: RoleDef;
  step: boolean; // was any mention prefixed with "step"?
}

/** Find which family roles a block of text mentions. */
export function findRoles(text: string): FoundRole[] {
  const out: FoundRole[] = [];
  for (const role of ROLES) {
    let step = false;
    let hit = false;
    for (const m of text.matchAll(role.pattern)) {
      hit = true;
      if (m[1] || /^step/i.test(m[0])) step = true;
    }
    if (hit) out.push({ role, step });
  }
  return out;
}

export interface CastMember {
  id: string;
  gender: Gender;
  age: number | null; // age at release, null if unknown
}

// Roles one person fills per scene; never broadcast to every same-gender cast member.
const SINGULAR: ReadonlySet<RoleFamily> = new Set(["parent", "grandparent", "auncle"]);

export interface Assignment {
  performerId: string;
  role: string | null;
  step: boolean;
}

/**
 * Assign a role to each cast member.
 *
 * Per gender: one mentioned role -> everyone of that gender gets it (two
 * stepsisters), except parent-like roles, which go to the eldest only. Several roles -> order roles oldest-generation first and
 * performers oldest first, zip them, and give any extra performers the
 * youngest role (mom + two daughters). Ordering needs every age in the group;
 * without them we refuse to guess and leave the role null.
 */
export function assignRoles(cast: CastMember[], found: FoundRole[]): Assignment[] {
  const result = new Map<string, Assignment>();
  for (const c of cast) result.set(c.id, { performerId: c.id, role: null, step: false });

  for (const gender of ["FEMALE", "MALE"] as const) {
    const roles = found
      .filter((f) => f.role.gender === gender)
      .sort((a, b) => b.role.gen - a.role.gen);
    const people = cast.filter((c) => c.gender === gender);
    if (!roles.length || !people.length) continue;

    if (roles.length === 1) {
      const only = roles[0];
      // Many people can share a younger-generation role (two stepsisters), but
      // a scene's "stepdad" is one person: give it to the eldest, if knowable.
      if (people.length > 1 && SINGULAR.has(only.role.family)) {
        if (people.some((p) => p.age == null)) continue;
        const eldest = people.reduce((x, y) => (y.age! > x.age! ? y : x));
        result.set(eldest.id, { performerId: eldest.id, role: only.role.key, step: only.step });
        continue;
      }
      for (const p of people) result.set(p.id, { performerId: p.id, role: only.role.key, step: only.step });
      continue;
    }
    if (people.some((p) => p.age == null)) continue;

    const byAge = [...people].sort((a, b) => b.age! - a.age!);
    if (byAge.length < roles.length) {
      // Fewer people than roles: anchor the eldest to the oldest role and the
      // youngest to the youngest role; anyone in between takes the next role.
      byAge.forEach((p, i) => {
        const f = i === byAge.length - 1 ? roles[roles.length - 1] : roles[i];
        result.set(p.id, { performerId: p.id, role: f.role.key, step: f.step });
      });
    } else {
      byAge.forEach((p, i) => {
        const f = roles[Math.min(i, roles.length - 1)];
        result.set(p.id, { performerId: p.id, role: f.role.key, step: f.step });
      });
    }
  }

  // Gender-neutral roles (cousin) fill whoever is still unassigned.
  const neutral = found.find((f) => f.role.gender === null);
  if (neutral) {
    for (const a of result.values()) if (!a.role) { a.role = neutral.role.key; a.step = neutral.step; }
  }
  return [...result.values()];
}

// Edge kinds stored in the database. Directed kinds read "a is <kind> of b".
export type EdgeKind = "parent" | "grandparent" | "auncle" | "sibling" | "spouse" | "cousin" | "family";
export const DIRECTED: ReadonlySet<EdgeKind> = new Set(["parent", "grandparent", "auncle"]);

export interface Edge {
  a: string;
  b: string;
  kind: EdgeKind;
  step: boolean;
}

// Pairwise relation between two role families, from a's point of view.
// Missing pairs are looked up reversed; still missing -> "family".
const PAIR: Partial<Record<RoleFamily, Partial<Record<RoleFamily, EdgeKind>>>> = {
  parent: { child: "parent", sibling: "parent", grandchild: "parent", parent: "spouse", nibling: "auncle", auncle: "sibling" },
  grandparent: { child: "grandparent", sibling: "grandparent", grandchild: "grandparent", parent: "parent" },
  auncle: { child: "auncle", sibling: "auncle", nibling: "auncle", auncle: "sibling" },
  child: { child: "sibling", sibling: "sibling", nibling: "cousin", cousin: "cousin" },
  sibling: { sibling: "sibling", nibling: "cousin", cousin: "cousin" },
  nibling: { nibling: "sibling" },
  cousin: { cousin: "cousin" },
  grandchild: { grandchild: "sibling" },
};

function relate(fa: RoleFamily, fb: RoleFamily): { kind: EdgeKind; flip: boolean } {
  const fwd = PAIR[fa]?.[fb];
  if (fwd) return { kind: fwd, flip: false };
  const rev = PAIR[fb]?.[fa];
  if (rev) return { kind: rev, flip: true };
  return { kind: "family", flip: false };
}

/**
 * Build pairwise edges for one scene. Performers without a role get a
 * generic "family" link, but only in small casts so a big group scene does
 * not turn into a clique of noise.
 */
export function buildEdges(assignments: Assignment[], maxUnknownCast = 4): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const A = assignments[i];
      const B = assignments[j];
      const ra = A.role ? ROLE_BY_KEY.get(A.role) : undefined;
      const rb = B.role ? ROLE_BY_KEY.get(B.role) : undefined;
      if (!ra || !rb) {
        if (assignments.length <= maxUnknownCast) edges.push({ a: A.performerId, b: B.performerId, kind: "family", step: false });
        continue;
      }
      const { kind, flip } = relate(ra.family, rb.family);
      const step = A.step || B.step;
      edges.push(flip ? { a: B.performerId, b: A.performerId, kind, step } : { a: A.performerId, b: B.performerId, kind, step });
    }
  }
  // Undirected kinds get a canonical order so the same pair dedupes in storage.
  for (const e of edges) if (!DIRECTED.has(e.kind) && e.a > e.b) [e.a, e.b] = [e.b, e.a];
  return edges;
}

export function ageAt(birthDate: string | null, onDate: string | null): number | null {
  if (!birthDate || !onDate) return null;
  const b = new Date(birthDate);
  const d = new Date(onDate);
  if (isNaN(+b) || isNaN(+d)) return null;
  return (d.getTime() - b.getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function normaliseGender(g: string | null | undefined): Gender {
  if (g === "FEMALE" || g === "TRANSGENDER_FEMALE") return "FEMALE";
  if (g === "MALE" || g === "TRANSGENDER_MALE") return "MALE";
  return null;
}
