import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/mapdata.json")
      .then((res) => res.json())
      .then((data) => {
        setStands(data.stands);
        setExhibitors(data.exhibitors);
        // Load all favorite lists from localStorage
        const keys = Object.keys(localStorage)
          .filter((k) => k.startsWith("favorites:"))
          .map((k) => k.replace("favorites:", ""));
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
      <h2>Your Lists</h2>
      {favoriteLists.length === 0 && <p>No lists found in storage.</p>}
      {favoriteLists.map((list) => (
        <div key={list.key} style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 8 }}>{list.key}</h3>
          <ul>
            {list.booths.length === 0 && <li>No booths in this list.</li>}
            {list.booths.map((label) => {
              const stand = stands.find((s) => s.label === label);
              const exhibitor = exhibitors.find((e) => e.stand === label);
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
                          {stand?.label || label} {exhibitor?.title}
                        </strong>
                      </div>
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
                          {(exhibitor.website || exhibitor.url) && (
                            <div style={{ fontSize: "0.9em", margin: "2px 0" }}>
                              {exhibitor.website && (
                                <a
                                  href={exhibitor.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Website
                                </a>
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
