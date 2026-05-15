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

/** Booth appearance in SVG: all stands get an outline; favourites also get green fill/stroke emphasis. */
export function standSvgStyle(
  label: string,
  favorites: string[],
  searchActive: boolean,
  matchSet: Set<string>,
): React.SVGProps<SVGPolygonElement> {
  const fav = favorites.includes(label);
  if (!fav) {
    return {
      fill: "none",
      stroke: BOOTH_OUTLINE_STROKE,
      strokeWidth: BOOTH_OUTLINE_WIDTH,
      opacity: 1,
      style: {
        pointerEvents: "none" as const,
        strokeLinejoin: "round" as const,
      },
    };
  }
  const fill = "#a5d6a7";
  const stroke = "#2e7d32";
  if (!searchActive) {
    return {
      fill,
      stroke,
      strokeWidth: 2,
      opacity: 1,
      style: { pointerEvents: "none" as const, strokeLinejoin: "round" as const },
    };
  }
  if (matchSet.has(label)) {
    return {
      fill,
      stroke,
      strokeWidth: 3,
      opacity: 1,
      style: { pointerEvents: "none" as const, strokeLinejoin: "round" as const },
    };
  }
  return {
    fill,
    stroke,
    strokeWidth: 2,
    opacity: 0.45,
    style: { pointerEvents: "none" as const, strokeLinejoin: "round" as const },
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
