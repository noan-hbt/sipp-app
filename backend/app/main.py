import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import assist, auth, concepts, programs, sips
from app.auth import validate_jwt_secret
from app.config import get_settings
from app.db import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()
validate_jwt_secret()

app = FastAPI(title="Sipp API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)
app.include_router(auth.router)
app.include_router(sips.router)
app.include_router(programs.router)
app.include_router(concepts.router)
app.include_router(assist.router)


@app.get("/health", tags=["meta"])
async def health():
    async with SessionLocal() as s:
        await s.execute(text("select 1"))
    return {"status": "ok"}
