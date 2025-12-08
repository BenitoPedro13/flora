import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { SatelliteStats } from "@/lib/api";

interface DashboardProps {
    stats: SatelliteStats | null;
    layerType: string;
    onLayerChange: (type: string) => void;
}

const DashboardControl = ({ stats, layerType, onLayerChange }: DashboardProps) => {
    const map = useMap();

    useEffect(() => {
        const control = new L.Control({ position: "topright" });

        control.onAdd = () => {
            const div = L.DomUtil.create("div", "leaflet-bar leaflet-control leaflet-control-custom");
            div.style.backgroundColor = "white";
            div.style.padding = "10px";
            div.style.borderRadius = "4px";
            div.style.maxWidth = "300px";
            div.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";

            // Title
            const title = document.createElement("h4");
            title.innerText = "Field Analysis";
            title.style.margin = "0 0 10px 0";
            title.style.fontSize = "16px";
            div.appendChild(title);

            // Layer Selector
            const selectLabel = document.createElement("label");
            selectLabel.innerText = "Visualization: ";
            selectLabel.style.fontSize = "12px";
            div.appendChild(selectLabel);

            const select = document.createElement("select");
            select.style.marginBottom = "10px";
            select.style.width = "100%";

            const optRGB = document.createElement("option");
            optRGB.value = "rgb";
            optRGB.text = "True Color (RGB)";
            optRGB.selected = layerType === "rgb";

            const optNDVI = document.createElement("option");
            optNDVI.value = "ndvi";
            optNDVI.text = "Vegetation Health (NDVI)";
            optNDVI.selected = layerType === "ndvi";

            select.appendChild(optRGB);
            select.appendChild(optNDVI);

            select.onchange = (e) => {
                onLayerChange((e.target as HTMLSelectElement).value);
            };

            div.appendChild(select);

            // Stats
            if (stats) {
                const statsDiv = document.createElement("div");
                statsDiv.style.fontSize = "12px";
                statsDiv.innerHTML = `
          <div style="margin-bottom: 5px;"><strong>NDVI Mean:</strong> ${stats.ndvi.mean.toFixed(3)}</div>
          <div style="margin-bottom: 5px;"><strong>Max:</strong> ${stats.ndvi.max.toFixed(3)}</div>
          <div style="margin-bottom: 5px;"><strong>Std Dev:</strong> ${stats.ndvi.std_dev.toFixed(3)}</div>
        `;
                div.appendChild(statsDiv);
            } else {
                const help = document.createElement("div");
                help.innerText = "Draw a polygon to see stats.";
                help.style.fontSize = "12px";
                help.style.color = "#666";
                div.appendChild(help);
            }

            // Prevent map clicks from passing through
            L.DomEvent.disableClickPropagation(div);

            return div;
        };

        control.addTo(map);

        return () => {
            control.remove();
        };
    }, [map, stats, layerType]);

    return null;
};

export default DashboardControl;
