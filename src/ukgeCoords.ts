import { LatLng } from "leaflet";

/**
 * UKGE ExpoMap draws stand polygons in SVG user space: each point is [x, y]
 * (see `StandOverlay.js`: `pointsStr` is `x,y` pairs in map viewBox coords).
 *
 * Leaflet `CRS.Simple` uses `LatLng(lat, lng)` where projected `x = lng`,
 * `y = lat` (see Leaflet CRS.Simple). To align the raster `ImageOverlay` with
 * SVG-style y-down coordinates, use `lat = -svgY` and `lng = svgX`.
 */
export function svgPointToLatLngTuple([x, y]: [number, number]): [number, number] {
  return [-y, x];
}

export function svgPointToLatLng([x, y]: [number, number]): LatLng {
  return new LatLng(-y, x);
}
