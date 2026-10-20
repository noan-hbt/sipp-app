"""Thin RevenueCat REST client (v1). RevenueCat owns the App Store receipts; swapped for a fake in tests."""

from typing import Any
from urllib.parse import quote

import httpx

from app.config import get_settings


class RevenueCatError(Exception):
    pass


class RevenueCatClient:
    def __init__(self, http: httpx.AsyncClient | None = None):
        s = get_settings()
        self._http = http or httpx.AsyncClient(
            base_url="https://api.revenuecat.com/v1",
            headers={"Authorization": f"Bearer {s.revenuecat_secret_key}", "Content-Type": "application/json"},
            timeout=20.0,
        )

    async def _call(self, method: str, path: str) -> dict[str, Any]:
        try:
            r = await self._http.request(method, path)
        except httpx.HTTPError as e:
            raise RevenueCatError(f"{method} {path}: {type(e).__name__}") from e
        if r.status_code >= 400:
            raise RevenueCatError(f"{method} {path}: HTTP {r.status_code} {r.text[:300]}")
        return r.json() if r.content else {}

    async def subscriber(self, app_user_id: str) -> dict[str, Any]:
        """The customer's purchases as RevenueCat sees them now (creates an empty customer if unknown)."""
        return (await self._call("GET", f"/subscribers/{quote(app_user_id, safe='')}"))["subscriber"]

    async def delete_subscriber(self, app_user_id: str) -> None:
        """Erases the customer at RevenueCat (account deletion). The App Store subscription itself is the user's."""
        await self._call("DELETE", f"/subscribers/{quote(app_user_id, safe='')}")


_client: RevenueCatClient | None = None


def get_revenuecat() -> RevenueCatClient:
    """FastAPI dependency; tests override it."""
    global _client
    if _client is None:
        _client = RevenueCatClient()
    return _client
