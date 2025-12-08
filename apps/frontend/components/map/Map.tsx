"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import DrawControl from "./DrawControl";

// Fix Leaflet icon issue in Next.js
import L from "leaflet";

const MapComponent = () => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true);
        // Fix default icon path issues
        // @ts-expect-error - Leaflet icon default prototype manipulation
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
            iconUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
            shadowUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
        });
    }, []);

    const handleCreated = (e: L.DrawEvents.Created) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = e.layer as any;
        // toGeoJSON exists on Layer but types might be loose in @types/leaflet. 
        // Cast to any locally or specific interface if needed, but avoiding global any in signature.
        if (layer.toGeoJSON) {
            console.log("Polygon created:", layer.toGeoJSON());
        }
    };

    const handleDeleted = () => {
        console.log("Polygon deleted");
    };

    if (!mounted) return null;

    return (
        <MapContainer
            center={[51.505, -0.09]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DrawControl onCreated={handleCreated} onDeleted={handleDeleted} />
        </MapContainer>
    );
};

export default MapComponent;
