# Flora Backend 🐍

FastAPI service for retrieving and processing satellite data.

## Features

- **Provider Pattern**: Abstracted data sources (Google Earth Engine, Sentinel Hub, etc.).
- **FastAPI**: High performance async API.
- **Geospatial**: Built-in support for GeoJSON and raster data.

## Setup

```bash
poetry install
poetry run uvicorn main:app --reload
```

## Environment Variables

Copy `.env.example` to `.env` (if applicable) and set:

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your service account key (for GEE).
