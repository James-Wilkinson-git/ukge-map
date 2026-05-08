/** `public/mapdata.json`; honours Vite `base` when the site is not at domain root. */
export function mapdataUrl(): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}mapdata.json`;
}
