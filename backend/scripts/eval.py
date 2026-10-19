"""Eval set: run real (paid) requests through the pipeline and report quality, speed and cost.

Each request runs like production: the path is queued and worker slots build it and write
its lessons, so the time to first lesson is the one a learner waits on the Generating screen.

Usage (from backend/, needs OPENROUTER_API_KEY):
  python -m scripts.eval --name baseline                 # all of evals/requests.json, first lesson each
  python -m scripts.eval --name try --only cafeine,sql --lessons 2
  MODEL_WRITING=some/model python -m scripts.eval --name other-writer

Each request runs in its own process on its own SQLite file (evals/runs/<name>/<id>.db),
so a run never touches a real database. Results: evals/runs/<name>/report.md and results.json.
Run it before and after changing a prompt or a model, and compare the two reports.
"""

import argparse
import asyncio
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUESTS = ROOT / "evals" / "requests.json"
RUNS = ROOT / "evals" / "runs"


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--name", default=time.strftime("%Y%m%d-%H%M%S"))
    p.add_argument("--only", default="", help="comma-separated request ids")
    p.add_argument("--lessons", type=int, default=1, help="lessons generated per request")
    p.add_argument("--lite", action="store_true", help="free-plan generation (short course, one small model)")
    p.add_argument("--concurrency", type=int, default=5)
    p.add_argument("--timeout", type=int, default=900, help="seconds to wait for a path and its first lesson")
    p.add_argument("--one", default="", help=argparse.SUPPRESS)  # child process: run this request id
    return p.parse_args()


# --- Child: one request ------------------------------------------------------------


async def run_one(args: argparse.Namespace, req: dict, out_dir: Path) -> dict:
    """Like production: the sip is queued, worker slots pick up the build and the lessons."""
    from sqlalchemy import select

    from app.config import get_settings
    from app.db import Base, SessionLocal, engine
    from app.jobs import worker
    from app.jobs.queue import enqueue
    from app.llm.client import OpenRouterClient
    from app.llm.record import make_llm
    from app.models import Lesson, LLMCall, Module, Sip, User
    from app.pipeline import engine as pipeline

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        user = User(email=f"eval-{req['id']}@local", password_hash="x", language=req["lang"])
        s.add(user)
        await s.flush()
        sip = Sip(user_id=user.id, input_text=req["input"], lite=args.lite)
        s.add(sip)
        await s.flush()
        await enqueue(s, pipeline.JOB_BUILD_SIP, {"sip_id": sip.id})
        await s.commit()
        sip_id = sip.id

    result: dict = {"id": req["id"], "lang": req["lang"], "input": req["input"], "expect": req["expect"]}
    client = OpenRouterClient()
    stop = asyncio.Event()

    async def slot() -> None:
        while not stop.is_set():
            if not await worker.process_one(client):
                await asyncio.sleep(0.5)

    slots = [asyncio.create_task(slot()) for _ in range(get_settings().worker_concurrency)]
    t0 = time.monotonic()
    try:
        while time.monotonic() - t0 < args.timeout:
            await asyncio.sleep(1)
            async with SessionLocal() as s:
                sip = await s.get(Sip, sip_id)
                first = await s.scalar(select(Lesson).where(Lesson.sip_id == sip_id, Lesson.global_index == 0))
                if sip.status == "ready" and "build_s" not in result:
                    result["build_s"] = round(time.monotonic() - t0, 1)
                if first is not None and first.status in ("ready", "failed") and "ttfl_s" not in result:
                    result["ttfl_s"] = round(time.monotonic() - t0, 1)
                if sip.status == "failed" or (sip.status == "ready" and "ttfl_s" in result):
                    break
        else:
            result["build_error"] = f"timeout after {args.timeout}s"
    finally:
        stop.set()
        for task in slots:
            task.cancel()
        await asyncio.gather(*slots, return_exceptions=True)
    result.setdefault("build_s", round(time.monotonic() - t0, 1))

    async with SessionLocal() as s:
        sip = await s.get(Sip, sip_id)
        result.update(status=sip.status, stage=sip.stage, error=sip.error, title=sip.title, profile=sip.profile)
        modules = (await s.execute(select(Module).where(Module.sip_id == sip_id).order_by(Module.position))).scalars().all()
        lessons = (await s.execute(select(Lesson).where(Lesson.sip_id == sip_id).order_by(Lesson.global_index))).scalars().all()
        result["path"] = [
            {"title": m.title, "lessons": [l.title for l in lessons if l.module_id == m.id]} for m in modules
        ]
        targets = [(l.id, l.status) for l in lessons[: args.lessons]]

    result["lessons"] = []
    for i, (lid, status) in enumerate(targets):
        error = None
        if status not in ("ready", "failed"):  # later lessons the worker did not prefetch
            try:
                async with SessionLocal() as s:
                    lesson = await s.get(Lesson, lid)
                    lesson.status = "pending"
                    await s.commit()
                    await pipeline.generate_lesson(s, make_llm(client, sip_id=sip_id, lesson_id=lid), lid, chain=False)
            except Exception as e:  # noqa: BLE001 - an eval reports failures, it does not stop on them
                error = f"{type(e).__name__}: {e}"[:500]
        async with SessionLocal() as s:
            l = await s.get(Lesson, lid)
            result["lessons"].append({
                "key": l.key, "title": l.title, "status": l.status, "error": error or l.error,
                "revisions": l.revisions, "blocks": l.blocks, "review": l.review, "meta": l.meta,
            })

    async with SessionLocal() as s:
        calls = (await s.execute(select(LLMCall).where(LLMCall.sip_id == sip_id))).scalars().all()
        result["calls"] = [
            {"stage": c.stage, "model": c.model, "ok": c.ok, "cost": c.cost, "in": c.prompt_tokens,
             "out": c.completion_tokens, "ms": c.latency_ms, "lesson": c.lesson_id is not None,
             "lesson_id": c.lesson_id, "error": (c.error or "")[:300] or None}
            for c in calls
            if c.error != "CancelledError"  # prefetches cut short when the eval stops its worker
        ]
        kept = {lid for lid, _ in targets}
        result["calls"] = [c for c in result["calls"] if not c["lesson"] or c["lesson_id"] in kept]
    (out_dir / f"{req['id']}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1, default=str))
    return result


# --- Parent: fan out, then report ---------------------------------------------------------


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(q * (len(values) - 1))))]


