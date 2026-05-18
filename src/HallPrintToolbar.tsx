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

const PRINT_PAGE_CSS = `
  html,body{margin:0;background:#fff}
  body{padding:12px;box-sizing:border-box}
  .print-frame{width:100%;min-height:calc(100vh - 24px);display:flex;align-items:center;justify-content:center}
  .print-frame img{display:block;max-width:100%;max-height:calc(100vh - 24px);width:auto;height:auto}
  @media print {
    @page{margin:5mm;size:landscape}
    html,body{padding:0;height:100%}
    body{display:block}
    .print-frame{
      width:100vw;
      height:100vh;
      min-height:0;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .print-frame img{
      max-width:100%;
      max-height:100%;
      width:auto;
      height:auto;
      page-break-inside:avoid;
    }
  }`;

/** Resize the Leaflet container to the hall aspect ratio so capture + print aren't letterboxed. */
function applyCaptureLayout(
  container: HTMLElement,
  hallAspect: number,
): () => void {
  const parent = container.parentElement;
  const saved = {
    containerWidth: container.style.width,
    containerHeight: container.style.height,
    containerMaxWidth: container.style.maxWidth,
    containerMaxHeight: container.style.maxHeight,
    parentPosition: parent?.style.position ?? "",
    parentWidth: parent?.style.width ?? "",
    parentHeight: parent?.style.height ?? "",
    parentOverflow: parent?.style.overflow ?? "",
  };

  const maxW = Math.min(window.innerWidth - 32, 2800);
  const maxH = Math.min(window.innerHeight - 32, 2000);
  let w = maxW;
  let h = w / hallAspect;
  if (h > maxH) {
    h = maxH;
    w = h * hallAspect;
  }

  if (parent) {
    parent.style.position = "relative";
    parent.style.width = `${Math.ceil(w)}px`;
    parent.style.height = `${Math.ceil(h)}px`;
    parent.style.overflow = "hidden";
  }
  container.style.width = `${Math.ceil(w)}px`;
  container.style.height = `${Math.ceil(h)}px`;
  container.style.maxWidth = "none";
  container.style.maxHeight = "none";

  return () => {
    container.style.width = saved.containerWidth;
    container.style.height = saved.containerHeight;
    container.style.maxWidth = saved.containerMaxWidth;
    container.style.maxHeight = saved.containerMaxHeight;
    if (parent) {
      parent.style.position = saved.parentPosition;
      parent.style.width = saved.parentWidth;
      parent.style.height = saved.parentHeight;
      parent.style.overflow = saved.parentOverflow;
    }
  };
}

function capturePixelRatio(container: HTMLElement): number {
  const { width, height } = container.getBoundingClientRect();
  const longSide = Math.max(width, height, 400);
  return Math.min(5, Math.max(3, 4800 / longSide));
}

export function HallPrintToolbar({
  bounds,
  filenameBase,
  viewBoxSize,
  setSnapshotLabels,
}: {
  bounds: LatLngBounds;
  filenameBase: string;
  viewBoxSize?: { vw: number; vh: number };
  setSnapshotLabels?: (value: boolean) => void;
}) {
  const map = useMap();
  const busy = useRef(false);

  useEffect(() => {
    const safeName = filenameBase.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    const vw = viewBoxSize?.vw ?? 1;
    const vh = viewBoxSize?.vh ?? 1;
    const hallAspect = vw > 0 && vh > 0 ? vw / vh : 1;

    const capturePng = async (): Promise<string> => {
      const m = map;
      const el = m.getContainer();
      const saved = {
        center: m.getCenter(),
        zoom: m.getZoom(),
        minZoom: m.getMinZoom(),
        maxZoom: m.getMaxZoom(),
      };
      m.closePopup?.();
      const restoreLayout = applyCaptureLayout(el, hallAspect);
      try {
        setSnapshotLabels?.(true);
        m.setMinZoom(-6);
        m.setMaxZoom(8);
        await nextFrames(2);
        m.invalidateSize();
        m.fitBounds(bounds, { animate: false, padding: [16, 16] });
        m.invalidateSize();
        await nextFrames(3);
        return await toPng(el, {
          pixelRatio: capturePixelRatio(el),
          cacheBust: true,
          filter: (n) =>
            !(n instanceof HTMLElement) || includeInSnapshot(n),
        });
      } finally {
        restoreLayout();
        m.setMinZoom(saved.minZoom);
        m.setMaxZoom(saved.maxZoom);
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
          <style>${PRINT_PAGE_CSS}</style></head><body>
          <div class="print-frame"><img src="${dataUrl}" alt="Hall map" id="m" /></div>
          <script>
            document.getElementById("m").onload = function () {
              setTimeout(function () { window.print(); }, 250);
            };
          </script>
          </body></html>`,
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
  }, [map, bounds, filenameBase, setSnapshotLabels, viewBoxSize?.vw, viewBoxSize?.vh]);

  return null;
}
