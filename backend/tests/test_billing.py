import hashlib
import hmac
import json
import time
from datetime import timedelta

import pytest
from sqlalchemy import func, select, update

from app import billing
from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import BillingEvent, BillingRecord, BillingSubscription, Sip, User, utcnow
from app.paddle import PaddleError, get_paddle

SECRET = "pdl_ntfset_test_secret"
PRICES = {
    "paddle_price_basic_month": "pri_basic_m",
    "paddle_price_basic_year": "pri_basic_y",
    "paddle_price_plus_month": "pri_plus_m",
    "paddle_price_plus_year": "pri_plus_y",
}


class FakePaddle:
    def __init__(self):
        self.transactions, self.cancelled, self.subs = [], [], {}
        self.fail = False

    async def create_transaction(self, price_id, custom_data, customer_id):
        if self.fail:
            raise PaddleError("down")
        self.transactions.append((price_id, custom_data, customer_id))
        return f"txn_{len(self.transactions)}"

    async def get_subscription(self, subscription_id):
        return self.subs[subscription_id]

    async def cancel_subscription(self, subscription_id):
        if self.fail:
            raise PaddleError("down")
        self.cancelled.append(subscription_id)
        return {}

    async def portal_urls(self, customer_id, subscription_id):
        return {"url": f"https://portal/{customer_id}", "cancel_url": f"https://portal/cancel/{subscription_id}"}


@pytest.fixture
def paddle(monkeypatch):
    s = get_settings()
    for k, v in {"paddle_api_key": "key", "paddle_webhook_secret": SECRET, "paddle_client_token": "test_tok", **PRICES}.items():
        monkeypatch.setattr(s, k, v)
    fake = FakePaddle()
    app.dependency_overrides[get_paddle] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_paddle, None)


async def _user() -> User:
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="free", plan_expires_at=None))
        await s.commit()
        return await s.scalar(select(User))


def _sign(raw: bytes, ts: int | None = None, secret: str = SECRET) -> str:
    ts = ts or int(time.time())
    return f"ts={ts};h1=" + hmac.new(secret.encode(), f"{ts}:".encode() + raw, hashlib.sha256).hexdigest()


def _iso(dt) -> str:
    return dt.isoformat().replace("+00:00", "Z")


_n = 0


async def _send(client, event_type: str, data: dict, occurred_at=None, event_id: str | None = None):
    global _n
    _n += 1
    raw = json.dumps({
        "event_id": event_id or f"evt_{_n}",
        "event_type": event_type,
        "occurred_at": _iso(occurred_at or utcnow()),
        "data": data,
    }).encode()
    return await client.post(
        "/billing/webhook/paddle", content=raw, headers={"Paddle-Signature": _sign(raw), "Content-Type": "application/json"}
    )


def _sub(user_id: str | None, status="active", price="pri_basic_m", ends=None, scheduled=None, sid="sub_1"):
    return {
        "id": sid,
        "status": status,
        "customer_id": "ctm_1",
        "custom_data": {"user_id": user_id} if user_id else None,
        "items": [{"price": {"id": price}, "quantity": 1}],
        "current_billing_period": {"starts_at": _iso(utcnow()), "ends_at": _iso(ends or utcnow() + timedelta(days=30))},
        "scheduled_change": scheduled,
    }


async def _plan(client) -> dict:
    return (await client.get("/auth/me/plan")).json()


async def test_billing_disabled_by_default(auth_client):
    assert (await _plan(auth_client))["billing_enabled"] is False
    r = await auth_client.post("/billing/checkout", json={"plan": "basic", "interval": "month", "consent": True})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "billing_unavailable"
    plans = (await auth_client.get("/auth/plans")).json()
    assert plans[1]["prices"] == {"month": 599, "year": 5990} and plans[0]["prices"] == {}


