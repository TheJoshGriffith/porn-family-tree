// Tiny in-process scheduler for the CLIs: `--every 6h` reruns a job forever.
// Used by the long-running sync/backup containers instead of host cron.

const UNITS: Record<string, number> = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 };

/** "90s", "30m", "6h", "1d" -> milliseconds. */
export function parseDuration(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd])$/i.exec(s.trim());
  if (!m) throw new Error(`Bad duration "${s}" (use e.g. 30m, 6h, 1d)`);
  const ms = Number(m[1]) * UNITS[m[2].toLowerCase()];
  if (ms < 60e3) throw new Error("Interval must be at least 1m");
  return ms;
}

/**
 * Run `job` now, then every `every` (from argv), forever. A failed run is
 * logged and retried next interval rather than killing the container. Without
 * `--every`, runs once and exits non-zero on failure.
 */
export async function runScheduled(job: () => Promise<void>, argv = process.argv) {
  const i = argv.indexOf("--every");
  if (i < 0) {
    try {
      await job();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    return;
  }

  const interval = parseDuration(argv[i + 1] ?? "");
  // PID 1 in a container gets no default signal handling; exit promptly on
  // `docker stop`. SQLite rolls back any half-finished transaction.
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => process.exit(0));

  for (;;) {
    const started = Date.now();
    console.log(`[${new Date().toISOString()}] run starting`);
    try {
      await job();
    } catch (e) {
      console.error(`run failed: ${e instanceof Error ? e.message : e}`);
    }
    const wait = Math.max(0, interval - (Date.now() - started));
    console.log(`[${new Date().toISOString()}] next run in ${Math.round(wait / 60e3)} min`);
    await new Promise((r) => setTimeout(r, wait));
  }
}
