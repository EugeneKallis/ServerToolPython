from fastapi import FastAPI, Request
from datetime import datetime

app = FastAPI()

@app.get("/")
async def index(request: Request):
    return {
        "status": "online",
        "message": "ServerToolPython API",
        "version": "1.0.0-core",
        "timestamp": datetime.now().isoformat()
    }