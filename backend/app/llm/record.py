from app.db import SessionLocal
from app.llm.client import CallRecord, ChatClient, OpenRouterClient, StructuredLLM
from app.models import LLMCall


def make_llm(
    client: ChatClient | None = None,
    sip_id: str | None = None,
    lesson_id: str | None = None,
    user_id: str | None = None,
) -> StructuredLLM:
    """A StructuredLLM that logs every call (cost, latency) to `llm_calls`."""

    async def record(rec: CallRecord) -> None:
        c = rec.completion
        async with SessionLocal() as s:
            s.add(
                LLMCall(
                    stage=rec.stage,
                    model=c.model if c else rec.model,
                    sip_id=sip_id,
                    lesson_id=lesson_id,
                    user_id=user_id,
                    prompt_tokens=c.prompt_tokens if c else None,
                    completion_tokens=c.completion_tokens if c else None,
                    cost=c.cost if c else None,
                    latency_ms=rec.latency_ms,
                    ok=rec.ok,
                    error=rec.error[:4000] if rec.error else None,
                )
            )
            await s.commit()

    return StructuredLLM(client=client or OpenRouterClient(), recorder=record)
