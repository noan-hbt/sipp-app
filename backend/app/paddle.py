"""Thin Paddle Billing API client (merchant of record). Swapped for a fake in tests."""

from typing import Any

import httpx

from app.config import get_settings


class PaddleError(Exception):
    pass


class PaddleClient:
    def __init__(self, http: httpx.AsyncClient | None = None):
        s = get_settings()
        base = "https://api.paddle.com" if s.paddle_env == "production" else "https://sandbox-api.paddle.com"
        self._http = http or httpx.AsyncClient(
            base_url=base,
            headers={"Authorization": f"Bearer {s.paddle_api_key}", "Content-Type": "application/json"},
            timeout=20.0,
        )

    async def _call(self, method: str, path: str, json: dict | None = None) -> dict[str, Any]:
        try:
            r = await self._http.request(method, path, json=json)
        except httpx.HTTPError as e:
            raise PaddleError(f"{method} {path}: {type(e).__name__}") from e
        if r.status_code >= 400:
            raise PaddleError(f"{method} {path}: HTTP {r.status_code} {r.text[:300]}")
        return r.json()["data"]

    async def create_transaction(self, price_id: str, custom_data: dict, customer_id: str | None) -> str:
        """A checkout-ready transaction; Paddle.js opens it, so the client never picks price or owner."""
        body: dict[str, Any] = {"items": [{"price_id": price_id, "quantity": 1}], "custom_data": custom_data}
        if customer_id:
            body["customer_id"] = customer_id
        return (await self._call("POST", "/transactions", body))["id"]

    async def get_subscription(self, subscription_id: str) -> dict[str, Any]:
        return await self._call("GET", f"/subscriptions/{subscription_id}")

    async def cancel_subscription(self, subscription_id: str) -> dict[str, Any]:
        return await self._call(
            "POST", f"/subscriptions/{subscription_id}/cancel", {"effective_from": "immediately"}
        )

    async def portal_urls(self, customer_id: str, subscription_id: str | None) -> dict[str, str | None]:
        body = {"subscription_ids": [subscription_id]} if subscription_id else {}
        urls = (await self._call("POST", f"/customers/{customer_id}/portal-sessions", body))["urls"]
        subs = urls.get("subscriptions") or [{}]
        return {"url": urls["general"]["overview"], "cancel_url": subs[0].get("cancel_subscription")}


_client: PaddleClient | None = None


def get_paddle() -> PaddleClient:
    """FastAPI dependency; tests override it."""
    global _client
    if _client is None:
        _client = PaddleClient()
    return _client