async def test_checkout_resolves_price_server_side_and_needs_consent(auth_client, paddle):
    user = await _user()
    r = await auth_client.post("/billing/checkout", json={"plan": "plus", "interval": "year", "consent": False})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "consent_required"
    r = await auth_client.post("/billing/checkout", json={"plan": "plus", "interval": "year", "consent": True})
    assert r.status_code == 200
    body = r.json()
    assert body["transaction_id"] == "txn_1" and body["client_token"] == "test_tok"
    assert body["success_url"].endswith("/billing/return")
    price, custom, customer = paddle.transactions[0]
    assert price == "pri_plus_y" and custom["user_id"] == user.id and "immediate_access_requested_at" in custom
    assert customer is None
    r = await auth_client.post("/billing/checkout", json={"plan": "max", "interval": "year", "consent": True})
    assert r.status_code == 422


async def test_provider_down_is_a_clear_error(auth_client, paddle):
    await _user()
    paddle.fail = True
    r = await auth_client.post("/billing/checkout", json={"plan": "basic", "interval": "month", "consent": True})
    assert r.status_code == 502 and r.json()["detail"]["code"] == "billing_provider_error"


async def test_signature_invalid_or_expired_is_rejected(client, paddle):
    raw = b'{"event_id":"evt_x","event_type":"subscription.created","data":{}}'
    for header in (None, "ts=1;h1=deadbeef", _sign(raw, secret="other"), _sign(raw, ts=int(time.time()) - 3600)):
        r = await client.post("/billing/webhook/paddle", content=raw, headers={"Paddle-Signature": header} if header else {})
        assert r.status_code == 401
    # Secret rotation: any matching h1 is accepted.
    ok = _sign(raw)
    assert billing.verify_signature(raw, ok.replace(";h1=", ";h1=00ff;h1="))


async def test_activation_then_duplicate_then_double_checkout(auth_client, paddle):
    user = await _user()
    ends = utcnow() + timedelta(days=30)
    r = await _send(auth_client, "subscription.created", _sub(user.id, ends=ends), event_id="evt_same")
    assert r.json() == {"status": "ok"}
    p = await _plan(auth_client)
    assert p["plan"] == "basic" and not p["on_trial"]
    assert p["subscription"]["status"] == "active" and p["subscription"]["interval"] == "month"
    assert (await _send(auth_client, "subscription.created", _sub(user.id), event_id="evt_same")).json() == {"status": "duplicate"}
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(BillingEvent)) == 1
        assert (await s.get(User, user.id)).billing_customer_id == "ctm_1"
    r = await auth_client.post("/billing/checkout", json={"plan": "plus", "interval": "month", "consent": True})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_subscribed"
    r = await auth_client.post("/billing/portal")
    assert r.json() == {"url": "https://portal/ctm_1", "cancel_url": "https://portal/cancel/sub_1"}


async def test_out_of_order_event_never_overwrites_newer_state(auth_client, paddle):
    user = await _user()
    now = utcnow()
    await _send(auth_client, "subscription.updated", _sub(user.id, price="pri_plus_m"), occurred_at=now)
    await _send(auth_client, "subscription.created", _sub(user.id, price="pri_basic_m"), occurred_at=now - timedelta(minutes=5))
    assert (await _plan(auth_client))["plan"] == "plus"


async def test_owner_found_from_transaction_when_subscription_lacks_custom_data(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(None))
    assert (await _plan(auth_client))["plan"] == "free"
    await _send(auth_client, "transaction.completed", {
        "id": "txn_9", "status": "completed", "customer_id": "ctm_1", "subscription_id": "sub_1",
        "custom_data": {"user_id": user.id}, "invoice_number": "325-1",
        "details": {"totals": {"total": "599", "tax": "100", "currency_code": "EUR"}},
    })
    assert (await _plan(auth_client))["plan"] == "basic"
    async with SessionLocal() as s:
        rec = await s.get(BillingRecord, "txn_9")
        assert (rec.total, rec.tax, rec.currency, rec.user_id) == (599, 100, "EUR", user.id)


