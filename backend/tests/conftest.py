import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db}"
os.environ["JWT_SECRET"] = "test-secret-0123456789abcdef0123456789"
os.environ["ENV"] = "dev"
os.environ["DEFAULT_PLAN"] = "max"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
async def _db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth_client(client):
    r = await client.post("/auth/register", json={"email": "a@b.co", "password": "password123"})
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return client
