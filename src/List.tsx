import React, { useEffect, useState } from "react";
import {
  resolveListingHref,
  resolveWebsiteHref,
} from "./exhibitorUrls";
import { loadMapdata } from "./loadMapdata";
import "./normalize.css";
import "./skeleton.css";
import "./index.css";

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

const List: React.FC = () => {
  const [stands, setStands] = useState<Stand[]>([]);
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<
    {
      key: string;
      booths: string[];
    }[]
  >([]);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [mapdataError, setMapdataError] = useState<string | null>(null);

  useEffect(() => {
    setMapdataError(null);
    loadMapdata<{ stands: Stand[]; exhibitors: Exhibitor[] }>()
      .then((data) => {
        setStands(data.stands);
        setExhibitors(data.exhibitors);
        // Load all favorite lists from localStorage
        const keys = Object.keys(localStorage)
          .filter((k) => k.startsWith("favorites:"))
          .map((k) => k.replace("favorites:", ""))
          .sort((a, b) => a.localeCompare(b));
        const lists = keys.map((key) => {
          const booths: string[] = JSON.parse(
            localStorage.getItem(`favorites:${key}`) || "[]"
          );
          return { key, booths };
        });
        setFavoriteLists(lists);
        // Load visited state
        const visitedRaw = localStorage.getItem("visitedBooths") || "{}";
        setVisited(JSON.parse(visitedRaw));
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Unknown error loading map data.";
        console.error(err);
        setMapdataError(msg);
      });
  }, []);

  const handleVisitedToggle = (label: string) => {
    setVisited((prev) => {
      const updated = { ...prev, [label]: !prev[label] };
      localStorage.setItem("visitedBooths", JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="list-container">
      {mapdataError && (
        <div className="mapdata-load-error" role="alert">
          <strong>Map data failed to load.</strong>
          <p>{mapdataError}</p>
        </div>
      )}
      <h2>Your Lists</h2>
      {favoriteLists.length === 0 && <p>No lists found in storage.</p>}
      {favoriteLists.map((list) => (
        <div key={list.key} style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 8 }}>{list.key}</h3>
          <ul>
            {list.booths.length === 0 && <li>No booths in this list.</li>}
            {list.booths
              .slice()
              .sort((a, b) => {
                // Sort by booth label as a string (e.g., 2A-123, 2A-124, 3-123)
                return a.localeCompare(b, undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
              })
              .map((label) => {
                const stand = stands.find((s) => s.label === label);
                const exhibitor = exhibitors.find((e) => e.stand === label);
                const standOnMap = stands.some((s) => s.label === label);
                const websiteHref = exhibitor
                  ? resolveWebsiteHref(exhibitor.website)
                  : null;
                const listingHref = exhibitor
                  ? resolveListingHref(exhibitor.url)
                  : null;
                return (
                  <li
                    key={label}
                    style={{
                      marginBottom: 16,
                      borderBottom: "1px solid #eee",
                      paddingBottom: 8,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!visited[label]}
                        onChange={() => handleVisitedToggle(label)}
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div>
                          <strong>
                            {stand?.label || label}{" "}
                            {exhibitor?.title}
                          </strong>
                        </div>
                        {!standOnMap && (
                          <div
                            style={{
                              fontSize: "0.9em",
                              color: "#a63",
                              margin: "4px 0",
                            }}
                          >
                            Not on this year&apos;s map — booth may have moved or
                            been removed.
                          </div>
                        )}
                        {standOnMap && !exhibitor && (
                          <div
                            style={{
                              fontSize: "0.9em",
                              color: "#666",
                              margin: "4px 0",
                            }}
                          >
                            No exhibitor listing for this stand in current data.
                          </div>
                        )}
                        {exhibitor && (
                          <>
                            {exhibitor.description && (
                              <div
                                style={{
                                  fontSize: "0.95em",
                                  color: "#555",
                                  margin: "2px 0",
                                }}
                              >
                                <span>{exhibitor.description}</span>
                              </div>
                            )}
                            {exhibitor.logo && (
                              <div style={{ margin: "2px 0" }}>
                                <img
                                  src={exhibitor.logo}
                                  alt={exhibitor.title}
                                  style={{ maxWidth: 80, maxHeight: 40 }}
                                />
                              </div>
                            )}
                            {(websiteHref || listingHref) && (
                              <div
                                style={{ fontSize: "0.9em", margin: "2px 0" }}
                              >
                                {websiteHref && (
                                  <a
                                    href={websiteHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Website
                                  </a>
                                )}
                                {listingHref &&
                                  listingHref !== websiteHref && (
                                    <>
                                      {websiteHref ? " · " : null}
                                      <a
                                        href={listingHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        UKGE listing
                                      </a>
                                    </>
                                  )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default List;
