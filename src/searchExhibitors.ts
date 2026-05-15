import { LatLng, LatLngBounds } from "leaflet";
import { svgPointToLatLng } from "./ukgeCoords";

export interface ExhibitorRow {
  stand: string;
  title: string;
  description: string;
  logo?: string;
  website?: string;
  url?: string;
}

export interface MapInfoLite {
  title: string;
  stands: string[];
}

export interface StandGeometry {
  label: string;
  /** Polygon vertices in UKGE SVG / viewBox space `[x, y]`. */
  points: [number, number][];
}

export function normalizeSearchText(s: string): string {
  return s.trim().toLowerCase();
}

export interface StandSearchResult {
  stand: string;
  title: string;
  description: string;
}

export function searchExhibitorsByStand(
  exhibitors: ExhibitorRow[],
  query: string,
): StandSearchResult[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const byStand = new Map<string, ExhibitorRow[]>();
  for (const e of exhibitors) {
    const arr = byStand.get(e.stand) ?? [];
    arr.push(e);
    byStand.set(e.stand, arr);
  }

  const results: StandSearchResult[] = [];
  for (const [stand, rows] of byStand) {
    const title = rows.map((r) => r.title).join(" / ");
    const description = rows.map((r) => r.description).join("\n\n");
    const haystack = normalizeSearchText(`${stand} ${title} ${description}`);
    if (haystack.includes(q)) {
      results.push({ stand, title, description });
    }
  }

  results.sort((a, b) =>
    a.stand.localeCompare(b.stand, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  return results;
}

export function mapForStand(
  maps: MapInfoLite[],
  standLabel: string,
): MapInfoLite | undefined {
  return maps.find((m) => m.stands.includes(standLabel));
}

export function boundsForStandGeometry(
  stands: StandGeometry[],
  standLabel: string,
): LatLngBounds | null {
  let b: LatLngBounds | null = null;
  for (const s of stands) {
    if (s.label !== standLabel) continue;
    for (const xy of s.points) {
      const ll = svgPointToLatLng(xy);
      if (!b) b = new LatLngBounds(ll, ll);
      else b.extend(ll);
    }
  }
  return b;
}