HEDGES = re.compile(
    r"\b(généralement|en général|souvent|parfois|peut|peuvent|pourrait|forcément|plutôt|certain(?:e)?s?|"
    r"temporairement|notamment|progressivement|éventuellement|possiblement|susceptibles?|"
    r"generally|usually|often|sometimes|may|might|can|could|typically|some|certain|temporarily|"
    r"notably|potentially|possibly|tends? to)\b",
    re.IGNORECASE,
)


def ttfl_of(r: dict) -> float | None:
    """Request to first lesson ready (older runs timed the build and the lesson one after the other)."""
    if r.get("ttfl_s") is not None:
        return r["ttfl_s"]
    if r.get("first_lesson_s") is not None:
        return r["build_s"] + r["first_lesson_s"]
    return None


def lesson_text(lesson: dict) -> str:
    words: list[str] = []

    def walk(v) -> None:
        if isinstance(v, str):
            words.append(v)
        elif isinstance(v, dict):
            for k, x in v.items():
                if k not in ("type", "id", "kind", "language", "code", "latex"):
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(lesson.get("blocks") or [])
    return " ".join(words)


NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def numbers(lesson: dict) -> int:
    """Concrete figures quoted in the lesson (hours, percentages, doses...)."""
    return len(NUMBER.findall(lesson_text(lesson)))


def hedging(lesson: dict) -> float:
    text = lesson_text(lesson)
    total = len(text.split())
    return 100 * len(HEDGES.findall(text)) / total if total else 0.0


def fmt_s(v: float | None) -> str:
    return "-" if v is None else f"{v:.0f}s"


