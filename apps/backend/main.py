from fastapi import FastAPI
from .routers import satellite

app = FastAPI(title="Flora Backend", description="Satellite Data API")

app.include_router(satellite.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "flora-backend"}
