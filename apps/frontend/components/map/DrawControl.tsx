"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";

// Define props for the control
interface DrawControlProps {
    onCreated: (e: L.DrawEvents.Created) => void;
    onDeleted: (e: L.DrawEvents.Deleted) => void;
}

export default function DrawControl({ onCreated, onDeleted }: DrawControlProps) {
    const map = useMap();

    useEffect(() => {
        // FeatureGroup is to store editable layers
        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: drawnItems,
                remove: true,
            },
            draw: {
                marker: false,
                circle: false,
                circlemarker: false,
                polyline: false,
                rectangle: {},
                polygon: {},
            },
        });

        map.addControl(drawControl);

        // Event handlers
        map.on(L.Draw.Event.CREATED, (e) => {
            const event = e as L.DrawEvents.Created;
            const layer = event.layer;
            drawnItems.clearLayers(); // Only allow one polygon for MVP
            drawnItems.addLayer(layer);
            onCreated(event);
        });

        map.on(L.Draw.Event.DELETED, (e) => {
            onDeleted(e as L.DrawEvents.Deleted);
        });

        return () => {
            map.removeControl(drawControl);
            map.removeLayer(drawnItems);
            // Clean up event listeners
            map.off(L.Draw.Event.CREATED);
            map.off(L.Draw.Event.DELETED);
        };
    }, [map, onCreated, onDeleted]);

    return null;
}
