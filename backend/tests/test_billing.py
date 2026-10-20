import json
from datetime import timedelta

import pytest
from sqlalchemy import func, select, update

from app import billing
from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import BillingEvent, BillingSubscription, Sip, User, utcnow
from app.revenuecat import RevenueCatError, get_revenuecat

AUTH = "Bearer rc_webhook_test_secret"


class FakeRevenueCat:
    """RevenueCat as the App Store left it: subscriptions per app user id."""

    def __init__(self):
        self.customers: dict[str, dict] = {}
        self.deleted: list[str] = []
        self.fail = False

    async def subscriber(self, app_user_id):
        if self.fail:
            raise RevenueCatError("down")
        return {"subscriptions": self.customers.get(app_user_id, {})}

    async def delete_subscriber(self, app_user_id):
        if self.fail:
            raise RevenueCatError("down")
        self.deleted.append(app_user_id)


@pytest.fixture
def rc(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "revenuecat_secret_key", "sk_test")
    monkeypatch.setattr(s, "revenuecat_webhook_auth", AUTH)
    fake = FakeRevenueCat()
    app.dependency_overrides[get_revenuecat] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_revenuecat, None)


async def _user() -> User:
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="free", plan_expires_at=None))
        await s.commit()
        return await s.scalar(select(User))


def _iso(dt) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _entry(days=30, period="normal", **extra) -> dict:
    return {
        "expires_date": _iso(utcnow() + timedelta(days=days)),
        "purchase_date": _iso(utcnow() - timedelta(days=1)),
        "period_type": period,
        "store": "app_store",
        "is_sandbox": True,
        "unsubscribe_detected_at": None,
        "billing_issues_detected_at": None,
        "grace_period_expires_date": None,
        "refunded_at": None,
        **extra,
    }


_n = 0


async def _webhook(client, *user_ids, event_type="RENEWAL", event_id=None, auth=AUTH):
    global _n
    _n += 1
    event = {"id": event_id or f"evt_{_n}", "type": event_type, "app_user_id": user_ids[0] if user_ids else None}
    if len(user_ids) > 1:
        event.update(type="TRANSFER", transferred_from=[user_ids[0]], transferred_to=list(user_ids[1:]))
    return await client.post(
        "/billing/webhook/revenuecat", content=json.dumps({"api_version": "1.0", "event": event}),
        headers={"Authorization": auth, "Content-Type": "application/json"},
    )


async def _plan(client) -> dict:
    return (await client.get("/auth/me/plan")).json()


async def test_billing_disabled_by_default(auth_client):
    assert (await auth_client.post("/billing/sync")).status_code == 503
    p = await _plan(auth_client)
    assert p["billing_enabled"] is False and p["subscription"] is None


async def test_public_plans_carry_the_store_products(client):
    plans = {p["name"]: p for p in (await client.get("/auth/plans")).json()}
    assert plans["basic"]["products"] == {"month": "sipp_basic_month", "year": "sipp_basic_year"}
    assert plans["free"]["products"] == {}


async def test_purchase_then_sync_grants_the_plan_at_once(auth_client, rc):
    user = await _user()
    assert (await _plan(auth_client))["trial_available"]
    rc.customers[user.id] = {"sipp_basic_year": _entry(days=7, period="trial")}
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "basic" and p["on_trial"] and not p["trial_available"]
    assert p["subscription"]["status"] == "trialing" and p["subscription"]["interval"] == "year"
    assert (await auth_client.post("/sips", json={"input": "le café"})).json()["lite"] is False


async def test_webhook_needs_the_shared_secret_and_is_deduplicated(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"sipp_plus_month": _entry()}
    assert (await _webhook(auth_client, user.id, auth="Bearer nope")).status_code == 401
    assert (await _webhook(auth_client, user.id, event_id="evt_dup")).json() == {"status": "ok"}
    assert (await _plan(auth_client))["plan"] == "plus"
    rc.fail = True  # a duplicate never reaches RevenueCat
    assert (await _webhook(auth_client, user.id, event_id="evt_dup")).json() == {"status": "duplicate"}
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(BillingEvent)) == 1


async def test_store_down_is_retried_by_the_webhook(auth_client, rc):
    user = await _user()
    rc.fail = True
    assert (await auth_client.post("/billing/sync")).status_code == 502
    with pytest.raises(RevenueCatError):  # 500 for RevenueCat, which redelivers
        await _webhook(auth_client, user.id)
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(BillingEvent)) == 0


