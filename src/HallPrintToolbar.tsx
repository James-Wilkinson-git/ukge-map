import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L, { type LatLngBounds } from "leaflet";
import { toPng } from "html-to-image";

/** Skip UI chrome that should not appear on printed / downloaded maps. */
function includeInSnapshot(node: HTMLElement): boolean {
  let el: HTMLElement | null = node;
  while (el) {
    const cls = el.classList;
    if (cls.contains("leaflet-control-container")) return false;
    if (cls.contains("leaflet-popup-pane")) return false;
    if (cls.contains("leaflet-tooltip-pane")) return false;
    el = el.parentElement;
  }
  return true;
}

async function nextFrames(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

export function HallPrintToolbar({
  bounds,
  filenameBase,
  setSnapshotLabels,
}: {
  bounds: LatLngBounds;
  filenameBase: string;
  /** Larger stand-number-only SVG labels during PNG capture (print + download). */
  setSnapshotLabels?: (value: boolean) => void;
}) {
  const map = useMap();
  const busy = useRef(false);

  useEffect(() => {
    const safeName = filenameBase.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);

    const capturePng = async (): Promise<string> => {
      const m = map;
      const el = m.getContainer();
      const saved = { center: m.getCenter(), zoom: m.getZoom() };
      m.closePopup?.();
      try {
        setSnapshotLabels?.(true);
        await nextFrames(2);
        m.fitBounds(bounds, { animate: false, padding: [56, 56] });
        m.invalidateSize();
        await nextFrames(2);
        return await toPng(el, {
          /** Larger than screen DPR so PNG + print preview use more pixels (was 2). */
          pixelRatio: Math.min(4, Math.max(3, (window.devicePixelRatio || 1) * 2)),
          cacheBust: true,
          filter: (n) =>
            !(n instanceof HTMLElement) || includeInSnapshot(n),
        });
      } finally {
        m.setView(saved.center, saved.zoom, { animate: false });
        m.invalidateSize();
        setSnapshotLabels?.(false);
        await nextFrames(1);
        m.invalidateSize();
      }
    };

    const printMap = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const dataUrl = await capturePng();
        const w = window.open("", "_blank");
        if (!w) {
          alert("Pop-up blocked. Allow pop-ups for this site to print.");
          return;
        }
        w.document.open();
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>UKGE ${safeName}</title>
          <style>
            html,body{height:100%;margin:0;background:#fff}
            body{display:flex;align-items:flex-start;justify-content:center;padding:12px;box-sizing:border-box}
            img{max-width:100%;width:auto;height:auto;object-fit:contain}
            @media print {
              body{padding:0;margin:0;display:block}
              /* Fill paper width; avoid max-height which shrinks wide hall maps on the page */
              img{
                width:100%!important;
                max-width:none!important;
                height:auto!important;
                max-height:none!important;
                page-break-inside:avoid;
                object-fit:contain;
              }
              @page { margin: 6mm; size: landscape; }
            }
          </style></head><body>
          <img src="${dataUrl}" alt="Hall map" id="m" />
          <script>
            document.getElementById("m").onload = function () {
              setTimeout(function () { window.print(); }, 250);
            };
          </script>
          </body></html>`
        );
        w.document.close();
      } catch (e) {
        console.error(e);
        alert("Could not capture the map for printing.");
      } finally {
        busy.current = false;
      }
    };

    const downloadPng = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const dataUrl = await capturePng();
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${safeName}_ukge.png`;
        a.click();
      } catch (e) {
        console.error(e);
        alert("Could not export the map.");
      } finally {
        busy.current = false;
      }
    };

    const C = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const root = L.DomUtil.create("div");
        root.className = "leaflet-bar leaflet-control ukge-print-group";

        const printBtn = L.DomUtil.create("a", "", root);
        printBtn.href = "#";
        printBtn.title = "Print hall — fits entire floor on the page";
        printBtn.innerHTML = '<span class="ukge-print-glyph">⎙</span>';
        printBtn.setAttribute("aria-label", "Print map");

        const dlBtn = L.DomUtil.create("a", "", root);
        dlBtn.href = "#";
        dlBtn.title = "Download hall as PNG";
        dlBtn.innerHTML =
          '<span class="ukge-print-glyph ukge-print-glyph--download" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" focusable="false">' +
          '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>' +
          "</svg></span>";
        dlBtn.setAttribute("aria-label", "Download map PNG");

        L.DomEvent.disableClickPropagation(root);
        for (const a of [printBtn, dlBtn]) {
          L.DomEvent.on(a, "click", L.DomEvent.stop);
        }
        L.DomEvent.on(printBtn, "click", () => {
          void printMap();
        });
        L.DomEvent.on(dlBtn, "click", () => {
          void downloadPng();
        });

        return root;
      },
    });

    const c = new C();
    c.addTo(map);
    return () => {
      c.remove();
    };
  }, [map, bounds, filenameBase, setSnapshotLabels]);

  return null;
}
