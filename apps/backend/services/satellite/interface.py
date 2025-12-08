from abc import ABC, abstractmethod
from typing import Dict, Any
from .models import Geometry, DateRange, SatelliteStats

class SatelliteProvider(ABC):
    """
    Abstract Base Class for Satellite Data Providers.
    Follows the Strategy Pattern to allow swapping between GEE, Sentinel Hub, etc.
    """

    @abstractmethod
    async def authenticate(self) -> bool:
        """
        Authenticate with the provider.
        Returns True if successful.
        """
        pass

    @abstractmethod
    async def get_stats(self, geometry: Geometry, date_range: DateRange) -> SatelliteStats:
        """
        Calculate statistics (e.g., NDVI) for a given geometry and date range.
        """
        pass
    
    @abstractmethod
    async def get_tile_url(self, geometry: Geometry, date_range: DateRange) -> str:
        """
        Get a tile layer URL for visualization.
        """
        pass
