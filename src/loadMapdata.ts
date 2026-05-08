import { mapdataUrl } from "./mapdataUrl";

export async function loadMapdata<T>(): Promise<T> {
  const url = mapdataUrl();
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      `Could not fetch map data from ${url} (network). Check connection and HTTPS.`,
    );
  }

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `mapdata.json returned HTTP ${res.status} for ${url}. ` +
        'On Render: use a Static Site, run "npm ci && npm run build", set Publish directory to dist. ',
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trim().slice(0, 100).replace(/\s+/g, " ");
    throw new Error(
      `mapdata.json was not valid JSON (response starts with: "${preview}…"). ` +
        "The server may be returning an HTML error page instead of the file — check deploy output includes `dist/mapdata.json`.",
    );
  }
}
