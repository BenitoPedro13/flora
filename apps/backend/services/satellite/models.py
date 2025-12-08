from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class Geometry(BaseModel):
    type: str # e.g., "Polygon"
    coordinates: List[List[List[float]]] # GeoJSON coordinates

class DateRange(BaseModel):
    start_date: str # YYYY-MM-DD
    end_date: str   # YYYY-MM-DD

class BandData(BaseModel):
    min: float
    max: float
    mean: float
    std_dev: Optional[float] = None

class SatelliteStats(BaseModel):
    ndvi: Optional[BandData] = None
    rgb_url: Optional[str] = None # Tile URL or similar
    metadata: Dict[str, Any] = {}
