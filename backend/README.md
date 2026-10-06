# Sipp backend

FastAPI + Postgres + a worker that runs the generation pipeline through OpenRouter.

```
POST /sips ──► job build_sip:      interpretation → curriculum → mapping   (roadmap)
                └► job generate_lesson(L1, chain) : planning → writing → checks + review → ≤1 revision
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

## Railway

One repo, root directory `backend`, two services built from the same Dockerfile:

| Service | Variables |
|---|---|
| `api` | `SERVICE_ROLE=api` (runs migrations, then uvicorn on `$PORT`) |
| `worker` | `SERVICE_ROLE=worker` |

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
| POST | `/sips` | `{input}` → 202, `status: queued → generating (stage) → ready / failed` |
| GET | `/sips` | list with progress and `next_lesson_id` |
| GET | `/sips/{id}` | roadmap: profile, modules, lessons with status |
| POST | `/sips/{id}/retry` | if failed |
| DELETE | `/sips/{id}` | |
| GET | `/lessons/{id}` | `blocks` present when `status == "ready"` |
| POST | `/lessons/{id}/complete` | `{answers: [...]}` (free-form, stored) |

Block shapes: `app/pipeline/blocks.py` (14 primitives incl. `code` and `math`, `type` discriminator).
Inline math: any text field may contain LaTeX between single dollars (`$d_k$`); `\$` is a literal dollar.

## Notes

- If a model rejects `json_schema` structured outputs, set `LLM_RESPONSE_FORMAT=json_object`
  (the schema is also in the system prompt; outputs are always validated with Pydantic,
  retried once with the error, then escalated to `MODEL_ESCALATION`).
- Every LLM call (tokens, cost, latency, errors) is logged in `llm_calls`.
