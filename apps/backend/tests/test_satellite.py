import pytest
from unittest.mock import MagicMock, patch
from services.satellite.providers.gee import GEEProvider
from services.satellite.models import Geometry, DateRange

@pytest.mark.asyncio
async def test_gee_provider_auth_failure():
    """Test that authentication handles failure gracefully."""
    with patch("ee.Initialize", side_effect=Exception("Auth Fail")):
        provider = GEEProvider()
        result = await provider.authenticate()
        assert result is False

@pytest.mark.asyncio
async def test_get_stats_flow():
    """Test get_stats calls GEE correctly."""
    # Patch the 'ee' module imported in the provider file
    with patch("services.satellite.providers.gee.ee") as mock_ee:
        
        # Setup mocks
        mock_image_collection = MagicMock()
        mock_ee.ImageCollection.return_value = mock_image_collection
        mock_image_collection.filterBounds.return_value = mock_image_collection
        mock_image_collection.filterDate.return_value = mock_image_collection
        mock_image_collection.filter.return_value = mock_image_collection
        mock_image_collection.map.return_value = mock_image_collection
        
        # Mock Filter.lt
        mock_ee.Filter.lt.return_value = "mock_filter"

        # Mock size() call
        mock_size = MagicMock()
        mock_size.getInfo.return_value = 5 # 5 images found
        mock_image_collection.size.return_value = mock_size
        
        # Mock median() and reduceRegion()
        mock_image = MagicMock()
        mock_image_collection.median.return_value = mock_image
        mock_reduce_result = MagicMock()
        mock_reduce_result.getInfo.return_value = {
            'NDVI_min': 0.1, 'NDVI_max': 0.8, 'NDVI_mean': 0.5, 'NDVI_stdDev': 0.1
        }
        mock_image.reduceRegion.return_value = mock_reduce_result

        provider = GEEProvider()
        
        geo = Geometry(type="Polygon", coordinates=[[[0,0], [1,0], [1,1], [0,1], [0,0]]])
        dates = DateRange(start_date="2023-01-01", end_date="2023-01-31")
        
        stats = await provider.get_stats(geo, dates)
        
        assert stats.ndvi.mean == 0.5
        assert stats.metadata['image_count'] == 5
