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

    async def get_tile_url(self, geometry: Geometry, date_range: DateRange) -> str:
        if not self._authenticated:
            await self.authenticate()

        region = self._get_geometry(geometry)
        
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(region) \
            .filterDate(date_range.start_date, date_range.end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            
        vis_params = {
            'min': 0.0,
            'max': 3000, # Sentinel-2 SR values are 0-10000 (scaled by 10k), so 3000 is ~0.3 reflectance
            'bands': ['B4', 'B3', 'B2'], # RGB
        }
        
        # Get map ID for the mosaic
        image = s2.median().visualize(**vis_params)
        map_id = image.getMapId()
        return map_id['tile_fetcher'].url_format
