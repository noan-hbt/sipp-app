import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import billing
from app.api.schemas import PlanOut
from app.auth import current_user
from app.config import get_settings
from app.db import get_session
from app.models import BillingEvent, User
from app.plans import plan_status
from app.revenuecat import RevenueCatClient, RevenueCatError, get_revenuecat

log = logging.getLogger("sipp.billing")

router = APIRouter(prefix="/billing", tags=["billing"])


def _enabled() -> None:
    if not get_settings().billing_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"code": "billing_unavailable", "message": "subscriptions are not open yet"},
        )


@router.post("/sync", response_model=PlanOut)
async def sync(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    rc: RevenueCatClient = Depends(get_revenuecat),
):
    """Called by the app right after a purchase or a restore: access follows at once, not when the webhook lands."""
    _enabled()
    try:
        await billing.sync(session, user, rc)
    except RevenueCatError as e:
        log.error("revenuecat sync failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, {"code": "billing_provider_error", "message": "store unavailable"}
        ) from e
    await session.commit()
    return await plan_status(session, user)


@router.post("/webhook/revenuecat", status_code=200)
async def revenuecat_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    rc: RevenueCatClient = Depends(get_revenuecat),
):
    """At least once and possibly out of order: the body only says who changed; their state is re-read."""
    expected = get_settings().revenuecat_webhook_auth
    given = request.headers.get("Authorization") or ""
    if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"code": "invalid_signature", "message": "bad authorization"})
    try:
        event = json.loads(await request.body())["event"]
        event_id, event_type = str(event["id"]), str(event["type"])
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "malformed event") from e
    if await session.get(BillingEvent, event_id) is not None:
        return {"status": "duplicate"}
    # Any failure below returns 500, so RevenueCat retries the delivery.
    for user_id in billing.users_in_event(event):
        user = await session.get(User, user_id)
        if user is not None:
            await billing.sync(session, user, rc)
    session.add(BillingEvent(id=event_id, type=event_type[:60]))
    try:
        await session.commit()
    except IntegrityError:  # same event delivered twice concurrently
        await session.rollback()
        return {"status": "duplicate"}
    return {"status": "ok"}
