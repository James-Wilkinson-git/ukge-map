import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-easyprint";

const EasyPrintControl = ({
  position = "topright",
  title = "Print Map",
  exportOnly = false,
}) => {
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
    });

    map.addControl(printControl);

    return () => {
      map.removeControl(printControl);
    };
  }, [map, title, position, exportOnly]);

  return null;
};

export default EasyPrintControl;