async def test_past_due_keeps_access_for_grace_then_falls_back(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(user.id))
    await _send(auth_client, "subscription.past_due", _sub(user.id, status="past_due"))
    p = await _plan(auth_client)
    assert p["plan"] == "basic" and p["subscription"]["status"] == "past_due"
    async with SessionLocal() as s:
        u = await s.get(User, user.id)
        grace = billing._aware(u.plan_expires_at) - utcnow()
        assert timedelta(days=6) < grace <= timedelta(days=get_settings().billing_grace_days)
        await s.execute(update(User).values(plan_expires_at=utcnow() - timedelta(seconds=1)))
        await s.commit()
    assert (await _plan(auth_client))["plan"] == "free"


async def test_scheduled_cancel_keeps_access_until_canceled(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(user.id))
    await _send(auth_client, "subscription.updated", _sub(user.id, scheduled={"action": "cancel", "effective_at": _iso(utcnow())}))
    p = await _plan(auth_client)
    assert p["plan"] == "basic" and p["subscription"]["cancel_at_period_end"] is True
    await _send(auth_client, "subscription.canceled", _sub(user.id, status="canceled"))
    p = await _plan(auth_client)
    assert p["plan"] == "free" and p["subscription"] is None


async def test_downgrade_keeps_sips_but_blocks_creation(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(user.id))
    for topic in ("le café", "le thé"):
        assert (await auth_client.post("/sips", json={"input": topic})).status_code == 202
    await _send(auth_client, "subscription.canceled", _sub(user.id, status="canceled"))
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Sip)) == 2
    r = await auth_client.post("/sips", json={"input": "la bière"})
    assert r.status_code == 402


async def test_refund_and_chargeback_are_recorded(auth_client, paddle):
    user = await _user()
    for adj, action in (("adj_1", "refund"), ("adj_2", "chargeback")):
        await _send(auth_client, "adjustment.created", {
            "id": adj, "action": action, "status": "approved", "transaction_id": "txn_1",
            "subscription_id": "sub_1", "customer_id": "ctm_1", "custom_data": {"user_id": user.id},
            "totals": {"total": "599", "tax": "100", "currency_code": "EUR"},
        })
    async with SessionLocal() as s:
        recs = (await s.scalars(select(BillingRecord).order_by(BillingRecord.id))).all()
        assert [(r.kind, r.action, r.total) for r in recs] == [("adjustment", "refund", 599), ("adjustment", "chargeback", 599)]


async def test_unknown_price_is_ignored(auth_client, paddle):
    user = await _user()
    assert (await _send(auth_client, "subscription.created", _sub(user.id, price="pri_other"))).status_code == 200
    assert (await _plan(auth_client))["plan"] == "free"


async def test_internal_plan_is_never_touched(auth_client, paddle):
    user = await _user()
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="max"))
        await s.commit()
    await _send(auth_client, "subscription.created", _sub(user.id))
    assert (await _plan(auth_client))["plan"] == "max"


async def test_account_deletion_cancels_subscription_and_keeps_records(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(user.id))
    paddle.fail = True
    r = await auth_client.request("DELETE", "/auth/me", json={"password": "password123"})
    assert r.status_code == 502 and r.json()["detail"]["code"] == "billing_cancel_failed"
    paddle.fail = False
    r = await auth_client.request("DELETE", "/auth/me", json={"password": "password123"})
    assert r.status_code == 204 and paddle.cancelled == ["sub_1"]
    async with SessionLocal() as s:
        sub = await s.get(BillingSubscription, "sub_1")
        assert sub.user_id is None and sub.status == "canceled"
        assert await s.get(User, user.id) is None


async def test_reconcile_rereads_stale_live_subscriptions(auth_client, paddle):
    user = await _user()
    await _send(auth_client, "subscription.created", _sub(user.id))
    async with SessionLocal() as s:
        await s.execute(update(BillingSubscription).values(updated_at=utcnow() - timedelta(days=2)))
        await s.commit()
    paddle.subs["sub_1"] = _sub(user.id, status="canceled")
    async with SessionLocal() as s:
        assert await billing.reconcile(s, paddle) == 1
    assert (await _plan(auth_client))["plan"] == "free"
