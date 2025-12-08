from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import satellite

app = FastAPI(title="Flora Backend", description="Satellite Data API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(satellite.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "flora-backend"}
