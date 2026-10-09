import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import billing
from app.api.schemas import CheckoutIn, CheckoutOut, PortalOut
from app.auth import current_user
from app.config import get_settings
from app.db import get_session
from app.models import BillingEvent, User, utcnow
from app.paddle import PaddleClient, PaddleError, get_paddle

log = logging.getLogger("sipp.billing")

router = APIRouter(prefix="/billing", tags=["billing"])


def _enabled() -> None:
    if not get_settings().billing_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"code": "billing_unavailable", "message": "subscriptions are not open yet"},
        )


def _paddle_down(e: PaddleError) -> HTTPException:
    log.error("paddle call failed: %s", e)
    return HTTPException(
        status.HTTP_502_BAD_GATEWAY, {"code": "billing_provider_error", "message": "payment provider unavailable"}
    )


@router.post("/checkout", response_model=CheckoutOut)
async def checkout(
    body: CheckoutIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    paddle: PaddleClient = Depends(get_paddle),
):
    """Creates the Paddle transaction that Paddle.js opens. Plan changes go through the portal."""
    _enabled()
    s = get_settings()
    if not body.consent:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, {"code": "consent_required", "message": "immediate access must be requested"}
        )
    if user.plan not in billing.MANAGED_PLANS:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "already_subscribed", "message": "internal plan"})
    if await billing.live_subscription(session, user.id) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"code": "already_subscribed", "message": "manage the subscription instead"}
        )
    price_id = s.paddle_prices()[(body.plan, body.interval)]
    custom_data = {"user_id": user.id, "immediate_access_requested_at": utcnow().isoformat()}
    try:
        txn = await paddle.create_transaction(price_id, custom_data, user.billing_customer_id)
    except PaddleError as e:
        raise _paddle_down(e) from e
    return CheckoutOut(
        transaction_id=txn,
        client_token=s.paddle_client_token,
        environment=s.paddle_env,
        success_url=f"{s.public_app_url.rstrip('/')}/billing/return",
    )


@router.post("/portal", response_model=PortalOut)
async def portal(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    paddle: PaddleClient = Depends(get_paddle),
):
    """Paddle's customer portal: invoices, payment method, plan change and cancellation."""
    _enabled()
    sub = await billing.live_subscription(session, user.id)
    customer = user.billing_customer_id or (sub.customer_id if sub else None)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, {"code": "no_subscription", "message": "no subscription"})
    try:
        return PortalOut(**await paddle.portal_urls(customer, sub.id if sub else None))
    except PaddleError as e:
        raise _paddle_down(e) from e


@router.post("/webhook/paddle", status_code=200)
async def paddle_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    """Signed, at-least-once and possibly out of order: verified, deduplicated, ordered by occurred_at."""
    raw = await request.body()
    if not billing.verify_signature(raw, request.headers.get("Paddle-Signature")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"code": "invalid_signature", "message": "bad signature"})
    try:
        event = json.loads(raw)
        event_id, event_type = event["event_id"], event["event_type"]
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "malformed event") from e
    if await session.get(BillingEvent, event_id) is not None:
        return {"status": "duplicate"}
    # Any failure below returns 500, so Paddle retries the delivery.
    await billing.handle_event(session, event)
    session.add(BillingEvent(id=event_id, type=event_type, occurred_at=billing.parse_dt(event.get("occurred_at"))))
    try:
        await session.commit()
    except IntegrityError:  # same event delivered twice concurrently
        await session.rollback()
        return {"status": "duplicate"}
    return {"status": "ok"}
