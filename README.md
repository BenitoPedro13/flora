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

- `make lint`: Run linters for both projects.
- `make test`: Run unit tests.
