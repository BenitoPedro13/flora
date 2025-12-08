# Flora 🛰️🌱

Vegetation Analysis & Visualization Platform.

## 🏗️ Project Structure

This is a monorepo containing:

- **[`apps/frontend`](./apps/frontend)**: Next.js Web Application (Leaflet Map, Dashboard).
- **[`apps/backend`](./apps/backend)**: FastAPI Service (Satellite Data Provider, GEE Integration).

## 🚀 Quick Start

### Prerequisites

- Node.js (v22+) & pnpm
- Python (v3.9+) & Poetry
- Make (optional)

### Running Locally

1. **Install Dependencies**:

   ```bash
   make install
   ```

2. **Start Development Servers**:
   ```bash
   make dev
   ```
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend: [http://localhost:8000/docs](http://localhost:8000/docs)

## 🛠️ Commands

- `make install`: Install dependencies for both apps.
- `make auth`: Authenticate with Google Earth Engine (Required).
- `make dev`: Start both servers.
- `make lint`: Run linters.
- `make test`: Run unit tests.

## ✨ Features

- **Satellite Analysis**:
  - Real-time **NDVI** (Vegetation Health) calculation using Sentinel-2.
  - **True Color** (RGB) satellite imagery overlay.
- **Interactive Map**:
  - Draw Field Polygons.
  - Switch between Street and Satellite base maps.
  - Live Dashboard side-panel.
- **Modern Tech**:
  - **Monorepo**: Turbo/Make managed.
  - **Backend**: FastAPI, Google Earth Engine, Pydantic.
  - **Frontend**: Next.js 16, React Leaflet, TailwindCSS.
