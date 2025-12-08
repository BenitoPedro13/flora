# Flora Backend

FastAPI service for the Flora satellite visualization app.

## Setup

### 1. Install Dependencies

```bash
cd apps/backend
poetry install
```

### 2. Google Earth Engine Authentication (Required)

You must authenticate with your Google account to access satellite data.

```bash
cd apps/backend
poetry run earthengine authenticate
```

Follow the instructions in the terminal (it will open a browser window).

### 3. Run Development Server

```bash
# From root
make dev
```

## Testing

```bash
cd apps/backend
poetry run pytest
```