async def test_test_events_and_unknown_users_are_acknowledged(auth_client, rc):
    assert (await _webhook(auth_client, "$RCAnonymousID:abc", event_type="TEST")).json() == {"status": "ok"}
    assert (await _webhook(auth_client, "someone-else")).json() == {"status": "ok"}


async def test_billing_issue_keeps_access_through_the_grace_period(auth_client, rc):
    user = await _user()
    grace = utcnow() + timedelta(days=6)
    rc.customers[user.id] = {"sipp_basic_month": _entry(
        days=-1, billing_issues_detected_at=_iso(utcnow() - timedelta(days=1)), grace_period_expires_date=_iso(grace),
    )}
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "basic" and p["subscription"]["status"] == "past_due"
    rc.customers[user.id]["sipp_basic_month"]["grace_period_expires_date"] = _iso(utcnow() - timedelta(minutes=1))
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "free" and p["subscription"] is None


async def test_cancelled_keeps_access_until_the_period_ends(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"sipp_basic_month": _entry(days=10, unsubscribe_detected_at=_iso(utcnow()))}
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "basic" and p["subscription"]["cancel_at_period_end"] is True
    # Without any webhook, access ends with the period (plus the slack for a late renewal).
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan_expires_at=utcnow() - timedelta(minutes=1)))
        await s.commit()
    assert (await _plan(auth_client))["plan"] == "free"


async def test_refund_and_expiry_fall_back_to_free_but_keep_sips(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"sipp_plus_year": _entry()}
    await auth_client.post("/billing/sync")
    for topic in ("le café", "le thé"):
        assert (await auth_client.post("/sips", json={"input": topic})).status_code == 202
    rc.customers[user.id]["sipp_plus_year"]["refunded_at"] = _iso(utcnow())
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "free" and not p["trial_available"]
    r = await auth_client.post("/sips", json={"input": "la bière"})
    assert r.status_code == 402
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Sip)) == 2


async def test_upgrade_takes_the_best_plan(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {
        "sipp_basic_month": _entry(days=-2),
        "sipp_plus_month": _entry(days=30),
    }
    p = (await auth_client.post("/billing/sync")).json()
    assert p["plan"] == "plus"


async def test_a_purchase_restored_on_another_account_moves_there(client, rc):
    tokens = []
    for email in ("one@b.co", "two@b.co"):
        r = await client.post("/auth/register", json={"email": email, "password": "password123"})
        tokens.append(r.json()["access_token"])
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="free"))
        await s.commit()
        one, two = (await s.scalars(select(User).order_by(User.email))).all()
    rc.customers[one.id] = {"sipp_basic_month": _entry()}
    await client.post("/billing/sync", headers={"Authorization": f"Bearer {tokens[0]}"})
    rc.customers[two.id], rc.customers[one.id] = rc.customers[one.id], {}
    assert (await _webhook(client, one.id, two.id)).status_code == 200
    plans = [(await client.get("/auth/me/plan", headers={"Authorization": f"Bearer {t}"})).json()["plan"] for t in tokens]
    assert plans == ["free", "basic"]


async def test_unknown_products_and_internal_plans_are_left_alone(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"some_old_product": _entry()}
    assert (await auth_client.post("/billing/sync")).json()["plan"] == "free"
    async with SessionLocal() as s:
        await s.execute(update(User).values(plan="max"))
        await s.commit()
    rc.customers[user.id] = {"sipp_basic_month": _entry()}
    assert (await auth_client.post("/billing/sync")).json()["plan"] == "max"


async def test_account_deletion_erases_the_customer_and_keeps_the_record(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"sipp_basic_month": _entry()}
    await auth_client.post("/billing/sync")
    r = await auth_client.request("DELETE", "/auth/me", json={"password": "password123"})
    assert r.status_code == 204 and rc.deleted == [user.id]
    async with SessionLocal() as s:
        sub = await s.scalar(select(BillingSubscription))
        assert sub.user_id is None and sub.product_id == "sipp_basic_month"


async def test_reconcile_rereads_stale_live_subscriptions(auth_client, rc):
    user = await _user()
    rc.customers[user.id] = {"sipp_basic_month": _entry()}
    await auth_client.post("/billing/sync")
    rc.customers[user.id] = {"sipp_basic_month": _entry(days=-3)}  # lapsed, webhook lost
    async with SessionLocal() as s:
        assert await billing.reconcile(s, rc) == 0  # fresh: left alone
        await s.execute(update(BillingSubscription).values(updated_at=utcnow() - timedelta(days=1)))
        await s.commit()
        assert await billing.reconcile(s, rc) == 1
    assert (await _plan(auth_client))["plan"] == "free"
