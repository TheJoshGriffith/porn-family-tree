import { FamilyMap } from "@/components/FamilyMap";
import { PerformerGrid } from "@/components/PerformerGrid";
import { mapVersion } from "@/lib/maplayout";
import { mostConnected, searchPerformers, stats } from "@/lib/queries";
import { forVisitor } from "@/lib/region";

export default async function Home({ searchParams }: PageProps<"/">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const s = stats();

  if (!s.scenes) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <h1 className="mb-2 text-xl font-semibold">No data yet</h1>
        {process.env.NODE_ENV === "production" ? (
          <p className="text-muted">The first sync is still running. Check back shortly.</p>
        ) : (
          <p className="text-muted">
            Add your StashDB API key to <code>.env.local</code> and run <code>pnpm scrape</code>.
          </p>
        )}
      </div>
    );
  }

  const results = await forVisitor(q ? searchPerformers(q) : mostConnected());
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{q ? `Results for “${q}”` : "On-screen families"}</h1>
        <p className="text-sm text-muted">
          {s.performers.toLocaleString()} performers · {s.scenes.toLocaleString()} scenes · {s.links.toLocaleString()} links
        </p>
      </div>
      {!q && <FamilyMap version={mapVersion()} />}
      {!q && <h2 className="text-lg font-semibold">Most connected performers</h2>}
      {results.length ? <PerformerGrid performers={results} /> : <p className="text-muted">Nobody matches that name.</p>}
    </div>
  );
}
