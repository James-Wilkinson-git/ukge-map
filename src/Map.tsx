import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  ImageOverlay,
  Polygon,
  Popup,
  Tooltip,
} from "react-leaflet";
import { CRS, LatLngBounds, LatLng } from "leaflet";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import EasyPrintControl from "./EasyPrintControl";

import "./normalize.css";
import "./skeleton.css";
import "./index.css";
import { Link } from "react-router";

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
  points: [number, number][];
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

export const Map: React.FC = () => {
  const [maps, setMaps] = useState<MapInfo[]>([]);
  const [selectedMap, setSelectedMap] = useState<MapInfo | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [listKey, setListKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<string[]>([]);
  const [newListName, setNewListName] = useState<string>("");

  function generateRandomListName(): string {
    const adjectives = [
      "brave",
      "cheeky",
      "happy",
      "sleepy",
      "sneaky",
      "gentle",
      "noisy",
      "bouncy",
    ];
    const animals = [
      "otter",
      "fox",
      "tiger",
      "panda",
      "sloth",
      "owl",
      "lizard",
      "turtle",
    ];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adjective}-${animal}`;
  }

  function loadInitialList(): void {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    const params = new URLSearchParams("?" + hash);
    const keyFromHash = params.get("list");
    const favEncoded = params.get("favs");

    if (keyFromHash) {
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
      setListKey(keyFromHash);
      setFavorites(favsFromUrl);
      return;
    }

    // Migrate legacy
    const legacy: string[] = JSON.parse(
      localStorage.getItem("favorites") || "[]"
    );
    if (legacy.length > 0) {
      const newKey = generateRandomListName();
      localStorage.setItem(`favorites:${newKey}`, JSON.stringify(legacy));
      localStorage.removeItem("favorites");
      setListKey(newKey);
      setFavorites(legacy);
      const compressed = compressToEncodedURIComponent(legacy.join(","));
      window.location.hash = `list=${newKey}&favs=${compressed}`;
      return;
    }

    // Load first saved list
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith("favorites:"))
      .map((k) => k.replace("favorites:", ""));
    if (keys.length > 0) {
      const firstKey = keys[0];
      const stored: string[] = JSON.parse(
        localStorage.getItem(`favorites:${firstKey}`) || "[]"
      );
      setListKey(firstKey);
      setFavorites(stored);
      return;
    }

    // No list at all
    setListKey(null);
    setFavorites([]);
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
        .map((k) => k.replace("favorites:", ""));
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
    fetch("/mapdata.json")
      .then((res) => res.json())
      .then((data: MapData) => {
        setMaps(data.maps);
        setStands(data.stands);
        setSelectedMap(data.maps[0]);
        setExhibitors(data.exhibitors);
      });
  }, []);

  const bounds = useMemo(() => {
    if (!selectedMap) return new LatLngBounds([0, 0], [1, 1]);
    const [xMin, yMin, xMax, yMax] = selectedMap.bounds
      .split(" ")
      .map(parseFloat);
    return new LatLngBounds(
      new LatLng(-yMin, xMin), // SW corner
      new LatLng(-yMax, xMax) // NE corner
    );
  }, [selectedMap]);

  const mapStands: MapStand[] = useMemo(() => {
    if (!selectedMap) return [];

    // Merge points by stand label
    const lookup: Record<string, [number, number][]> = stands.reduce(
      (acc, s) => {
        if (!acc[s.label]) acc[s.label] = [];
        acc[s.label].push(...s.points);
        return acc;
      },
      {} as Record<string, [number, number][]>
    );

    return selectedMap.stands
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

        return {
          label,
          points: lookup[label],
          exhibitor,
        } as MapStand;
      })
      .filter((s): s is MapStand => s !== null && s.points?.length > 0);
  }, [selectedMap, stands, exhibitors]);

  const toggleFavorite = (label: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(label)
        ? prev.filter((f) => f !== label)
        : [...prev, label];
      localStorage.setItem(`favorites:${listKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <div className="controls">
        {!listKey && (
          <div>
            <strong>
              Please create a list before using the map or you will get a silly
              name of null.
            </strong>
          </div>
        )}
        <details open>
          <summary>ℹ️ Info</summary>
          <p>
            Make your selections, then hit share link or copy the browser url
            and open it on your phone. If you go back and forth you will need to
            make a new list first thats not on your other device, with a new
            name.
          </p>
          <p>
            For Printing and Downloading make sure you zoom out all the way,
            then you may have to move the map left or right a bit to get it all
            in the page and press print again.
          </p>
          <p>
            All data is copyright UK Games Expo and their Terms of Service and
            Privacy Policy applies to their servers other images copyright their
            respective owners, and this app is brought to you by{" "}
            <a
              href="http://boardgaymesjames.com"
              target="_blank"
              rel="noreferrer"
            >
              @BoardGaymesJames
            </a>
          </p>
          <p>
            <img
              src="/bo-arnak.png"
              width="150"
              alt="German Shepard Cartoon hold tokens from lost ruins of arnak"
            />
          </p>
        </details>
        <details open>
          <summary>🗺️ Hall Maps</summary>
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
          <summary>📜 Adventure Plans</summary>
          <Link to="/list">
            <button className="button">📋 View Lists</button>
          </Link>
          <button
            className="button"
            onClick={() => {
              const compressed = compressToEncodedURIComponent(
                favorites.join(",")
              );
              const url = `${window.location.origin}${window.location.pathname}#list=${listKey}&favs=${compressed}`;
              navigator.clipboard
                .writeText(url)
                .then(() => alert("Link copied to clipboard!"))
                .catch(() => alert("Failed to copy link"));
            }}
          >
            🔗 Share List
          </button>
          <div>
            <ul>
              {favoriteLists.map((key) => (
                <li key={key}>
                  <button
                    onClick={() => {
                      setListKey(key);
                      const stored = JSON.parse(
                        localStorage.getItem(`favorites:${key}`) || "[]"
                      );
                      setFavorites(stored);
                      window.location.hash = `list=${key}&favs=${stored.join(
                        ","
                      )}`;
                    }}
                  >
                    📄 {key}
                  </button>
                  <button
                    className="x-button"
                    onClick={() => {
                      if (!window.confirm(`Delete list "${key}"?`)) return;

                      // Remove the list
                      localStorage.removeItem(`favorites:${key}`);

                      // If the deleted list is the active one:
                      if (key === listKey) {
                        const allKeys = Object.keys(localStorage)
                          .filter((k) => k.startsWith("favorites:"))
                          .map((k) => k.replace("favorites:", ""));

                        const fallbackKey = allKeys[0] || null;

                        if (fallbackKey) {
                          const fallbackFavorites = JSON.parse(
                            localStorage.getItem(`favorites:${fallbackKey}`) ||
                              "[]"
                          );
                          setListKey(fallbackKey);
                          setFavorites(fallbackFavorites);
                          const compressed = compressToEncodedURIComponent(
                            fallbackFavorites.join(",")
                          );
                          window.location.hash = `list=${fallbackKey}&favs=${compressed}`;
                        } else {
                          setListKey(null);
                          setFavorites([]);
                          window.location.hash = "";
                        }
                      }

                      // Update list view immediately
                      const updatedLists = Object.keys(localStorage)
                        .filter((k) => k.startsWith("favorites:"))
                        .map((k) => k.replace("favorites:", ""));
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
              placeholder="New list name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button
              className="button"
              onClick={() => {
                const newKey = newListName.trim();
                if (newKey && !favoriteLists.includes(newKey)) {
                  localStorage.setItem(`favorites:${newKey}`, "[]");
                  setListKey(newKey);
                  setFavorites([]);
                  setNewListName("");
                  window.location.hash = `list=${newKey}`;
                }
              }}
            >
              ➕ Create
            </button>
          </div>
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
          <EasyPrintControl
            position="topleft"
            title="Print Map"
            exportOnly={false}
          />
          <EasyPrintControl
            position="topleft"
            title="Export PNG"
            // sizeModes prop removed for type safety
            exportOnly
          />
          {mapStands.map((stand) => (
            <Polygon
              key={stand.label}
              pathOptions={{
                color: favorites.includes(stand.label) ? "green" : "black",
                weight: 2,
                fillColor: favorites.includes(stand.label)
                  ? "lightgreen"
                  : "white",
                fillOpacity: favorites.includes(stand.label) ? 0.5 : 0,
              }}
              positions={stand.points.map(([y, x]) => [y, x])}
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
                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        toggleFavorite(stand.label);
                      }}
                    >
                      {favorites.includes(stand.label)
                        ? "❌ Remove Favorite"
                        : "⭐ Add to Favorites"}
                    </button>
                  </p>
                </div>
              </Popup>
            </Polygon>
          ))}
        </MapContainer>
      )}
    </div>
  );
};
