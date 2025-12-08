import ee
from typing import Dict, Any, List
from services.satellite.interface import SatelliteProvider
from services.satellite.models import Geometry, DateRange, SatelliteStats, BandData

import os
from dotenv import load_dotenv

load_dotenv()

class GEEProvider(SatelliteProvider):
    def __init__(self):
        self._authenticated = False
        self.project_id = os.getenv("GEE_PROJECT")

    async def authenticate(self) -> bool:
        try:
            if self.project_id:
                ee.Initialize(project=self.project_id)
            else:
                ee.Initialize()
            self._authenticated = True
            return True
        except Exception as e:
            # In a real scenario, we might try service account auth here
            print(f"GEE Auth failed: {e}")
            return False

    def _get_geometry(self, geometry: Geometry) -> ee.Geometry:
        # Assumes request sends a GeoJSON Polygon coordinates list
        # GEE expects [[[lon, lat], ...]] usually
        return ee.Geometry.Polygon(geometry.coordinates)

    async def get_stats(self, geometry: Geometry, date_range: DateRange) -> SatelliteStats:
        if not self._authenticated:
            await self.authenticate()
        
        region = self._get_geometry(geometry)
        
        # Simple Sentinel-2 NDVI calculation
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(region) \
            .filterDate(date_range.start_date, date_range.end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        
        def add_ndvi(image):
            ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
            return image.addBands(ndvi)

        with_ndvi = s2.map(add_ndvi)
        
        # Verify if we have images
        count = with_ndvi.size().getInfo()
        if count == 0:
            return SatelliteStats(metadata={"error": "No images found"})

        # Reduce region to get stats
        # We take the median image of the period to avoid clouds/outliers
        median_image = with_ndvi.median()
        
        stats = median_image.reduceRegion(
            reducer=ee.Reducer.minMax().combine(
                reducer2=ee.Reducer.mean(), sharedInputs=True
            ).combine(
                reducer2=ee.Reducer.stdDev(), sharedInputs=True
            ),
            geometry=region,
            scale=10,
            maxPixels=1e9
        ).getInfo()
        
        # Parse result: e.g. NDVI_min, NDVI_max, NDVI_mean
        return SatelliteStats(
            ndvi=BandData(
                min=stats.get('NDVI_min', 0),
                max=stats.get('NDVI_max', 0),
                mean=stats.get('NDVI_mean', 0),
                std_dev=stats.get('NDVI_stdDev', 0)
            ),
            metadata={"image_count": count, "provider": "GEE"}
        )

    async def get_tile_url(self, geometry: Geometry, date_range: DateRange, layer_type: str = "rgb") -> str:
        if not self._authenticated:
            await self.authenticate()

        region = self._get_geometry(geometry)
        
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(region) \
            .filterDate(date_range.start_date, date_range.end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            
        if layer_type == "ndvi":
            # NDVI Visualization
            def add_ndvi(image):
                ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
                return image.addBands(ndvi)
            
            # Use median to reduce clouds/shadows
            image = s2.map(add_ndvi).median().select('NDVI')
            vis_params = {
                'min': 0,
                'max': 1,
                'palette': ['red', 'yellow', 'green'] # Low vegetation -> High vegetation
            }
        else:
            # RGB Visualization (Default)
            vis_params = {
                'min': 0.0,
                'max': 3000,
                'bands': ['B4', 'B3', 'B2'],
            }
            image = s2.median()
        
        # Get map ID
        # Clip to the region so it looks clean (optional, but requested implicitly by user focused on "field")
        # .clip(region) might be expensive for tiles but let's try strict clipping for better visuals
        map_id = image.visualize(**vis_params).clip(region).getMapId()
        return map_id['tile_fetcher'].url_format
