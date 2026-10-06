import pytest

from app.llm.client import LLMError, StructuredLLM, extract_json
from app.pipeline.schemas import LearningProfile
from tests.fakes import PROFILE, FakeClient


def test_extract_json_tolerates_fences():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Voici: {"a": 1} merci') == {"a": 1}


async def test_validation_retry_then_success():
    client = FakeClient({"LearningProfile": ["not json", PROFILE]})
    records = []

    async def rec(r):
        records.append(r)

    out = await StructuredLLM(client, rec).generate("interpretation", "sys", "u", LearningProfile)
    assert out.language == "fr"
    assert [r.ok for r in records] == [False, True]


async def test_escalation_after_failures():
    bad = {"topic": "x"}
    client = FakeClient({"LearningProfile": [bad, bad, PROFILE]})
    llm = StructuredLLM(client)
    await llm.generate("interpretation", "sys", "u", LearningProfile)
    models = [m for _, m in client.calls]
    assert models[0] == models[1] == llm.settings.model_interpretation
    assert models[2] == llm.settings.model_escalation


async def test_gives_up():
    client = FakeClient({"LearningProfile": [LLMError("down"), LLMError("down")]})
    with pytest.raises(LLMError):
        await StructuredLLM(client).generate("interpretation", "s", "u", LearningProfile)
