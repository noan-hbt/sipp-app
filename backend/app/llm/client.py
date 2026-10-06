import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import get_settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    pass


@dataclass
class Completion:
    text: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    cost: float | None = None


class ChatClient(Protocol):
    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        schema_name: str,
        schema: dict[str, Any],
    ) -> Completion: ...


class OpenRouterClient:
    def __init__(self, http: httpx.AsyncClient | None = None):
        s = get_settings()
        self._s = s
        self._http = http or httpx.AsyncClient(
            base_url=s.openrouter_base_url,
            timeout=s.llm_timeout_seconds,
            headers={
                "Authorization": f"Bearer {s.openrouter_api_key}",
                "HTTP-Referer": s.openrouter_app_url,
                "X-Title": s.openrouter_app_name,
            },
        )

    async def complete(self, model, messages, schema_name, schema) -> Completion:
        if self._s.llm_response_format == "json_schema":
            response_format = {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": False, "schema": schema},
            }
        else:
            response_format = {"type": "json_object"}
        body = {
            "model": model,
            "messages": messages,
            "response_format": response_format,
            "usage": {"include": True},
        }
        for attempt in range(3):
            try:
                r = await self._http.post("/chat/completions", json=body)
            except httpx.TransportError as e:
                if attempt == 2:
                    raise LLMError(f"transport error: {e}") from e
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                await asyncio.sleep(2 ** attempt * 2)
                continue
            if r.status_code >= 400:
                raise LLMError(f"OpenRouter {r.status_code}: {r.text[:500]}")
            data = r.json()
            if "error" in data:
                raise LLMError(f"OpenRouter error: {data['error']}")
            try:
                text = data["choices"][0]["message"]["content"] or ""
            except (KeyError, IndexError) as e:
                raise LLMError(f"unexpected response: {str(data)[:500]}") from e
            usage = data.get("usage") or {}
            return Completion(
                text=text,
                model=data.get("model", model),
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                cost=usage.get("cost"),
            )
        raise LLMError("unreachable")


def extract_json(text: str) -> Any:
    """Parse JSON, tolerating markdown fences or prose around the object."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


@dataclass
class CallRecord:
    stage: str
    model: str
    latency_ms: int
    ok: bool
    completion: Completion | None = None
    error: str | None = None


Recorder = Callable[[CallRecord], Awaitable[None]]


@dataclass
class StructuredLLM:
    """Stage-aware structured generation with validation retries and escalation."""

    client: ChatClient
    recorder: Recorder | None = None
    settings: Any = field(default_factory=get_settings)

    async def generate(
        self,
        stage: str,
        system: str,
        user: str,
        out: type[T],
        escalate: bool = True,
    ) -> T:
        models = [self.settings.model_for(stage)]
        if escalate and self.settings.model_escalation not in models:
            models.append(self.settings.model_escalation)

        schema = out.model_json_schema()
        system_full = (
            f"{system}\n\nRespond with a single JSON object only, matching this JSON schema:\n"
            f"{json.dumps(schema, ensure_ascii=False)}"
        )
        last_error: Exception | None = None
        for model in models:
            messages = [
                {"role": "system", "content": system_full},
                {"role": "user", "content": user},
            ]
            for _ in range(self.settings.llm_validation_retries + 1):
                t0 = time.monotonic()
                try:
                    completion = await self.client.complete(model, messages, out.__name__, schema)
                except LLMError as e:
                    await self._record(stage, model, t0, None, str(e))
                    last_error = e
                    break  # provider error: move to escalation model
                try:
                    result = out.model_validate(extract_json(completion.text))
                except (ValidationError, json.JSONDecodeError, ValueError) as e:
                    await self._record(stage, model, t0, completion, f"invalid output: {e}")
                    last_error = e
                    messages = messages + [
                        {"role": "assistant", "content": completion.text},
                        {
                            "role": "user",
                            "content": "Your JSON is invalid:\n"
                            f"{str(e)[:3000]}\n"
                            "Return the full corrected JSON object only.",
                        },
                    ]
                    continue
                await self._record(stage, model, t0, completion, None)
                return result
            log.warning("stage %s failed on %s, escalating", stage, model)
        raise LLMError(f"stage '{stage}' failed: {last_error}")

    async def _record(self, stage, model, t0, completion, error) -> None:
        if not self.recorder:
            return
        rec = CallRecord(
            stage=stage,
            model=model,
            latency_ms=int((time.monotonic() - t0) * 1000),
            ok=error is None,
            completion=completion,
            error=error,
        )
        try:
            await self.recorder(rec)
        except Exception:  # never fail generation because of logging
            log.exception("failed to record LLM call")
