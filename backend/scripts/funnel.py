"""Read-only activation report: from sign-up to first lesson, coming back, and paying.

.venv/Scripts/python scripts/funnel.py --db "$DATABASE_PUBLIC_URL"
.venv/Scripts/python scripts/funnel.py --db "$DATABASE_PUBLIC_URL" --since 2026-10-20

--since keeps only the users who signed up from that UTC date (a cohort).
Opens the database read-only, through the same readers as costs.py.
"""

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.costs import read_sqlite, read_url  # noqa: E402

FIELDS = {
    "users": ("id", "created_at", "trial_started_at"),
    "sips": ("id", "user_id", "created_at", "ready_at", "status", "stage", "lite"),
    "lessons": ("id", "sip_id", "global_index", "status", "generated_at", "completed_at"),
    "billing_subscriptions": ("user_id", "status"),
}
PAYING = {"active", "past_due"}


def when(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def duration(seconds: list[float]) -> str:
    if not seconds:
        return "no data"
    seconds = sorted(seconds)

    def show(s: float) -> str:
        return f"{s:.0f}s" if s < 120 else f"{s / 60:.1f}min" if s < 7200 else f"{s / 3600:.1f}h"

    p90 = seconds[min(len(seconds) - 1, round(0.9 * (len(seconds) - 1)))]
    return f"median {show(statistics.median(seconds))}, p90 {show(p90)} (n={len(seconds)})"


def report(data: dict, since: datetime | None) -> None:
    users = {u["id"]: u for u in data["users"] if since is None or (when(u["created_at"]) or since) >= since}
    sips_by_user: dict[str, list[dict]] = {}
    for s in data["sips"]:
        if s["user_id"] in users:
            sips_by_user.setdefault(s["user_id"], []).append(s)
    sip_owner = {s["id"]: s["user_id"] for ss in sips_by_user.values() for s in ss}
    lessons_by_user: dict[str, list[dict]] = {}
    lessons_by_sip: dict[str, list[dict]] = {}
    for l in data["lessons"]:
        if l["sip_id"] in sip_owner:
            lessons_by_user.setdefault(sip_owner[l["sip_id"]], []).append(l)
            lessons_by_sip.setdefault(l["sip_id"], []).append(l)
    paying = {b["user_id"] for b in data["billing_subscriptions"] if b["status"] in PAYING}

    def has(pred) -> int:
        return sum(1 for uid in users if pred(uid))

    def completed_days(uid: str) -> set:
        return {when(l["completed_at"]).date() for l in lessons_by_user.get(uid, []) if l["completed_at"]}

    def active_after(uid: str, days: int) -> bool:
        start = when(users[uid]["created_at"])
        return start is not None and any(
            when(l["completed_at"]) >= start + timedelta(days=days)
            for l in lessons_by_user.get(uid, []) if l["completed_at"]
        )

    steps = [
        ("Signed up", has(lambda u: True)),
        ("Asked for a path", has(lambda u: bool(sips_by_user.get(u)))),
        ("Got a path", has(lambda u: any(s["status"] == "ready" for s in sips_by_user.get(u, [])))),
        ("Got a lesson", has(lambda u: any(l["status"] == "ready" for l in lessons_by_user.get(u, [])))),
        ("Finished a lesson", has(lambda u: bool(completed_days(u)))),
        ("Learned on 2+ days", has(lambda u: len(completed_days(u)) >= 2)),
        ("Learned 7+ days after sign-up", has(lambda u: active_after(u, 7))),
        ("Started the trial", has(lambda u: users[u]["trial_started_at"] is not None)),
        ("Paying now", has(lambda u: u in paying)),
    ]
    print("SIPP ACTIVATION FUNNEL")
    print(f"Cohort: users signed up {'since ' + since.date().isoformat() if since else 'at any time'}.\n")
    top = steps[0][1] or 1
    prev = top
    for name, n in steps:
        print(f"  {name:32} {n:6}  {100 * n / top:5.1f}% of sign-ups  {100 * n / (prev or 1):5.1f}% of previous step")
        prev = n

    sips = [s for ss in sips_by_user.values() for s in ss]
    to_path, to_lesson, signup_to_sip = [], [], []
    for s in sips:
        created, ready = when(s["created_at"]), when(s["ready_at"])
        if created and ready:
            to_path.append((ready - created).total_seconds())
        first = next((l for l in lessons_by_sip.get(s["id"], []) if l["global_index"] == 0), None)
        if created and first and first["generated_at"]:
            to_lesson.append((when(first["generated_at"]) - created).total_seconds())
    for uid, ss in sips_by_user.items():
        first = min((when(s["created_at"]) for s in ss if s["created_at"]), default=None)
        start = when(users[uid]["created_at"])
        if first and start:
            signup_to_sip.append((first - start).total_seconds())

    print("\nWAITING")
    print(f"  Sign-up to first request:        {duration(signup_to_sip)}")
    print(f"  Request to path ready:           {duration(to_path)}")
    print(f"  Request to first lesson ready:   {duration(to_lesson)}")
    print("  (path and lesson times only exist for paths built after migration 0013)")

    failed = [s for s in sips if s["status"] == "failed"]
    refused = [s for s in failed if s["stage"] == "refused"]
    lessons = [l for ls in lessons_by_sip.values() for l in ls if l["status"] in ("ready", "failed")]
    print("\nFAILURES")
    print(f"  Paths failed: {len(failed) - len(refused)}/{len(sips)}; topics refused: {len(refused)}/{len(sips)}")
    print(f"  Lessons failed: {sum(1 for l in lessons if l['status'] == 'failed')}/{len(lessons)} generated")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--db", help="Explicit SQLAlchemy PostgreSQL or SQLite URL; no env fallback.")
    source.add_argument("--sqlite", metavar="FILE", help="An existing local SQLite file.")
    parser.add_argument("--since", type=datetime.fromisoformat, help="Only users who signed up from this UTC date.")
    args = parser.parse_args()
    since = when(args.since) if args.since else None
    try:
        if args.sqlite:
            data, notes = read_sqlite(args.sqlite, FIELDS)
        else:
            (data, notes), _ = read_url(args.db, FIELDS)
        report(data, since)
        for note in notes:
            print(f"Note: {note}")
    except Exception as error:
        # Database exceptions can contain connection credentials: do not echo them.
        print(f"Cannot produce report ({type(error).__name__}). Check source, schema and access; no database writes performed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
