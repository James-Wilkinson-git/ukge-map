import React, { useMemo } from "react";
import { SVGOverlay } from "react-leaflet";
import type { LatLngBounds } from "leaflet";

export function parseViewBoxString(
  raw: string | undefined,
): { vx: number; vy: number; vw: number; vh: number } | null {
  if (!raw?.trim()) return null;
  const p = raw.trim().split(/\s+/).map(Number);
  if (p.length < 4 || p.some((n) => !Number.isFinite(n))) return null;
  return { vx: p[0]!, vy: p[1]!, vw: p[2]!, vh: p[3]! };
}

export function ringToSvgPoints(ring: [number, number][]): string {
  return ring.map(([x, y]) => `${x},${y}`).join(" ");
}

/** Default booth outline (non‑favourite); favourites keep green fill + darker stroke in branches below. */
const BOOTH_OUTLINE_STROKE = "#141414";
const BOOTH_OUTLINE_WIDTH = 1.25;

const SEARCH_FOCUS_FILL = "#fff59d";
const SEARCH_FOCUS_STROKE = "#f57f17";
const SEARCH_MATCH_FILL = "#e3f2fd";
const SEARCH_MATCH_STROKE = "#1565c0";

function standInSet(label: string, ids: Set<string>): boolean {
  const lc = label.toLowerCase();
  for (const id of ids) {
    if (id.toLowerCase() === lc) return true;
  }
  return false;
}

function standEquals(a: string, b: string | null): boolean {
  return b != null && a.toLowerCase() === b.toLowerCase();
}

/** Booth appearance in SVG: favourites, search matches, and focused search result. */
export function standSvgStyle(
  label: string,
  favorites: string[],
  searchActive: boolean,
  matchSet: Set<string>,
  searchFocusStand: string | null,
): React.SVGProps<SVGPolygonElement> {
  const base = {
    style: {
      pointerEvents: "none" as const,
      strokeLinejoin: "round" as const,
    },
  };

  const isFocus = standEquals(label, searchFocusStand);
  const isMatch = standInSet(label, matchSet);
  const fav = favorites.some((f) => standEquals(f, label));

  if (isFocus) {
    return {
      ...base,
      fill: SEARCH_FOCUS_FILL,
      stroke: SEARCH_FOCUS_STROKE,
      strokeWidth: 3,
      opacity: 1,
    };
  }

  if (searchActive) {
    if (isMatch) {
      return {
        ...base,
        fill: SEARCH_MATCH_FILL,
        stroke: SEARCH_MATCH_STROKE,
        strokeWidth: 2.5,
        opacity: 1,
      };
    }
    if (fav) {
      return {
        ...base,
        fill: "#a5d6a7",
        stroke: "#2e7d32",
        strokeWidth: 2,
        opacity: 0.4,
      };
    }
    return {
      ...base,
      fill: "none",
      stroke: BOOTH_OUTLINE_STROKE,
      strokeWidth: BOOTH_OUTLINE_WIDTH,
      opacity: 0.35,
    };
  }

  if (fav) {
    return {
      ...base,
      fill: "#a5d6a7",
      stroke: "#2e7d32",
      strokeWidth: 2,
      opacity: 1,
    };
  }

  return {
    ...base,
    fill: "none",
    stroke: BOOTH_OUTLINE_STROKE,
    strokeWidth: BOOTH_OUTLINE_WIDTH,
    opacity: 1,
  };
}

/** UKGE `SvgMap`-style layer: one SVG user space (viewBox) with raster + vectors; no Leaflet CRS drift. */
export function UkgeHallSvgOverlay({
  bounds,
  viewBoxStr,
  vb,
  imageUrl,
  children,
}: {
  bounds: LatLngBounds;
  /** `viewBox` attribute e.g. `"0 0 3362 3543"` — same as ExpoMap. */
  viewBoxStr: string;
  vb: { vx: number; vy: number; vw: number; vh: number };
  imageUrl: string;
  /** Polygons + text nodes (labels). */
  children: React.ReactNode;
}) {
  const attrs = useMemo(
    () => ({
      viewBox: viewBoxStr,
      preserveAspectRatio: "none",
      class: "ukge-expo-svg",
    }),
    [viewBoxStr],
  );

  return (
    <SVGOverlay bounds={bounds} interactive={false} attributes={attrs}>
      <image
        href={imageUrl}
        x={vb.vx}
        y={vb.vy}
        width={vb.vw}
        height={vb.vh}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      />
      {children}
    </SVGOverlay>
  );
}
