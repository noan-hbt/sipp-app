"""Transactional email through Resend. Without a key (dev, tests) nothing is sent; dev logs the message."""

import logging

import httpx

from app.config import get_settings

log = logging.getLogger("sipp.mail")

RESET = {
    "fr": (
        "Ton code Sipp : {code}",
        "Bonjour,\n\nVoici ton code pour choisir un nouveau mot de passe : {code}\n\n"
        "Il est valable 30 minutes. Si tu n’as rien demandé, ignore ce message : ton mot de passe ne change pas.\n\nSipp",
    ),
    "en": (
        "Your Sipp code: {code}",
        "Hello,\n\nHere is your code to choose a new password: {code}\n\n"
        "It is valid for 30 minutes. If you did not ask for it, ignore this message: your password stays the same.\n\nSipp",
    ),
}


class MailError(Exception):
    pass


async def send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if not s.resend_api_key:
        if s.env == "dev":
            log.warning("email disabled, would send to %s: %s\n%s", to, subject, text)
        else:
            log.error("email disabled (RESEND_API_KEY unset): nothing sent to a user")
        return
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {s.resend_api_key}"},
                json={"from": s.email_from, "to": [to], "subject": subject, "text": text},
            )
    except httpx.HTTPError as e:
        raise MailError(type(e).__name__) from e
    if r.status_code >= 400:
        raise MailError(f"HTTP {r.status_code} {r.text[:200]}")


async def send_reset_code(to: str, code: str, language: str | None) -> None:
    subject, text = RESET.get(language or "fr", RESET["fr"])
    await send(to, subject.format(code=code), text.format(code=code))
