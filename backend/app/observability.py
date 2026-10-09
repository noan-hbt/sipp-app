"""Sentry error tracking for the API and the worker. A no-op until SENTRY_DSN is set."""

import sentry_sdk

from app.config import get_settings


def init_sentry(service: str) -> None:
    s = get_settings()
    if not s.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=s.sentry_dsn,
        environment=s.env,
        server_name=service,
        traces_sample_rate=s.sentry_traces_sample_rate,
        send_default_pii=False,  # no emails, IPs or request bodies (lesson answers)
    )
    sentry_sdk.set_tag("service", service)
