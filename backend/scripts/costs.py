"""Read-only LLM cost report. Run from backend:

.venv/Scripts/python scripts/costs.py --db "$DATABASE_PUBLIC_URL"
.venv/Scripts/python scripts/costs.py --sqlite real.db real2.db real3.db real4.db
.venv/Scripts/python scripts/costs.py --db "$DATABASE_PUBLIC_URL" --since 2026-10-10T14:00

--since keeps only the LLM calls made from that UTC time, to cost one test run.

Only the explicitly supplied databases are opened; app.db is never imported.
"""

import argparse
import asyncio
from collections import Counter, defaultdict
from datetime import datetime, timezone
import math
from pathlib import Path
import sqlite3
import statistics
import sys

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings, get_settings  # noqa: E402


BUILD_STAGES = {"interpretation", "roadmap", "curriculum", "mapping"}
LESSON_STAGES = {"planning", "writing", "review", "revision", "revisions"}
FIELDS = {
    "llm_calls": (
        "id", "stage", "model", "sip_id", "lesson_id", "prompt_tokens",
        "completion_tokens", "cost", "ok", "created_at",
    ),
    "sips": ("id", "lite", "status"),
    "lessons": ("id", "sip_id", "status"),
}


def read_snapshot(connection):
    """Select only available columns: no ORM, schema creation, or migrations."""
    schema = inspect(connection)
    tables = set(schema.get_table_names())
    data, notes = {}, []
    for table, wanted in FIELDS.items():
        if table not in tables:
            data[table] = []
            notes.append(f"Missing table {table}; related metrics unavailable.")
            continue
        available = {c["name"] for c in schema.get_columns(table)}
        missing = set(wanted) - available
        if missing:
            notes.append(f"{table}: missing columns {', '.join(sorted(missing))}.")
        columns = [f'"{name}"' for name in wanted if name in available]
        if not columns:
            data[table] = []
            continue
        rows = connection.exec_driver_sql(
            f'SELECT {", ".join(columns)} FROM "{table}"'
        ).mappings()
        data[table] = [{name: row.get(name) for name in wanted} for row in rows]
    return data, notes


def sqlite_engine(filename):
    path = Path(filename).expanduser().resolve(strict=True)
    if not path.is_file():
        raise ValueError("SQLite source must be an existing file.")

    def connect():
        connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
        connection.execute("PRAGMA query_only = ON")
        return connection

    return create_engine("sqlite://", creator=connect)


def read_sqlite(filename):
    engine = sqlite_engine(filename)
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("BEGIN")
            return read_snapshot(connection)
    finally:
        engine.dispose()


async def read_postgres(url):
    # asyncpg supports read-only transactions with SERIALIZABLE isolation.
    query = dict(url.query)
    if "sslmode" in query:
        query["ssl"] = query.pop("sslmode")
        url = url.set(query=query)
    engine = create_async_engine(
        url, isolation_level="SERIALIZABLE",
        execution_options={"postgresql_readonly": True},
    )
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(read_snapshot)
    finally:
        await engine.dispose()


def read_url(raw):
    url = make_url(Settings._async_driver(raw))
    if url.get_backend_name() == "sqlite":
        if not url.database or url.database == ":memory:":
            raise ValueError("Supply an existing SQLite file, not an in-memory URL.")
        return read_sqlite(url.database), "Local SQLite file: " + url.database
    if url.drivername != "postgresql+asyncpg":
        raise ValueError("Supported URLs: sqlite[+driver], postgres, postgresql[+asyncpg].")
    return asyncio.run(read_postgres(url)), "PostgreSQL (explicit --db source)"


def merge_snapshots(snapshots):
    data = {table: [] for table in FIELDS}
    notes, seen = [], {table: {} for table in FIELDS}
    duplicate_calls = 0
    for source, (snapshot, warnings) in snapshots:
        notes.extend(f"{source}: {warning}" for warning in warnings)
        for table, rows in snapshot.items():
            for row in rows:
                identifier = row.get("id")
                if identifier is None:
                    data[table].append(row)
                    continue
                previous = seen[table].get(identifier)
                if previous is None:
                    data[table].append(row)
                    seen[table][identifier] = row
                elif table == "llm_calls":
                    if any(previous[key] is not None and value is not None and previous[key] != value for key, value in row.items()):
                        raise ValueError("Conflicting llm_calls IDs across sources; cannot merge safely.")
                    previous.update({key: value for key, value in row.items() if value is not None})
                    duplicate_calls += 1
                else:
                    # Entity snapshots: later file wins, retaining older known fields.
                    previous.update({key: value for key, value in row.items() if value is not None})
    notes.append(f"Merged by ID: {duplicate_calls} duplicate calls removed; entity IDs counted once.")
    return data, notes


