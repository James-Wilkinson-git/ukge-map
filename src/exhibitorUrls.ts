export const UKGE_ORIGIN = "https://www.ukgamesexpo.co.uk";

function trim(s: string | undefined | null): string {
  return (s ?? "").trim();
}

/** Returns an absolute https URL for an exhibitor website, or null if empty. */
export function resolveWebsiteHref(website?: string | null): string | null {
  const w = trim(website);
  if (!w) return null;
  if (/^https?:\/\//i.test(w)) return w;
  if (w.startsWith("//")) return `https:${w}`;
  return `${UKGE_ORIGIN}${w.startsWith("/") ? w : `/${w}`}`;
}

/** Returns an absolute URL for UKGE listing path (often site-relative). */
export function resolveListingHref(url?: string | null): string | null {
  const u = trim(url);
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${UKGE_ORIGIN}${u.startsWith("/") ? u : `/${u}`}`;
}
