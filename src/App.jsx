import { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  ImageOverlay,
  Polygon,
  useMapEvents,
  Tooltip,
  Popup,
} from "react-leaflet";
import { CRS, LatLngBounds, LatLng } from "leaflet";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import "./normalize.css";
import "./skeleton.css";
import "./index.css";

function App() {
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [stands, setStands] = useState([]);
  const [exhibitors, setExhibitors] = useState([]);
  const { initialKey, initialFavorites } = getInitialListState();
  const [listKey, setListKey] = useState(initialKey);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [favoriteLists, setFavoriteLists] = useState([]);
  const [newListName, setNewListName] = useState("");

  function getInitialListState() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;

    const params = new URLSearchParams("?" + hash);
    const key = params.get("list") || "default";
    const favEncoded = params.get("favs");

    let favsFromUrl = [];
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
      console.warn("Failed to parse compressed favorites from URL:", e);
    }

    // 🔁 Migration from legacy format
    const legacy = JSON.parse(localStorage.getItem("favorites") || "[]");
    const stored = JSON.parse(localStorage.getItem(`favorites:${key}`) || "[]");

    let final = stored.length ? stored : favsFromUrl;

    if (key === "default" && !stored.length && legacy.length) {
      final = legacy;
      localStorage.setItem("favorites:default", JSON.stringify(legacy));
      localStorage.removeItem("favorites");
    }

    return { initialKey: key, initialFavorites: final };
  }

  useEffect(() => {
    const compressed = compressToEncodedURIComponent(favorites.join(","));
    window.location.hash = `list=${listKey}&favs=${compressed}`;
  }, [favorites, listKey]);

  useEffect(() => {
    if (listKey && favorites) {
      localStorage.setItem(`favorites:${listKey}`, JSON.stringify(favorites));
    }
  }, [favorites, listKey]);

  useEffect(() => {
    fetch("/mapdata.json")
      .then((res) => res.json())
      .then((data) => {
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

  const mapStands = useMemo(() => {
    if (!selectedMap) return [];
    const lookup = Object.fromEntries(stands.map((s) => [s.label, s.points]));
    return selectedMap.stands
      .map((label) => ({
        label,
        points: lookup[label],
        exhibitor: exhibitors.find((e) => e.stand === label),
      }))
      .filter((s) => s.points);
  }, [selectedMap, stands]);

  const toggleFavorite = (label) => {
    setFavorites((prev) => {
      const updated = prev.includes(label)
        ? prev.filter((f) => f !== label)
        : [...prev, label];
      localStorage.setItem(`favorites:${listKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const updateLists = () => {
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith("favorites:"))
        .map((k) => k.replace("favorites:", ""));
      setFavoriteLists(keys);
    };

    updateLists();
  }, [favorites, listKey]);

  useEffect(() => {
    const handleHashChange = () => {
      const { initialKey, initialFavorites } = getInitialListState();
      setListKey(initialKey);
      setFavorites(initialFavorites);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        const point = [e.latlng.lat, e.latlng.lng]; // [y, x]
        const clicked = mapStands.find((stand) =>
          pointInPolygon(point, stand.points)
        );
        if (clicked) toggleFavorite(clicked.label);
      },
    });
    return null;
  }

  return (
    <div>
      <div className="controls">
        <select
          onChange={(e) => {
            const selected = maps.find((m) => m.title === e.target.value);
            setSelectedMap(selected);
          }}
          value={selectedMap?.title || ""}
        >
          {maps.map((m) => (
            <option key={m.title} value={m.title}>
              {m.title}
            </option>
          ))}
        </select>
        <button
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
        <details>
          <summary>📜 Manage Lists</summary>
          <div>
            <ul style={{ listStyle: "none", paddingLeft: 0 }}>
              {favoriteLists.map((key) => (
                <li key={key} style={{ marginBottom: "6px" }}>
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
                    onClick={() => {
                      if (window.confirm(`Delete list "${key}"?`)) {
                        if (key === listKey) {
                          const fallbackKey = "default";
                          const stored = JSON.parse(
                            localStorage.getItem(`favorites:${fallbackKey}`) ||
                              "[]"
                          );

                          setListKey(fallbackKey);
                          setFavorites(stored);

                          const compressed = compressToEncodedURIComponent(
                            stored.join(",")
                          );
                          window.location.hash = `list=${fallbackKey}&favs=${compressed}`;
                        }

                        // Remove the list and refresh the dropdown
                        localStorage.removeItem(`favorites:${key}`);
                        setFavoriteLists(
                          Object.keys(localStorage)
                            .filter((k) => k.startsWith("favorites:"))
                            .map((k) => k.replace("favorites:", ""))
                        );
                      }
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
              style={{ marginRight: "0.5rem" }}
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
          minZoom={-5}
          maxZoom={5}
          style={{ height: "100vh", width: "100%" }}
        >
          <ImageOverlay url={selectedMap.flattened_image} bounds={bounds} />
          <MapClickHandler />
          {mapStands.map((stand) => (
            <Polygon
              key={stand.label}
              pathOptions={{
                color: favorites.includes(stand.label) ? "green" : "black",
                weight: 2,
                fillColor: favorites.includes(stand.label)
                  ? "lightgreen"
                  : "white",
                fillOpacity: favorites.includes(stand.label) ? "0.5" : "0",
              }}
              positions={stand.points.map(([y, x]) => [y, x])}
            >
              <Popup closeButton="true">
                <div>
                  <p>
                    <strong>{stand.label}</strong>
                  </p>
                  <p>{stand.exhibitor?.title || "Unknown Exhibitor"}</p>
                  <p>{stand.exhibitor?.description}</p>
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
}

function pointInPolygon(point, vs) {
  const [x, y] = [point[1], point[0]]; // convert [lat, lng] → [x, y] for math
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][1],
      yi = vs[i][0];
    const xj = vs[j][1],
      yj = vs[j][0];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default App;