def number(value):
    if value is None:
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def failed(call):
    return call.get("ok") in (False, 0, "0", "false", "False")


def average(values):
    values = [value for value in values if value is not None]
    return statistics.mean(values) if values else None


def money(value):
    return "no data" if value is None else f"${value:.6f}"


def timestamp(value):
    try:
        date = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return date.replace(tzinfo=timezone.utc) if date.tzinfo is None else date.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def print_cost_table(calls, field):
    groups = defaultdict(list)
    for call in calls:
        groups[call.get(field) or "(unknown)"].append(call)
    print(f"\nCOST BY {field.upper()} (USD)")
    print(f"{field:38} {'calls':>5} {'known':>5} {'total':>12} {'avg/call':>12} {'avg in':>10} {'avg out':>10} {'fail cost %':>11}")
    for key, rows in sorted(groups.items(), key=lambda item: sum(c["cost"] or 0 for c in item[1]), reverse=True):
        costs = [r["cost"] for r in rows if r["cost"] is not None]
        total = sum(costs)
        fail_cost = sum(r["cost"] or 0 for r in rows if failed(r))
        share = f"{100 * fail_cost / total:.1f}%" if total else "n/a"
        tokens = [average(r[field] for r in rows) for field in ("prompt_tokens", "completion_tokens")]
        token_text = [f"{value:.1f}" if value is not None else "n/a" for value in tokens]
        print(f"{key:38} {len(rows):5} {len(costs):5} {money(total if costs else None):>12} {money(average(costs)):>12} {token_text[0]:>10} {token_text[1]:>10} {share:>11}")


def unit_costs(calls, stages, field):
    groups = defaultdict(list)
    for call in calls:
        if call.get("stage") in stages and call.get(field) is not None:
            groups[call[field]].append(call)
    return {
        identifier: sum(call["cost"] for call in rows if call["cost"] is not None)
        for identifier, rows in groups.items() if any(call["cost"] is not None for call in rows)
    }


def print_distribution(label, costs, extrema=False):
    values = sorted(costs.values())
    print(f"\n{label} (n={len(values)})")
    if not values:
        print("  No data.")
        return
    line = (
        f"  Mean {money(statistics.mean(values))}; median {money(statistics.median(values))}; "
        f"p90 {money(values[math.ceil(0.9 * len(values)) - 1])}"
    )
    if extrema:
        line += f"; min {money(values[0])}; max {money(values[-1])}"
    print(line + ".")


