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
# Recommended
make auth
```

### 3. Configuration (.env)

If you are using a specific Google Cloud Project, create a `.env` file:

```bash
cp .env.example .env
# Edit .env and set GEE_PROJECT=your-project-id
```

### 4. Run Development Server

```bash
# From root
make dev
```

## Testing

```bash
cd apps/backend
poetry run pytest
```
