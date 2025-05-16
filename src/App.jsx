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
import "./index.css";

function App() {
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [stands, setStands] = useState([]);
  const [exhibitors, setExhibitors] = useState([]);
  const [favorites, setFavorites] = useState(() =>
    JSON.parse(localStorage.getItem("favorites") || "[]")
  );

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
    let updated;
    if (favorites.includes(label)) {
      updated = favorites.filter((f) => f !== label);
    } else {
      updated = [...favorites, label];
    }
    setFavorites(updated);
    localStorage.setItem("favorites", JSON.stringify(updated));
  };

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
      <select
        onChange={(e) => {
          const selected = maps.find((m) => m.title === e.target.value);
          setSelectedMap(selected);
        }}
        value={selectedMap?.title || ""}
        style={{
          position: "absolute",
          zIndex: 1000,
          top: 10,
          right: 10,
          height: "35px",
        }}
      >
        {maps.map((m) => (
          <option key={m.title} value={m.title}>
            {m.title}
          </option>
        ))}
      </select>

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
                      style={{
                        height: "35px",
                        padding: "6px",
                        background: favorites.includes(stand.label)
                          ? "goldenrod"
                          : "none",
                        border: "2px solid goldenrod",
                        borderRadius: "6px",
                      }}
                      type="button"
                      onClick={() => {
                        toggleFavorite(stand.label);
                      }}
                    >
                      {favorites.includes(stand.label)
                        ? "★ Remove Favorite"
                        : "☆ Add to Favorites"}
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
