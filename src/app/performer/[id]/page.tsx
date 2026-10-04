import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FamilyTree } from "@/components/FamilyTree";
import { relativeLabel } from "@/lib/labels";
import { getFamily, getPerformer, getScenes } from "@/lib/queries";
import { ROLE_BY_KEY } from "@/lib/relations";

export async function generateMetadata({ params }: PageProps<"/performer/[id]">) {
  const p = getPerformer((await params).id);
  return { title: p ? `${p.name} · Family Tree` : "Not found" };
}

const roleText = (role: string | null, step: number) => (role ? `${step ? "step" : ""}${ROLE_BY_KEY.get(role)?.key ?? role}` : "role unknown");

export default async function PerformerPage({ params }: PageProps<"/performer/[id]">) {
  const { id } = await params;
  const p = getPerformer(id);
  if (!p) notFound();

  const family = getFamily(id);
  const scenes = getScenes(id);
  const byId = new Map(family.nodes.map((n) => [n.id, n]));

  // Direct relatives, described from this performer's point of view.
  const direct = family.edges
    .filter((e) => e.a === id || e.b === id)
    .map((e) => {
      const otherId = e.a === id ? e.b : e.a;
      const other = byId.get(otherId)!;
      return { other, label: relativeLabel(e.kind, e.b === id, other.gender, e.step), scenes: e.scenes, kind: e.kind };
    })
    .sort((x, y) => Number(x.kind === "family") - Number(y.kind === "family") || y.scenes - x.scenes);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 sm:flex-row">
        <Avatar src={p.image_url} name={p.name} className="aspect-[3/4] w-40 shrink-0 rounded-lg border border-border" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            {p.disambiguation && <p className="text-sm text-muted">{p.disambiguation}</p>}
            {p.aliases.length > 0 && <p className="text-sm text-muted">aka {p.aliases.join(", ")}</p>}
          </div>
          <p className="text-sm">
            {scenes.length} family-roleplay {scenes.length === 1 ? "scene" : "scenes"} · {p.relatives} on-screen{" "}
            {p.relatives === 1 ? "relative" : "relatives"} ·{" "}
            <a href={`https://stashdb.org/performers/${p.id}`} className="text-accent underline" target="_blank" rel="noreferrer">
              StashDB
            </a>
          </p>
          {direct.length > 0 && (
            <>
              <RelativeChips items={direct.slice(0, 10)} />
              {direct.length > 10 && (
                <details>
                  <summary className="cursor-pointer text-sm text-muted">+{direct.length - 10} more</summary>
                  <div className="mt-2">
                    <RelativeChips items={direct.slice(10)} />
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Family tree</h2>
        {family.edges.length ? (
          <FamilyTree focus={id} nodes={family.nodes} edges={family.edges} />
        ) : (
          <p className="text-muted">No relationships could be inferred yet.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Scenes</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {scenes.map((s) => (
            <li key={s.id} className="flex gap-4 p-3">
              <Avatar src={s.image_url} name={s.title ?? "?"} className="aspect-video w-36 shrink-0 rounded" />
              <div className="min-w-0 text-sm">
                <a href={`https://stashdb.org/scenes/${s.id}`} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">
                  {s.title ?? "Untitled"}
                </a>
                <div className="text-muted">
                  {[s.studio, s.release_date].filter(Boolean).join(" · ")} · as <em>{roleText(s.role, s.step)}</em>
                </div>
                {s.cast.length > 0 && (
                  <div className="mt-1">
                    with{" "}
                    {s.cast.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ", "}
                        {c.in_scope ? (
                          <Link href={`/performer/${c.id}`} className="underline decoration-border hover:text-accent">
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}{" "}
                        <span className="text-muted">({roleText(c.role, c.step)})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RelativeChips({ items }: { items: { other: { id: string; name: string }; label: string; scenes: number; kind: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((d) => (
        <li key={`${d.other.id}-${d.kind}`}>
          <Link href={`/performer/${d.other.id}`} className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-accent">
            <span className="text-muted">{d.label}:</span> {d.other.name}
            {d.scenes > 1 && <span className="text-muted"> ×{d.scenes}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
