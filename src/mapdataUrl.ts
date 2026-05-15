/** `public/mapdata.json`; honours Vite `base` when the site is not at domain root. */
export function mapdataUrl(): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}mapdata.json`;
}

/**
 * Resolve paths from `mapdata.json` (e.g. `/maps/halltwo_2026_CHECKED.png`) so they work
 * when the app is served under a non-root `base` (same rules as {@link mapdataUrl}).
 */
export function publicAssetUrl(path: string): string {
  const p = path.trim();
  if (!p || /^https?:\/\//i.test(p) || p.startsWith("//")) return p;
  const base = import.meta.env.BASE_URL;
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  const pathPart = p.startsWith("/") ? p.slice(1) : p;
  return `${withSlash}${pathPart}`;
}
