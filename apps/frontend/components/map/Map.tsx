"use client";

import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, LayersControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import DrawControl from "./DrawControl";
import DashboardControl from "./DashboardControl";
import { fetchSatelliteStats, fetchSatelliteTile, SatelliteStats, Geometry } from "@/lib/api";

// Fix Leaflet icon issue in Next.js
import L from "leaflet";

const MapComponent = () => {
    const [mounted, setMounted] = useState(false);
    const [tileUrl, setTileUrl] = useState<string | null>(null);
    const [stats, setStats] = useState<SatelliteStats | null>(null);
    const [layerType, setLayerType] = useState<string>("rgb");
    const [geometry, setGeometry] = useState<Geometry | null>(null); // Store current geometry

    const updateVisualization = useCallback(async (geo: Geometry, type: string) => {
        try {
            const url = await fetchSatelliteTile(
                geo,
                { start_date: "2023-01-01", end_date: "2023-06-01" },
                type
            );
            setTileUrl(url);
        } catch (err) {
            console.error("Error updating tile:", err);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true);
        // Fix leaflet icon
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

    // Effect to refresh tile when layerType changes
    useEffect(() => {
        if (geometry && layerType) {
            // eslint-disable-next-line
            updateVisualization(geometry, layerType);
        }
    }, [layerType, geometry, updateVisualization]);

    const handleCreated = async (e: L.DrawEvents.Created) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = e.layer as any;

        if (layer.toGeoJSON) {
            const geoJson = layer.toGeoJSON();
            // Extract only the geometry part, ensuring valid structure
            // GEE expects coordinates, usually we send the whole geometry object or just coords
            // Our backend model expects { type: "Polygon", coordinates: [...] }
            const geo = geoJson.geometry;
            setGeometry(geo); // Save for later updates

            console.log("Fetching satellite data...", geo);

            try {
                // Fetch Stats once
                fetchSatelliteStats(
                    geo,
                    { start_date: "2023-01-01", end_date: "2023-06-01" } // Hardcoded for MVP
                ).then(s => setStats(s)).catch(e => console.error(e));

                // Fetch Tile (using current layerType)
                updateVisualization(geo, layerType);

                alert(`NDVI Mean: ${stats?.ndvi?.mean.toFixed(2) || 'N/A'} \nTile Layer added!`);
            } catch (err) {
                console.error("Error fetching data:", err);
                alert("Failed to fetch satellite data. Check console.");
            }
        }
    };

    const handleDeleted = () => {
        console.log("Polygon deleted");
        setTileUrl(null);
        setStats(null);
        setGeometry(null);
    };

    if (!mounted) return null;

    return (
        <MapContainer
            center={[51.505, -0.09]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
        >
            <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Street (OSM)">
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Satellite (Esri)">
                    <TileLayer
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                </LayersControl.BaseLayer>

                {tileUrl && (
                    <LayersControl.Overlay checked name="Crop Data Layer">
                        <TileLayer
                            url={tileUrl}
                            opacity={0.8}
                            zIndex={100}
                        />
                    </LayersControl.Overlay>
                )}
            </LayersControl>

            <DashboardControl
                stats={stats}
                layerType={layerType}
                onLayerChange={setLayerType}
            />

            <DrawControl onCreated={handleCreated} onDeleted={handleDeleted} />
        </MapContainer>
    );
};

export default MapComponent;
