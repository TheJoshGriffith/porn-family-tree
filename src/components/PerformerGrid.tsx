import Link from "next/link";
import type { PerformerCard } from "@/lib/queries";
import { Avatar } from "./Avatar";

export function PerformerGrid({ performers }: { performers: PerformerCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {performers.map((p) => (
        <li key={p.id}>
          <Link href={`/performer/${p.id}`} className="group block overflow-hidden rounded-lg border border-border bg-surface hover:border-accent">
            <Avatar src={p.image_url} name={p.name} className="aspect-[3/4]" />
            <div className="p-2">
              <div className="truncate text-sm font-medium group-hover:text-accent">{p.name}</div>
              <div className="text-xs text-muted">
                {p.relatives} {p.relatives === 1 ? "relative" : "relatives"}
                {p.disambiguation ? ` · ${p.disambiguation}` : ""}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
