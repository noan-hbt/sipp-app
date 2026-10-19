# Sipp backend

FastAPI + Postgres + a worker that runs the generation pipeline through OpenRouter.

```
POST /sips ──► job build_sip:      interpretation → curriculum → mapping, one module at a time
                └► as soon as M1 is mapped, job generate_lesson(L1, chain), while later modules are mapped:
                     planning → writing → checks + review + blind answer check → ≤1 revision
                     └► prefetch L2 (no cascade)
GET /lessons/{id}           queues generation if needed; poll until status == "ready"
POST /lessons/{id}/complete marks done, keeps the next lesson(s) warm
```

## Local

```sh
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
cp .env.example .env              # set OPENROUTER_API_KEY; DATABASE_URL defaults to sqlite
alembic upgrade head
uvicorn app.main:app --reload     # API, docs at /docs
python -m app.jobs.worker         # worker (separate terminal)
pytest                            # LLM is faked in tests
```

## Lesson quality and activation

- `pipeline/checks.py` checks structure in code; a `simulate` block that gives a `formula`
  has every value recomputed (`pipeline/calc.py`).
- `pipeline/solve.py`: a second call answers the lesson's graded items without the key;
  where it is sure and disagrees, the item is revised, then dropped if still disputed.
- After the revision, a lesson fails only on what is wrong (critical issues, major factual,
  contradiction, misleading example); style issues are worth a revision, not a retry.
- Paths and lessons store `meta` (prompt version, model per stage) and `ready_at` /
  `generated_at`. `LLM_MAX_TOKENS` caps each stage; `LLM_REASONING` sets reasoning effort.

```sh
python -m scripts.eval --name before-my-change   # 20 real requests (evals/requests.json), ~$2
python -m scripts.eval --name after-my-change --only cafeine,sql
python scripts/funnel.py --db "$DATABASE_PUBLIC_URL"   # sign-up → first lesson → coming back, read-only
python scripts/costs.py --db "$DATABASE_PUBLIC_URL"    # cost per stage, build and lesson, read-only
```

Run the eval before and after changing a prompt or a model, and compare the two
`evals/runs/<name>/report.md`: safety decisions, lessons ready, solver disagreements, time to
first lesson and cost.

## Railway

One repo, root directory `/backend` (watch `/backend/**`), two services built from the same Dockerfile:

| Service | Variables |
|---|---|
| `api` | `SERVICE_ROLE=api` (runs migrations, then uvicorn on `$PORT`) |
| `sipp-web` | root `/web`, `VITE_API_URL` (build arg), Caddy serves the PWA |
| `sipp-worker` | `SERVICE_ROLE=worker` (no domain, no healthcheck) |

API also: `CORS_ORIGINS` = comma-separated PWA origins.
Both: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `OPENROUTER_API_KEY`, `ENV=prod`,
and optional `MODEL_*` overrides (see `.env.example`). Add the Postgres plugin.
Health check path: `/health`.

## API

All routes except `/auth/register|login|refresh|logout` and `/health` need
`Authorization: Bearer <access_token>`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | `{email, password}` → `{access_token, refresh_token, expires_in}` |
| POST | `/auth/refresh` | `{refresh_token}` → new pair (rotation, old one revoked) |
| POST | `/auth/logout` | `{refresh_token}` |
| GET | `/auth/me` | |
| GET | `/auth/me/stats?tz=Europe/Paris` | streak days, stars, lessons completed |
| GET | `/auth/me/usage` | sips and LLM cost over the last 24h vs limits |
| DELETE | `/auth/me` | `{password}` → deletes the account and all its data |
| POST | `/sips` | `{input}` → 202, `status: queued → generating (stage) → ready / failed` |
| GET | `/sips` | list with progress and `next_lesson_id` |
| GET | `/sips/{id}` | roadmap: profile, modules, lessons with status |
| POST | `/sips/{id}/retry` | if failed |
| DELETE | `/sips/{id}` | |
| GET | `/lessons/{id}` | `blocks` present when `status == "ready"` |
| POST | `/lessons/{id}/complete?tz=…` | `{answers: [...], score: {correct, total}}` → stars (best kept) + streak |

Block shapes: `app/pipeline/blocks.py` (14 primitives incl. `code` and `math`, `type` discriminator).
Inline math: any text field may contain LaTeX between single dollars (`$d_k$`); `\$` is a literal dollar.

## Notes

- If a model rejects `json_schema` structured outputs, set `LLM_RESPONSE_FORMAT=json_object`
  (the schema is also in the system prompt; outputs are always validated with Pydantic,
  retried once with the error, then escalated to `MODEL_ESCALATION`).
- Every LLM call (tokens, cost, latency, errors) is logged in `llm_calls`.
- Per-user guards (rolling 24h): `MAX_SIPS_PER_DAY` (5), `MAX_COST_PER_DAY_USD` (1.0). Over limit →
  429 with `detail.code` in `daily_sip_limit | daily_budget_reached | too_many_active_builds`.