def summarize(results: list[dict], args: argparse.Namespace) -> str:
    lines = [f"# Eval `{args.name}`", ""]
    models = {f"{c['stage']}": c["model"] for r in results for c in r.get("calls", []) if c["ok"]}
    lines.append("Models: " + ", ".join(f"{k}={v}" for k, v in sorted(models.items())))
    lines.append(f"Lite: {args.lite}. Lessons per request: {args.lessons}.")
    lines.append("")

    safety_ok = sum(1 for r in results if ((r.get("profile") or {}).get("safety") == "refuse") == (r["expect"] == "refuse"))
    built = [r for r in results if r["expect"] != "refuse"]
    ready = [r for r in built if r.get("status") == "ready"]
    all_lessons = [l for r in results for l in r.get("lessons", [])]
    good = [l for l in all_lessons if l["status"] == "ready"]
    ttfl = [ttfl_of(r) for r in ready if ttfl_of(r) is not None and r["lessons"] and r["lessons"][0]["status"] == "ready"]
    hedges = [hedging(l) for l in good]
    figures = [numbers(l) for l in good]
    build_cost = [sum(c["cost"] or 0 for c in r.get("calls", []) if not c["lesson"]) for r in ready]
    lesson_calls = [c for r in results for c in r.get("calls", []) if c["lesson"]]
    lesson_cost = sum(c["cost"] or 0 for c in lesson_calls) / len(all_lessons) if all_lessons else 0
    disagreements = [d for l in all_lessons for d in ((l.get("review") or {}).get("solve") or {}).get("disagreements", [])]
    removed = [d for l in all_lessons for d in ((l.get("review") or {}).get("solve") or {}).get("removed", [])]

    lines += [
        "## Summary", "",
        f"- Safety decisions matching expectation: {safety_ok}/{len(results)}",
        f"- Paths built: {len(ready)}/{len(built)}",
        f"- Lessons ready: {len(good)}/{len(all_lessons)}; revisions: {sum(l['revisions'] or 0 for l in all_lessons)}",
        f"- Answer-key disagreements found by the solver: {len(disagreements)}; questions removed: {len(removed)}",
        f"- Time to first lesson (request to lesson ready): median {fmt_s(pct(ttfl, 0.5))}, p90 {fmt_s(pct(ttfl, 0.9))}",
        f"- Hedging words per 100 words of lesson (may, some, temporarily...): {statistics.mean(hedges) if hedges else 0:.1f}",
        f"- Figures quoted per lesson: {statistics.mean(figures) if figures else 0:.1f}",
        f"- Cost: build mean ${statistics.mean(build_cost) if build_cost else 0:.4f}, lesson mean ${lesson_cost:.4f}",
        "",
        "## Time by stage", "",
        "| stage | calls | failed | median | p90 | mean cost |",
        "|---|---|---|---|---|---|",
    ]
    stages: dict[str, list[dict]] = {}
    for r in results:
        for c in r.get("calls", []):
            stages.setdefault(c["stage"], []).append(c)
    for st, cs in sorted(stages.items(), key=lambda kv: -sum(c["ms"] or 0 for c in kv[1])):
        ms = [c["ms"] / 1000 for c in cs if c["ms"]]
        cost = [c["cost"] for c in cs if c["cost"] is not None]
        lines.append(
            f"| {st} | {len(cs)} | {sum(1 for c in cs if not c['ok'])} | {fmt_s(pct(ms, 0.5))} | {fmt_s(pct(ms, 0.9))} "
            f"| ${statistics.mean(cost) if cost else 0:.4f} |"
        )
    lines += [
        "", "## Requests", "",
        "| id | safety | status | lessons in path | path ready | 1st lesson ready | revisions | review | solver | cost |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        p = r.get("profile") or {}
        l0 = r["lessons"][0] if r.get("lessons") else None
        rounds = (l0 or {}).get("review", {}) or {}
        verdicts = "→".join(x["review"]["verdict"] for x in rounds.get("rounds", []))
        solve = rounds.get("solve") or {}
        cost = sum(c["cost"] or 0 for c in r.get("calls", []))
        status = r.get("status") if not r.get("build_error") else "error"
        if l0:
            status += f" / {l0['status']}"
        lines.append(
            f"| {r['id']} | {p.get('safety', '?')} (want {r['expect']}) | {status} "
            f"| {sum(len(m['lessons']) for m in r.get('path', []))} | {fmt_s(r.get('build_s'))} "
            f"| {fmt_s(ttfl_of(r))} | {(l0 or {}).get('revisions', '-')} | {verdicts or '-'} "
            f"| {len(solve.get('disagreements', [])) if solve else '-'} | ${cost:.3f} |"
        )
    problems = [(r["id"], r.get("build_error") or r.get("error")) for r in results if r.get("build_error") or (r.get("error") and r["expect"] != "refuse")]
    problems += [(r["id"], f"{l['key']}: {l['error']}") for r in results for l in r.get("lessons", []) if l.get("error")]
    problems += [(r["id"], f"{c['stage']} {c['model']}: {c['error']}") for r in results for c in r.get("calls", []) if not c["ok"]]
    if problems:
        lines += ["", "## Errors", ""] + [f"- **{i}**: {e}" for i, e in problems]
    if disagreements:
        lines += ["", "## Solver disagreements", ""]
        for r in results:
            for l in r.get("lessons", []):
                for d in ((l.get("review") or {}).get("solve") or {}).get("disagreements", []):
                    lines.append(f"- **{r['id']} {l['key']}** block {d.get('block')}: {d.get('detail')}")
    return "\n".join(lines) + "\n"


async def fan_out(args: argparse.Namespace, reqs: list[dict], out_dir: Path) -> list[dict]:
    sem = asyncio.Semaphore(args.concurrency)

    async def one(req: dict) -> dict:
        async with sem:
            db = out_dir / f"{req['id']}.db"
            db.unlink(missing_ok=True)
            env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db}", "ENV": "dev"}
            cmd = [sys.executable, "-m", "scripts.eval", "--one", req["id"], "--name", args.name, "--lessons", str(args.lessons)]
            if args.lite:
                cmd.append("--lite")
            proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=ROOT, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
            )
            out, _ = await proc.communicate()
            path = out_dir / f"{req['id']}.json"
            if proc.returncode or not path.exists():
                print(f"  {req['id']}: crashed\n{out.decode()[-2000:]}")
                return {**req, "build_error": "crashed: " + out.decode()[-500:], "lessons": [], "calls": []}
            r = json.loads(path.read_text())
            print(f"  {req['id']}: {r.get('status')}, path in {r.get('build_s')}s, first lesson in {r.get('ttfl_s', '-')}s")
            return r

    return await asyncio.gather(*(one(r) for r in reqs))


def main() -> None:
    args = parse()
    reqs = json.loads(REQUESTS.read_text())
    out_dir = RUNS / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.one:
        req = next(r for r in reqs if r["id"] == args.one)
        asyncio.run(run_one(args, req, out_dir))
        return
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    if only:
        reqs = [r for r in reqs if r["id"] in only]
    print(f"Running {len(reqs)} requests into {out_dir}")
    results = asyncio.run(fan_out(args, reqs, out_dir))
    (out_dir / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1, default=str))
    report = summarize(results, args)
    (out_dir / "report.md").write_text(report)
    print(report)


if __name__ == "__main__":
    main()
