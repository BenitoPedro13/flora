from functools import lru_cache
from .services.satellite.interface import SatelliteProvider
from .services.satellite.providers.gee import GEEProvider

@lru_cache()
def get_satellite_provider() -> SatelliteProvider:
    # Future: read env var to decide provider
    provider = GEEProvider()
    return provider
