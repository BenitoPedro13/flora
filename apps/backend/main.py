from fastapi import FastAPI

app = FastAPI(title="Flora Backend", description="Satellite Data API")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "flora-backend"}
