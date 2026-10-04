import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toggles } from "@/components/Toggles";
import { imagesAllowed } from "@/lib/region";
// React Flow's stylesheet lives here, not in FamilyTree, so it is in <head>
// before the tree mounts; globals.css comes after so our overrides win.
import "@xyflow/react/dist/style.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Family Tree",
  description: "On-screen family roleplay relationships between adult performers, mapped from StashDB.",
  robots: { index: false, follow: false },
};

// Runs before first paint: resolve theme (stored, else system) and NSFW state.
const BOOT = `(() => {
  const d = document.documentElement;
  let t = null, n = null;
  try { t = localStorage.getItem("theme"); n = localStorage.getItem("nsfw"); } catch {}
  d.dataset.theme = t === "light" || t === "dark" ? t : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  d.dataset.nsfw = n === "show" ? "show" : "blur";
})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const images = await imagesAllowed();
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
          {/* One row at every width: nothing wraps, the search box takes the slack. */}
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="shrink-0 font-semibold tracking-tight" aria-label="Family Tree home">
              <span className="sm:hidden">
                F<span className="text-accent">T</span>
              </span>
              <span className="hidden sm:inline">
                Family<span className="text-accent">Tree</span>
              </span>
            </Link>
            <form action="/" className="min-w-0 flex-1">
              <input
                name="q"
                type="search"
                placeholder="Search performers…"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-accent sm:max-w-sm sm:text-sm"
              />
            </form>
            <Toggles imagesAllowed={images} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
          Relationships are fictional on-screen roleplay between adult performers, inferred automatically from{" "}
          <a href="https://stashdb.org" className="underline">StashDB</a> metadata. They are not real family ties and may be wrong.
        </footer>
      </body>
    </html>
  );
}
