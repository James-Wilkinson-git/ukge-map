import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer,
  ImageOverlay,
  Polygon,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import { CRS, LatLngBounds, LatLng } from "leaflet";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { HallPrintToolbar } from "./HallPrintToolbar";

import "./normalize.css";
import "./skeleton.css";
import "./index.css";
import { Link } from "react-router";
import { resolveListingHref, resolveWebsiteHref } from "./exhibitorUrls";
import {
  generateRandomBoardGameListName,
  uniqueRandomListName,
} from "./listNameUtils";
import { loadMapdata } from "./loadMapdata";
import {
  boundsForStandGeometry,
  mapForStand,
  searchExhibitorsByStand,
} from "./searchExhibitors";

// Type definitions for map data
interface MapData {
  maps: MapInfo[];
  stands: Stand[];
  exhibitors: Exhibitor[];
}

interface MapInfo {
  title: string;
  bounds: string;
  flattened_image: string;
  stands: string[];
}

interface Stand {
  label: string;
  points: [number, number][];
}

interface Exhibitor {
  stand: string;
  title: string;
  description: string;
  logo?: string;
  website?: string;
  url?: string;
}

interface MapStand {
  label: string;
  /** One Leaflet polygon per geometry chunk from the API (same label may have several rectangles). */
  rings: [number, number][][];
  exhibitor: {
    stand: string;
    title: string;
    description: string;
    logo: string | null;
    website: string;
    url?: string;
    all: Exhibitor[];
  };
}

function exhibitorLinkPairs(
  ex: Exhibitor[],
): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const e of ex) {
    const w = resolveWebsiteHref(e.website);
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push({ label: "Website", href: w });
    }
    const l = resolveListingHref(e.url);
    if (l && !seen.has(l)) {
      seen.add(l);
      out.push({ label: "UKGE listing", href: l });
    }
  }
  return out;
}

function truncateSearchDescription(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function getStandPolygonStyle(
  label: string,
  favorites: string[],
  searchActive: boolean,
  matchSet: Set<string>,
): {
  color: string;
  weight: number;
  fillColor: string;
  fillOpacity: number;
} {
  const isFav = favorites.includes(label);
  if (!searchActive) {
    return {
      color: isFav ? "green" : "black",
      weight: 2,
      fillColor: isFav ? "lightgreen" : "white",
      fillOpacity: isFav ? 0.5 : 0,
    };
  }
  const isMatch = matchSet.has(label);
  if (isMatch) {
    return {
      color: isFav ? "green" : "#0d6efd",
      weight: 3,
      fillColor: isFav ? "lightgreen" : "#cfe2ff",
      fillOpacity: isFav ? 0.55 : 0.45,
    };
  }
  return {
    color: "#999",
    weight: 1,
    fillColor: "#888",
    fillOpacity: 0.08,
  };
}

function MapFlyToStand({
  flyToLabel,
  stands,
  onComplete,
}: {
  flyToLabel: string | null;
  stands: Stand[];
  onComplete: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!flyToLabel) return;
    const b = boundsForStandGeometry(stands, flyToLabel);
    if (!b) {
      onComplete();
      return;
    }
    const id = window.requestAnimationFrame(() => {
      map.fitBounds(b, {
        maxZoom: -0.5,
        padding: [72, 72],
      });
      onComplete();
    });
    return () => window.cancelAnimationFrame(id);
  }, [flyToLabel, stands, map, onComplete]);
  return null;
}

