from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from datetime import datetime

app = FastAPI()
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("home.html",{"request": request, 
        "groups": [],
        "rd_days": 100,
        "version": "1.0.0-core"
        })