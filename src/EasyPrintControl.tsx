import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-easyprint";

// Extend Leaflet's type definitions to include easyPrint
declare module "leaflet" {
  export function easyPrint(options: unknown): unknown;
}

interface Props {
  position: string;
  title: string;
  exportOnly: boolean;
}

const EasyPrintControl = ({
  position = "topright",
  title = "Print Map",
  exportOnly = false,
}: Props) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const printControl = L.easyPrint({
      title,
      position,
      sizeModes: ["A4Portrait", "A4Landscape"],
      filename: "ukge-map",
      exportOnly,
      hideControlContainer: false,
    }) as L.Control;

    map.addControl(printControl);

    return () => {
      map.removeControl(printControl);
    };
  }, [map, title, position, exportOnly]);

  return null;
};

export default EasyPrintControl;
