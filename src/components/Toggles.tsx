"use client";

// Both buttons flip a data-* attribute on <html> and persist it. Which label
// shows is pure CSS (globals.css), so server and client render identical markup.

function flip(attr: "theme" | "nsfw", a: string, b: string) {
  const d = document.documentElement;
  const next = d.dataset[attr] === a ? b : a;
  d.dataset[attr] = next;
  try {
    localStorage.setItem(attr, next);
  } catch {}
}

const btn = "flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface px-2 text-sm whitespace-nowrap hover:bg-surface-2";

export function Toggles({ imagesAllowed }: { imagesAllowed: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {imagesAllowed ? (
        <button type="button" className={btn} onClick={() => flip("nsfw", "show", "blur")} title="Blur or unblur images" aria-label="NSFW filter">
          <span className="when-blurred">🙈<span className="hidden sm:inline"> NSFW filter: on</span></span>
          <span className="when-shown">👀<span className="hidden sm:inline"> NSFW filter: off</span></span>
        </button>
      ) : (
        // Images are not sent at all in restricted regions, so there is nothing to toggle.
        <span className={`${btn} cursor-default text-muted hover:bg-surface`} title="Images are not available in your region">
          🔒<span className="hidden sm:inline"> No images in your region</span>
        </span>
      )}
      <button type="button" className={btn} onClick={() => flip("theme", "dark", "light")} title="Toggle light/dark">
        <span className="when-light" aria-label="Switch to dark mode">🌙</span>
        <span className="when-dark" aria-label="Switch to light mode">☀️</span>
      </button>
    </div>
  );
}