export const Map: React.FC = () => {
  const [maps, setMaps] = useState<MapInfo[]>([]);
  const [selectedMap, setSelectedMap] = useState<MapInfo | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [listKey, setListKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<string[]>([]);
  const [newListName, setNewListName] = useState<string>(() =>
    generateRandomBoardGameListName(),
  );
  const [mapdataError, setMapdataError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(0);
  const [flyToStandLabel, setFlyToStandLabel] = useState<string | null>(null);

  const clearFlyToStand = useCallback(() => {
    setFlyToStandLabel(null);
  }, []);

  function clearHashInUrl(): void {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }

  function loadInitialList(): void {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    const params = new URLSearchParams("?" + hash);
    const keyFromHash = params.get("list");
    const favEncoded = params.get("favs");

    if (keyFromHash) {
      const stored = localStorage.getItem(`favorites:${keyFromHash}`);
      if (stored) {
        let favsFromUrl: string[] = [];
        try {
          if (favEncoded) {
            const decoded = decompressFromEncodedURIComponent(favEncoded);
            if (decoded) {
              favsFromUrl = decoded
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean);
            }
          }
        } catch (e) {
          console.warn("Error decoding favorites from URL:", e);
        }
        if (favsFromUrl.length === 0) {
          try {
            const parsed = JSON.parse(stored);
            favsFromUrl = Array.isArray(parsed) ? parsed : [];
          } catch {
            favsFromUrl = [];
          }
        }
        setListKey(keyFromHash);
        setFavorites(Array.isArray(favsFromUrl) ? favsFromUrl : []);
        return;
      }
      // Hash referenced a list that no longer exists; fall through to
      // auto-select/auto-create so the user lands ready-to-favorite.
      clearHashInUrl();
    }

    // Migrate legacy
    const legacy: string[] = JSON.parse(
      localStorage.getItem("favorites") || "[]",
    );
    if (legacy.length > 0) {
      const existing = new Set(
        Object.keys(localStorage)
          .filter((k) => k.startsWith("favorites:"))
          .map((k) => k.replace("favorites:", "")),
      );
      const newKey = uniqueRandomListName(existing);
      localStorage.setItem(`favorites:${newKey}`, JSON.stringify(legacy));
      localStorage.removeItem("favorites");
      setListKey(newKey);
      setFavorites(legacy);
      const compressed = compressToEncodedURIComponent(legacy.join(","));
      window.location.hash = `list=${newKey}&favs=${compressed}`;
      return;
    }

    // No list in URL: pick an existing list if any, otherwise spin one up
    // so the user can start tapping ⭐ immediately on first paint.
    const existingKeys = Object.keys(localStorage)
      .filter((k) => k.startsWith("favorites:"))
      .map((k) => k.replace("favorites:", ""))
      .sort((a, b) => a.localeCompare(b));

    if (existingKeys.length > 0) {
      const key = existingKeys[0]!;
      let stored: string[] = [];
      try {
        const raw = JSON.parse(
          localStorage.getItem(`favorites:${key}`) || "[]",
        );
        stored = Array.isArray(raw) ? raw : [];
      } catch {
        stored = [];
      }
      setListKey(key);
      setFavorites(stored);
      const compressed = compressToEncodedURIComponent(stored.join(","));
      window.location.hash = `list=${key}&favs=${compressed}`;
      return;
    }

    const freshKey = uniqueRandomListName(new Set());
    localStorage.setItem(`favorites:${freshKey}`, "[]");
    setListKey(freshKey);
    setFavorites([]);
    window.location.hash = `list=${freshKey}`;
  }

  // Run once on first load
  useEffect(() => {
    loadInitialList();
    const isDesktop = window.innerWidth > 1024;
    setDesktop(isDesktop);
  }, []);

  // Sync favorites to localStorage and URL
  useEffect(() => {
    if (!listKey) return;
    localStorage.setItem(`favorites:${listKey}`, JSON.stringify(favorites));
    const compressed = compressToEncodedURIComponent(favorites.join(","));
    window.location.hash = `list=${listKey}&favs=${compressed}`;
  }, [favorites, listKey]);

  // Load all favorite list names
  useEffect(() => {
    const updateLists = () => {
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith("favorites:"))
        .map((k) => k.replace("favorites:", ""))
        .sort((a, b) => a.localeCompare(b));
      setFavoriteLists(keys);
    };
    updateLists();
  }, [favorites, listKey]);

  // Handle manual hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      loadInitialList();
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setMapdataError(null);
    loadMapdata<MapData>()
      .then((data) => {
        setMaps(data.maps);
        setStands(data.stands);
        setSelectedMap(data.maps[0] ?? null);
        setExhibitors(data.exhibitors);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Unknown error loading map data.";
        console.error(err);
        setMapdataError(msg);
      });
  }, []);

  const bounds = useMemo(() => {
    if (!selectedMap) return new LatLngBounds([0, 0], [1, 1]);
    const [xMin, yMin, xMax, yMax] = selectedMap.bounds
      .split(" ")
      .map(parseFloat);
    return new LatLngBounds(
      new LatLng(-yMin, xMin), // SW corner
      new LatLng(-yMax, xMax), // NE corner
    );
  }, [selectedMap]);

  const mapStands: MapStand[] = useMemo(() => {
    if (!selectedMap) return [];

    // Collect rings by stand label (do not flatten: multiple rects share one booth id)
    const lookup: Record<string, [number, number][][]> = stands.reduce(
      (acc, s) => {
        if (!acc[s.label]) acc[s.label] = [];
        acc[s.label].push(s.points);
        return acc;
      },
      {} as Record<string, [number, number][][]>,
    );

    // Hall layout lists the same stand id more than once in a few cases; render once.
    const labelsInHall = [...new Set(selectedMap.stands)];

    return labelsInHall
      .map((label) => {
        const matchingExhibitors = exhibitors.filter((e) => e.stand === label);

        if (matchingExhibitors.length === 0) return null;

        const exhibitor = {
          stand: label,
          title: matchingExhibitors.map((e) => e.title).join(" / "),
          description: matchingExhibitors
            .map((e) => `${e.description}\n`)
            .join("\n\n"),
          logo: matchingExhibitors.find((e) => e.logo)?.logo || null,
          website: matchingExhibitors.find((e) => e.website)?.website || "",
          url: matchingExhibitors[0].url || "",
          all: matchingExhibitors,
        };

        const rings = lookup[label] ?? [];
        return {
          label,
          rings,
          exhibitor,
        } as MapStand;
      })
      .filter(
        (s): s is MapStand =>
          s !== null && s.rings.some((ring) => ring.length >= 3),
      );
  }, [selectedMap, stands, exhibitors]);

  const searchResults = useMemo(
    () => searchExhibitorsByStand(exhibitors, searchQuery),
    [exhibitors, searchQuery],
  );

  const searchActive = searchQuery.trim().length > 0;

  const searchMatchLabels = useMemo(() => {
    const s = new Set<string>();
    for (const r of searchResults) {
      s.add(r.stand);
    }
    return s;
  }, [searchResults]);

  useEffect(() => {
    setSearchHighlightIndex(0);
  }, [searchQuery]);

  const selectSearchResultAt = useCallback(
    (index: number) => {
      const r = searchResults[index];
      if (!r) return;
      const m = mapForStand(maps, r.stand);
      if (m) setSelectedMap(m);
      setFlyToStandLabel(r.stand);
    },
    [searchResults, maps],
  );

  const toggleFavorite = (label: string) => {
    if (!listKey) return;
    setFavorites((prev) => {
      const updated = prev.includes(label)
        ? prev.filter((f) => f !== label)
        : [...prev, label];
      localStorage.setItem(`favorites:${listKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="map-viewport">
      <div className="controls">
        {mapdataError && (
          <div className="mapdata-load-error" role="alert">
            <strong>Map data failed to load.</strong>
            <p>{mapdataError}</p>
          </div>
        )}
        <details open>
          <summary>🗺️ Hall Maps 🤏</summary>
          <select
            onChange={(e) => {
              const selected = maps.find((m) => m.title === e.target.value);
              setSelectedMap(selected || null);
            }}
            value={selectedMap?.title || ""}
          >
            {maps.map((m) => (
              <option key={m.title} value={m.title}>
                {m.title}
              </option>
            ))}
          </select>
        </details>
        <details open>
          <summary>🔎 Search 🤏</summary>
          <label className="controls-search-label" htmlFor="ukge-exhibitor-search">
            Find exhibitor or booth
          </label>
          <div className="controls-search-field">
            <input
              id="ukge-exhibitor-search"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              className="controls-search-input"
              placeholder="Name, description, or stand…"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (searchResults.length === 0) {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSearchQuery("");
                  }
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchHighlightIndex((i) =>
                    Math.min(searchResults.length - 1, i + 1),
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchHighlightIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  selectSearchResultAt(searchHighlightIndex);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setSearchQuery("");
                  setSearchHighlightIndex(0);
                }
              }}
              aria-controls={
                searchActive ? "ukge-search-results" : undefined
              }
              aria-activedescendant={
                searchActive && searchResults.length > 0
                  ? `ukge-search-opt-${searchHighlightIndex}`
                  : undefined
              }
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                className="controls-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setSearchQuery("");
                  setSearchHighlightIndex(0);
                }}
              >
                ×
              </button>
            )}
          </div>
          {searchActive && (
            <div
              id="ukge-search-results"
              className="controls-search-results"
              role="listbox"
              aria-label="Search results"
            >
              {searchResults.length === 0 && (
                <p className="controls-search-empty" role="status">
                  No matches.
                </p>
              )}
              {searchResults.length > 0 && (
                <p className="controls-search-count" aria-live="polite">
                  {searchResults.length} result
                  {searchResults.length === 1 ? "" : "s"}
                </p>
              )}
              {searchResults.map((r, index) => (
                <button
                  key={r.stand}
                  type="button"
                  id={`ukge-search-opt-${index}`}
                  role="option"
                  aria-selected={index === searchHighlightIndex}
                  className={
                    index === searchHighlightIndex
                      ? "controls-search-result-row is-active"
                      : "controls-search-result-row"
                  }
                  onMouseEnter={() => setSearchHighlightIndex(index)}
                  onClick={() => selectSearchResultAt(index)}
                >
                  <div className="controls-search-result-stand">{r.stand}</div>
                  <div className="controls-search-result-title">{r.title}</div>
                  {r.description ? (
                    <div className="controls-search-result-desc">
                      {truncateSearchDescription(r.description, 56)}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </details>
        <details open>
          <summary>📜 Lists 🤏</summary>

          <div>
            <ul>
              {favoriteLists.map((key) => (
                <li key={key} className="favorite-list-row">
                  <button
                    type="button"
                    className="favorite-list-open"
                    title={key}
                    onClick={() => {
                      setListKey(key);
                      const stored: string[] = JSON.parse(
                        localStorage.getItem(`favorites:${key}`) || "[]",
                      );
                      setFavorites(stored);
                      const compressed = compressToEncodedURIComponent(
                        stored.join(","),
                      );
                      window.location.hash = `list=${key}&favs=${compressed}`;
                    }}
                  >
                    📄 {key}
                  </button>
                  <button
                    type="button"
                    className="x-button"
                    aria-label={`Delete list ${key}`}
                    title="Delete list"
                    onClick={() => {
                      if (!window.confirm(`Delete list "${key}"?`)) return;

                      // Remove the list
                      localStorage.removeItem(`favorites:${key}`);

                      // If the deleted list is the active one:
                      if (key === listKey) {
                        setListKey(null);
                        setFavorites([]);
                        clearHashInUrl();
                        const remaining = Object.keys(localStorage)
                          .filter((k) => k.startsWith("favorites:"))
                          .map((k) => k.replace("favorites:", ""));
                        setNewListName(
                          uniqueRandomListName(new Set(remaining)),
                        );
                      }

                      // Update list view immediately
                      const updatedLists = Object.keys(localStorage)
                        .filter((k) => k.startsWith("favorites:"))
                        .map((k) => k.replace("favorites:", ""))
                        .sort((a, b) => a.localeCompare(b));
                      setFavoriteLists(updatedLists);
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>
            <input
              type="text"
              placeholder="List name (board-game style suggestion)"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button
              className="button"
              onClick={() => {
                const newKey = newListName.trim();
                if (!newKey) {
                  alert("Enter a list name (or use the suggested one).");
                  return;
                }
                if (favoriteLists.includes(newKey)) {
                  alert(
                    `A list named "${newKey}" already exists. Pick another name or open that list.`,
                  );
                  return;
                }
                localStorage.setItem(`favorites:${newKey}`, "[]");
                setListKey(newKey);
                setFavorites([]);
                setNewListName(
                  uniqueRandomListName(new Set([...favoriteLists, newKey])),
                );
                window.location.hash = `list=${newKey}`;
              }}
            >
              ➕ Create
            </button>
          </div>
          <Link to="/list">
            <button className="button">📋 View Lists</button>
          </Link>
          <button
            className="button"
            disabled={!listKey}
            title={
              listKey ? undefined : "Choose or create a list before sharing."
            }
            onClick={() => {
              if (!listKey) return;
              const compressed = compressToEncodedURIComponent(
                favorites.join(","),
              );
              const url = `${window.location.origin}${window.location.pathname}#list=${listKey}&favs=${compressed}`;
              navigator.clipboard
                .writeText(url)
                .then(() => alert("Link copied to clipboard!"))
                .catch(() => alert("Failed to copy link"));
            }}
          >
            🔗 Share Current List
          </button>
        </details>
        <details open>
          <summary>ℹ️ Info 🤏</summary>
          <p className="controls-info-lead">
            Create a list with unique name under adventure plans, then you can
            select the booths you want to visit and click the star button to add
            them to your list. Press share list to copy a url to open it on your
            phone, make sure you use unique names
          </p>
          <p className="controls-info-fine">
            © UK Games Expo &amp; respective exhibitors ·{" "}
            <a
              href="http://boardgaymesjames.com"
              target="_blank"
              rel="noreferrer"
            >
              @BoardGaymesJames
            </a>
          </p>
          <p className="controls-info-footer">
            <img
              src="/bo-arnak.png"
              width="112"
              height="auto"
              alt="Cartoon dog with board game tokens"
            />
          </p>
        </details>
      </div>

      {selectedMap && (
        <MapContainer
          crs={CRS.Simple}
          bounds={bounds}
          minZoom={-2.5}
          maxZoom={2}
          zoomSnap={0.2}
          style={{ height: "100%", width: "100%" }}
        >
          <ImageOverlay url={selectedMap.flattened_image} bounds={bounds} />
          <HallPrintToolbar bounds={bounds} filenameBase={selectedMap.title} />
          <MapFlyToStand
            flyToLabel={flyToStandLabel}
            stands={stands}
            onComplete={clearFlyToStand}
          />
          {mapStands.flatMap((stand) =>
            stand.rings.map((ring, ringIndex) => (
              <Polygon
                key={`${stand.label}-${ringIndex}`}
                pathOptions={getStandPolygonStyle(
                  stand.label,
                  favorites,
                  searchActive,
                  searchMatchLabels,
                )}
                positions={ring.map(([y, x]) => [y, x])}
              >
                {desktop && (
                  <Tooltip>
                    {stand.exhibitor?.title || "Unknown Exhibitor"}
                  </Tooltip>
                )}
                <Popup closeButton={true}>
                  <div>
                    <p>
                      <strong>{stand.label}</strong>
                    </p>
                    <p>{stand.exhibitor?.title || "Unknown Exhibitor"}</p>
                    <p className="desc">{stand.exhibitor?.description}</p>
                    {(() => {
                      const links = exhibitorLinkPairs(stand.exhibitor.all);
                      if (links.length === 0) return null;
                      return (
                        <p style={{ margin: "0.5em 0" }}>
                          {links.map(({ label, href }, i) => (
                            <span key={href}>
                              {i > 0 ? " · " : null}
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {label}
                              </a>
                            </span>
                          ))}
                        </p>
                      );
                    })()}
                    <p>
                      <button
                        type="button"
                        disabled={!listKey}
                        title={
                          listKey
                            ? undefined
                            : "Use Adventure Plans — pick or create a list first."
                        }
                        onClick={() => {
                          toggleFavorite(stand.label);
                        }}
                      >
                        {!listKey
                          ? "⭐ Create a list first"
                          : favorites.includes(stand.label)
                            ? "❌ Remove Favorite"
                            : "⭐ Add to Favorites"}
                      </button>
                    </p>
                  </div>
                </Popup>
              </Polygon>
            )),
          )}
        </MapContainer>
      )}
    </div>
  );
};