def report(data, sources, notes, settings):
    calls = data["llm_calls"]
    for call in calls:
        for field in ("cost", "prompt_tokens", "completion_tokens"):
            call[field] = number(call.get(field))
    costs = [c["cost"] for c in calls if c["cost"] is not None]
    total = sum(costs)
    dates = [date for c in calls if (date := timestamp(c.get("created_at"))) is not None]
    print("SIPP LLM COST REPORT - USD - ROUGH PRICING EXPLORATION")
    print("Basis: local test runs; real logged OpenRouter costs." if all("SQLite" in s for s in sources) else "Basis: explicitly supplied database; logged OpenRouter costs.")
    print("Sources: " + ", ".join(sources))
    print("Read-only: SQLite mode=ro + query_only; PostgreSQL SERIALIZABLE READ ONLY.")
    print(f"\nTOTALS: {len(calls)} calls; {sum(failed(c) for c in calls)} failed; {money(total if costs else None)} known cost.")
    print(f"Cost coverage: {len(costs)}/{len(calls)} calls; unknown cost is never assumed free.")
    print(f"Unknown ok: {sum(c.get('ok') is None for c in calls)}; unknown timestamps: {len(calls) - len(dates)}.")
    print(f"Period (UTC): {min(dates).isoformat()} to {max(dates).isoformat()}." if dates else "Period: no data.")
    print("Averages use known values only; totals/unit costs are lower bounds when costs are missing.")
    print_cost_table(calls, "stage")
    print_cost_table(calls, "model")

    builds = unit_costs(calls, BUILD_STAGES, "sip_id")
    lessons = unit_costs(calls, LESSON_STAGES, "lesson_id")
    print_distribution("COST PER SIP BUILD: interpretation + roadmap + curriculum + mapping", builds, True)
    print_distribution("COST PER GENERATED LESSON: planning + writing + review + revisions", lessons)
    print("All logged attempts grouped by ID, including failures/retries; writing includes repeated revision calls.")
    print("p90 uses nearest rank. Units without IDs or any known cost cannot enter distributions.")
    unlinked = [c for c in calls if (c.get("stage") in BUILD_STAGES and c.get("sip_id") is None) or (c.get("stage") in LESSON_STAGES and c.get("lesson_id") is None)]
    print(f"Unlinked build/lesson calls: {len(unlinked)}; known cost {money(sum(c['cost'] or 0 for c in unlinked))}.")

    failures = [c for c in calls if failed(c)]
    escalation = [c for c in calls if c.get("model") == settings.model_escalation]
    overlap = [c for c in escalation if failed(c)]
    defaults = [c for c in escalation if getattr(settings, f"model_{c.get('stage')}", None) == settings.model_escalation]
    candidates = [c for c in escalation if c not in defaults]
    print(f"\nRETRIES / ESCALATION: configured model {settings.model_escalation}")
    for label, rows in (
        ("Failed calls (retry overhead proxy)", failures),
        ("All calls on escalation model", escalation),
        ("Of these, current default-stage uses", defaults),
        ("Of these, non-default-stage candidates", candidates),
        ("Overlap: failed AND escalation-model", overlap),
    ):
        print(f"  {label}: {len(rows)} calls; known cost {money(sum(c['cost'] or 0 for c in rows))}; {sum(c['cost'] is None for c in rows)} unknown costs.")
    union = [c for c in calls if failed(c) or c.get("model") == settings.model_escalation]
    print(f"  Failed OR escalation model (counted once): {money(sum(c['cost'] or 0 for c in union))}.")
    print("Model matches do not prove escalation: current mapping uses this model normally; historic defaults may differ.")
    print("Successful retry/revision overhead cannot be isolated exactly from this log; it remains included in unit costs.")

    sip_rows = {r["id"]: r for r in data["sips"] if r.get("id") is not None}
    lesson_rows = {r["id"]: r for r in data["lessons"] if r.get("id") is not None}
    mapped = Counter(r["sip_id"] for r in data["lessons"] if r.get("sip_id") is not None)
    lesson_sips = {r["id"]: r.get("sip_id") for r in data["lessons"] if r.get("id") is not None}
    lesson_sips.update({c["lesson_id"]: c["sip_id"] for c in calls if c.get("lesson_id") is not None and c.get("sip_id") is not None})

    def is_lite(sip_id):
        return sip_rows.get(sip_id, {}).get("lite") in (True, 1, "1", "true", "True")

    def completed(identifier, rows):
        status = rows.get(identifier, {}).get("status")
        return status is None or status == "ready"

    cohorts = {}
    print("\nFULL SIP PROJECTION (all mapped lessons eventually generated)")
    print("Completed units feed projections when status exists; unknown status retained for old schemas.")
    print("Missing lite flags treated as legacy standard data; lite requires an explicit true flag.")
    print(f"Sips with unknown lite flag: {sum(r.get('lite') is None for r in data['sips'])}.")
    for lite, label in ((False, "Standard"), (True, "Lite (free)")):
        sample_builds = {key: value for key, value in builds.items() if is_lite(key) == lite and completed(key, sip_rows)}
        sample_lessons = {key: value for key, value in lessons.items() if lesson_sips.get(key) is not None and is_lite(lesson_sips[key]) == lite and completed(key, lesson_rows)}
        mean_build = average(sample_builds.values())
        mean_lesson = average(sample_lessons.values())
        # Use all mapped lessons, including pending ones, for measured build Sips.
        sizes = [mapped[key] for key in sample_builds if key in mapped]
        size = average(sizes)
        full = mean_build + mean_lesson * size if all(value is not None for value in (mean_build, mean_lesson, size)) else None
        cohorts[lite] = (mean_build, mean_lesson)
        print(f"  {label}: {len(sample_builds)} builds, {len(sample_lessons)} generated lessons, {len(sizes)} mapped Sips.")
        print(f"    Build {money(mean_build)}; lesson {money(mean_lesson)}; avg lessons/Sip {size:.2f}; full Sip {money(full)}." if size is not None else f"    Build {money(mean_build)}; lesson {money(mean_lesson)}; avg lessons/Sip: no data; full Sip: no data.")

    observed = {c.get("stage") for c in calls}
    for stage in sorted((BUILD_STAGES | {"planning", "writing", "review"}) - observed):
        notes.append(f"No {stage} calls observed: its current pipeline cost is unmeasured, so projections may underestimate it.")

    print("\nMONTHLY PLAN PROJECTIONS / ROUGH PRICES (USD)")
    print("Monthly cost C = sips_per_month * cohort mean build + N * cohort mean lesson.")
    print("N=20 light, 60 regular, 120 heavy. Lessons generated lazily; slots are capacity, not a cost multiplier.")
    print("N can include existing-library lessons; scenarios are not capped to lessons in new Sips.")
    print("70% gross margin measured on customer price P: (P - store fee - LLM cost) / P = 70%.")
    print("Rough minimum price: no store C/0.30; 15% store C/(1-0.70-0.15) = C/0.15.")
    print("Includes LLM costs only, excluding hosting, taxes, support, payment fees and other expenses.")
    print(f"{'plan':10} {'slots':>6} {'Sips/mo':>7} {'lite':>5} {'N':>4} {'cost/mo':>12} {'P no store':>12} {'P 15% store':>12}")
    for plan, limits in settings.plans.items():
        lite = bool(limits.get("lite", False))
        build, lesson = cohorts[lite]
        for count in (20, 60, 120):
            cost = limits["sips_per_month"] * build + count * lesson if build is not None and lesson is not None else None
            print(f"{plan:10} {limits['slots']:6} {limits['sips_per_month']:7} {str(lite):>5} {count:4} {money(cost):>12} {money(cost / 0.30 if cost is not None else None):>12} {money(cost / 0.15 if cost is not None else None):>12}")
    if any(limits.get("lite") for limits in settings.plans.values()) and None in cohorts[True]:
        print("Lite/free projection: no sufficient lite data; no paid-cohort substitution.")
    print("max is the configured internal/team plan; figures assume all 1,000 monthly generations are used.")
    print("Historical model mix and small local samples; no repricing against today's model rates.")
    if notes:
        print("\nDATA / LIMITATIONS")
        for note in notes:
            print("  - " + note)


