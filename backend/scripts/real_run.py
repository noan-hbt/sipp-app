"""Real (paid) pipeline run on a local SQLite DB: roadmap + N lessons, no prefetch.

Usage: python -m scripts.real_run "Je veux apprendre ..." [--lessons 1] [--db real.db]
Prints the roadmap, the generated lessons and the OpenRouter cost.
"""

import argparse
import asyncio
import json
import os
import sys


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("input")
    p.add_argument("--lessons", type=int, default=1)
    p.add_argument("--keys", default="", help="comma-separated lesson keys, overrides --lessons")
    p.add_argument("--db", default="real.db")
    p.add_argument("--out", default=None, help="write full JSON dump here")
    return p.parse_args()


args = parse()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///./{args.db}"
os.environ.setdefault("ENV", "dev")

from sqlalchemy import func, select  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.jobs.worker import make_llm  # noqa: E402
from app.models import Lesson, LLMCall, Module, Sip, User  # noqa: E402
from app.pipeline import engine as pipeline  # noqa: E402


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        user = User(email=f"run-{os.urandom(4).hex()}@local", password_hash="x")
        s.add(user)
        await s.flush()
        sip = Sip(user_id=user.id, input_text=args.input)
        s.add(sip)
        await s.commit()
        sip_id = sip.id

    async with SessionLocal() as s:
        await pipeline.build_sip(s, make_llm(sip_id=sip_id), sip_id)

    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        modules = (await s.execute(select(Module).where(Module.sip_id == sip_id).order_by(Module.position))).scalars().all()
        lessons = (await s.execute(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).scalars().all()
        print(f"\n=== {sip.title} ===\n{sip.summary}\n")
        print("PROFILE:", json.dumps(sip.profile, ensure_ascii=False, indent=1))
        for m in modules:
            print(f"\nM{m.position}. {m.title} — {m.role}")
            for l in lessons:
                if l.module_id == m.id:
                    print(f"   {l.key} {l.title} | {', '.join(l.concepts)} | prereq {l.prerequisites}")
        keys = [k.strip().upper() for k in args.keys.split(",") if k.strip()]
        targets = [l.id for l in lessons if l.key in keys] if keys else [l.id for l in lessons[: args.lessons]]

    for lid in targets:
        async with SessionLocal() as s:
            await pipeline.generate_lesson(s, make_llm(sip_id=sip_id, lesson_id=lid), lid, chain=False)

    dump = {"sip_id": sip_id, "lessons": []}
    async with SessionLocal() as s:
        for lid in targets:
            l = await s.get(Lesson, lid)
            print(f"\n\n##### {l.key} {l.title} (revisions={l.revisions}) #####")
            for i, b in enumerate(l.blocks):
                print(f"\n[{i}] {json.dumps(b, ensure_ascii=False)}")
            print("\nREVIEW:", json.dumps(l.review, ensure_ascii=False, indent=1))
            dump["lessons"].append({"key": l.key, "plan": l.plan, "blocks": l.blocks, "review": l.review})

        rows = (await s.execute(
            select(LLMCall.stage, LLMCall.model, func.count(), func.sum(LLMCall.cost),
                   func.sum(LLMCall.prompt_tokens), func.sum(LLMCall.completion_tokens),
                   func.sum(LLMCall.latency_ms), func.sum(1 - LLMCall.ok))
            .where(LLMCall.sip_id == sip_id).group_by(LLMCall.stage, LLMCall.model)
        )).all()
        print("\nCOST:")
        total = 0.0
        for st, model, n, cost, pt, ct, ms, fails in rows:
            total += cost or 0
            print(f"  {st:15} {model:28} calls={n} fails={fails} in={pt} out={ct} {ms/1000:.0f}s ${cost or 0:.4f}")
        print(f"  TOTAL ${total:.4f}")
        errors = (await s.execute(select(LLMCall.stage, LLMCall.error).where(LLMCall.sip_id == sip_id, LLMCall.ok.is_(False)))).all()
        for st, err in errors:
            print(f"  ! {st}: {err[:300]}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(dump, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
