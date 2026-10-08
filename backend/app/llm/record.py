from app.db import SessionLocal
from app.llm.client import CallRecord, ChatClient, OpenRouterClient, StructuredLLM
from app.models import Sip
from app.quota import finish_call, reserve_call


def make_llm(
    client: ChatClient | None = None,
    sip_id: str | None = None,
    lesson_id: str | None = None,
    user_id: str | None = None,
) -> StructuredLLM:
    """Reserve budget and log every attempt, including validation retries."""

    async def reserve(stage: str, model: str) -> str:
        async with SessionLocal() as s:
            owner = user_id
            if owner is None and sip_id:
                sip = await s.get(Sip, sip_id)
                owner = sip.user_id if sip else None
            if owner is None:
                raise ValueError("LLM calls require a user_id or an existing Sip")
            call = await reserve_call(s, owner, stage, model, sip_id, lesson_id)
            await s.commit()
            return call.id

    async def record(rec: CallRecord) -> None:
        async with SessionLocal() as s:
            await finish_call(s, rec.reservation_id, rec)
            await s.commit()

    return StructuredLLM(client=client or OpenRouterClient(), recorder=record, reserver=reserve)
