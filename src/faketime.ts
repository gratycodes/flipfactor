import { existsSync } from "node:fs";

const CANDIDATES = [
  "/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1",
  "/usr/lib/aarch64-linux-gnu/faketime/libfaketime.so.1",
  "/usr/lib/faketime/libfaketime.so.1",
  "/usr/local/lib/faketime/libfaketime.so.1",
  "/opt/homebrew/lib/faketime/libfaketime.1.dylib",
];

/** Path to libfaketime, or undefined when it is not installed. */
export function findLibfaketime(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = env.FLIPFACTOR_LIBFAKETIME;
  if (override) return existsSync(override) ? override : undefined;
  return CANDIDATES.find((p) => existsSync(p));
}

/**
 * Environment that makes a process believe "now" is `instant`.
 *
 * A local wall-clock instant ("2026-12-31T23:59:30", no zone) becomes an
 * absolute FAKETIME ("@2026-12-31 23:59:30"), which libfaketime reads in the
 * process's own TZ: the machine's clock *reads* that time, whatever the zone.
 * An instant with Z or an offset is applied as a relative offset from now.
 * The monotonic clock is left alone so sleeps and timeouts keep working.
 */
export function faketimeEnv(lib: string, instant: string, now = Date.now()): Record<string, string> {
  const preloadVar = lib.endsWith(".dylib") ? "DYLD_INSERT_LIBRARIES" : "LD_PRELOAD";
  const base = { [preloadVar]: lib, FAKETIME_DONT_FAKE_MONOTONIC: "1" };
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(instant);
  if (local) return { ...base, FAKETIME: `@${local[1]} ${local[2]}` };
  const target = Date.parse(instant);
  if (Number.isNaN(target)) throw new Error(`not an ISO-8601 instant: ${instant}`);
  const offset = Math.round((target - now) / 1000);
  return { ...base, FAKETIME: `${offset >= 0 ? "+" : "-"}${Math.abs(offset)}` };
}