def _after(value, since):
    """Compare a logged timestamp (datetime or ISO string, naive means UTC) with the cutoff."""
    if value is None:
        return False
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    def utc(d):
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    return utc(value) >= utc(since)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--db", help="Explicit SQLAlchemy PostgreSQL or SQLite URL; no env fallback.")
    source.add_argument("--sqlite", nargs="+", metavar="FILE", help="Merge existing local SQLite files.")
    parser.add_argument("--since", type=datetime.fromisoformat, help="Only LLM calls from this UTC time (ISO 8601).")
    args = parser.parse_args()
    try:
        if args.sqlite:
            snapshots = [(f"Local SQLite file: {filename}", read_sqlite(filename)) for filename in args.sqlite]
        else:
            snapshot, label = read_url(args.db)
            snapshots = [(label, snapshot)]
        data, notes = merge_snapshots(snapshots)
        if args.since:
            data["llm_calls"] = [c for c in data["llm_calls"] if _after(c.get("created_at"), args.since)]
            notes.append(f"Only LLM calls since {args.since.isoformat()} UTC.")
        report(data, [source for source, _ in snapshots], notes, get_settings())
    except Exception as error:
        # Database exceptions can contain connection credentials: do not echo them.
        print(f"Cannot produce report ({type(error).__name__}). Check source, schema and access; no database writes performed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
