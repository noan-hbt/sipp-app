import logging

from fastapi import FastAPI
from sqlalchemy import text

from app.api import auth, sips
from app.config import get_settings
from app.db import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()
if settings.env != "dev" and settings.jwt_secret == "change-me":
    raise RuntimeError("JWT_SECRET must be set outside dev")

app = FastAPI(title="Sipp API", version="0.1.0")
app.include_router(auth.router)
app.include_router(sips.router)


@app.get("/health", tags=["meta"])
async def health():
    async with SessionLocal() as s:
        await s.execute(text("select 1"))
    return {"status": "ok"}
