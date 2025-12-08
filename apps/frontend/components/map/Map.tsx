"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import DrawControl from "./DrawControl";
import { fetchSatelliteStats, fetchSatelliteTile } from "@/lib/api";

// Fix Leaflet icon issue in Next.js
import L from "leaflet";

const MapComponent = () => {
    const [mounted, setMounted] = useState(false);
    const [tileUrl, setTileUrl] = useState<string | null>(null);

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

    const handleCreated = async (e: L.DrawEvents.Created) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = e.layer as any;

        if (layer.toGeoJSON) {
            const geoJson = layer.toGeoJSON();
            // Extract only the geometry part, ensuring valid structure
            // GEE expects coordinates, usually we send the whole geometry object or just coords
            // Our backend model expects { type: "Polygon", coordinates: [...] }

            console.log("Fetching satellite data...", geoJson.geometry);

            try {
                // Parallel fetch: Stats + Tile
                const [stats, url] = await Promise.all([
                    fetchSatelliteStats(
                        geoJson.geometry,
                        { start_date: "2023-01-01", end_date: "2023-06-01" } // Hardcoded for MVP
                    ),
                    fetchSatelliteTile(
                        geoJson.geometry,
                        { start_date: "2023-01-01", end_date: "2023-06-01" } // Hardcoded for MVP
                    )
                ]);

                console.log("Satellite Stats:", stats);
                console.log("Tile URL:", url);

                setTileUrl(url);
                alert(`NDVI Mean: ${stats.ndvi?.mean.toFixed(2)}\nTile Layer added!`);
            } catch (err) {
                console.error("Error fetching stats:", err);
                alert("Failed to fetch satellite data. Check console.");
            }
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
            {tileUrl && (
                <TileLayer
                    url={tileUrl}
                    opacity={0.7}
                    zIndex={100}
                />
            )}
            <DrawControl onCreated={handleCreated} onDeleted={handleDeleted} />
        </MapContainer>
    );
};

export default MapComponent;
