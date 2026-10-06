#!/bin/sh
set -e
if [ "$SERVICE_ROLE" = "worker" ]; then
  exec python -m app.jobs.worker
fi
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
