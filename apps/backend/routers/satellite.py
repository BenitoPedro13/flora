from fastapi import APIRouter, Depends, HTTPException
from ..dependencies import get_satellite_provider
from ..services.satellite.interface import SatelliteProvider
from ..services.satellite.models import SatelliteStats, Geometry, DateRange

router = APIRouter(prefix="/satellite", tags=["satellite"])

@router.post("/stats", response_model=SatelliteStats)
async def get_stats(
    geometry: Geometry,
    date_range: DateRange,
    provider: SatelliteProvider = Depends(get_satellite_provider)
):
    try:
        return await provider.get_stats(geometry, date_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tile", response_model=str)
async def get_tile(
    geometry: Geometry,
    date_range: DateRange,
    provider: SatelliteProvider = Depends(get_satellite_provider)
):
    try:
        return await provider.get_tile_url(geometry, date_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
