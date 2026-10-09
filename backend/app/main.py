import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.responses import JSONResponse

from app.api import assist, auth, billing, concepts, learning, programs, sips
from app.auth import validate_jwt_secret
from app.config import get_settings
from app.db import SessionLocal
from app.observability import init_sentry

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()
validate_jwt_secret()
init_sentry("api")


class AnswerBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/lessons/") or not path.endswith(("/complete", "/resume")):
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > 65536:
                return await JSONResponse({"detail": "request body is too large"}, status_code=413)(scope, receive, send)
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        sent = False

        async def replay():
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


app = FastAPI(title="Sipp API", version="0.1.0")
app.add_middleware(AnswerBodyLimit)
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
app.include_router(billing.router)
app.include_router(learning.router)


@app.get("/health", tags=["meta"])
async def health():
    async with SessionLocal() as s:
        await s.execute(text("select 1"))
    return {"status": "ok"}
