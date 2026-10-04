// Withholds images from visitors in restricted countries (default: GB).
//
// Cloudflare adds CF-IPCountry to every proxied request. The origin is only
// reachable through the Cloudflare Tunnel (the app binds to loopback), so the
// header cannot be forged by a visitor. Images are removed from the server
// response entirely: a CSS blur would still send the image to the browser.

import { headers } from "next/headers";

// Cloudflare's codes for "unknown location" and "Tor".
const UNKNOWN = new Set(["", "XX", "T1"]);

export function parseRestricted(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "GB")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * Pure decision, exported for tests. With no usable country we fail closed in
 * production (someone has bypassed Cloudflare, or it could not geolocate) but
 * allow in development, where requests never carry the header.
 */
export function imagesAllowedFor(country: string | null, restricted: Set<string>, production: boolean): boolean {
  if (!restricted.size) return true;
  const c = (country ?? "").trim().toUpperCase();
  if (UNKNOWN.has(c)) return !production;
  return !restricted.has(c);
}

/** Visitor's ISO country from Cloudflare, upper-cased; null if absent. */
export async function visitorCountry(): Promise<string | null> {
  return (await headers()).get("cf-ipcountry")?.trim().toUpperCase() || null;
}

export async function imagesAllowed(): Promise<boolean> {
  return imagesAllowedFor(await visitorCountry(), parseRestricted(process.env.RESTRICTED_COUNTRIES), process.env.NODE_ENV === "production");
}

/** Deep copy with every `image_url` nulled. */
export function stripImages<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripImages) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === "image_url" ? null : stripImages(v)]),
    ) as T;
  }
  return value;
}

/** Pass page data through this before rendering. */
export async function forVisitor<T>(value: T): Promise<T> {
  return (await imagesAllowed()) ? value : stripImages(value);
}
