"""Emails, sent through Resend. Without RESEND_API_KEY they are only logged (dev, tests, before launch).

Account emails (welcome, password) always go; the "come back" nudge can be turned off, from a link in
each one or from the profile.
"""

import logging
from dataclasses import dataclass, field
from html import escape

import httpx
import jwt

from app.config import get_settings
from app.models import User

log = logging.getLogger("sipp.emails")

RESEND_URL = "https://api.resend.com/emails"


@dataclass
class Email:
    to: str
    subject: str
    html: str
    text: str
    headers: dict[str, str] = field(default_factory=dict)
    kind: str = ""


def enabled() -> bool:
    return bool(get_settings().resend_api_key)


async def _deliver(email: Email) -> bool:
    s = get_settings()
    if not s.resend_api_key:
        log.info("email %s to user not sent (RESEND_API_KEY empty): %s", email.kind, email.subject)
        return False
    payload = {
        "from": s.email_from,
        "to": [email.to],
        "subject": email.subject,
        "html": email.html,
        "text": email.text,
        "reply_to": s.support_email,
    }
    if email.headers:
        payload["headers"] = email.headers
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(RESEND_URL, json=payload, headers={"Authorization": f"Bearer {s.resend_api_key}"})
        if r.status_code >= 400:
            log.warning("email %s failed: HTTP %s %s", email.kind, r.status_code, r.text[:300])
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("email %s failed: %s", email.kind, type(e).__name__)
        return False


async def send(email: Email) -> bool:
    """Never raises: an email that fails must not break what triggered it."""
    try:
        return await _deliver(email)
    except Exception:  # noqa: BLE001
        log.exception("email %s failed", email.kind)
        return False


# --- Links ---

def app_url(path: str = "/") -> str:
    return get_settings().public_app_url.rstrip("/") + path


def unsubscribe_token(user: User) -> str:
    """Never expires: an old email's link must still work. Only turns the nudge off."""
    s = get_settings()
    return jwt.encode({"sub": user.id, "type": "unsubscribe"}, s.jwt_secret, algorithm=s.jwt_algorithm)


def read_unsubscribe_token(token: str) -> str | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    return payload.get("sub") if payload.get("type") == "unsubscribe" else None


# --- Layout ---

def _lang(user: User) -> str:
    return "en" if user.language == "en" else "fr"


FOOTER = {
    "fr": "Une question ? Réponds simplement à cet email.",
    "en": "Any question? Just reply to this email.",
}
UNSUBSCRIBE = {
    "fr": "Ne plus recevoir ces rappels par email",
    "en": "Stop these email reminders",
}


def _layout(lang: str, title: str, paragraphs: list[str], cta: tuple[str, str] | None, note: str | None = None,
            unsubscribe: str | None = None) -> str:
    """Paragraphs are already escaped HTML. Inline styles only: email clients ignore stylesheets."""
    body = "".join(f'<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3b332c">{p}</p>' for p in paragraphs)
    button = (
        f'<p style="margin:24px 0"><a href="{escape(cta[1])}" style="display:inline-block;background:#d9622b;'
        f'color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:999px">'
        f"{escape(cta[0])}</a></p>"
        if cta else ""
    )
    small = f'<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#7a6e63">{note}</p>' if note else ""
    unsub = (
        f'<br><a href="{escape(unsubscribe)}" style="color:#9a8d80">{UNSUBSCRIBE[lang]}</a>' if unsubscribe else ""
    )
    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fbf5ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf5ee"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px">
<tr><td style="padding:32px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<p style="margin:0 0 24px;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#d9622b">Sipp</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#1d1a17">{escape(title)}</h1>
{body}{button}{small}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9a8d80">
{FOOTER[lang]}{unsub}</p>
</td></tr></table></body></html>"""


def _text(title: str, paragraphs: list[str], cta: tuple[str, str] | None, note: str | None, lang: str,
          unsubscribe: str | None = None) -> str:
    """Plain-text twin; the paragraphs here are unescaped."""
    parts = [title, "", *[p + "\n" for p in paragraphs]]
    if cta:
        parts += [f"{cta[0]} : {cta[1]}" if lang == "fr" else f"{cta[0]}: {cta[1]}", ""]
    if note:
        parts += [note, ""]
    parts += ["—", FOOTER[lang]]
    if unsubscribe:
        parts += [f"{UNSUBSCRIBE[lang]} : {unsubscribe}" if lang == "fr" else f"{UNSUBSCRIBE[lang]}: {unsubscribe}"]
    return "\n".join(parts)


def _build(user: User, kind: str, subject: str, title: str, paragraphs: list[str], cta: tuple[str, str] | None,
           note: str | None = None, nudge: bool = False) -> Email:
    lang = _lang(user)
    unsub = app_url(f"/unsubscribe?token={unsubscribe_token(user)}") if nudge else None
    html = _layout(lang, title, [escape(p) for p in paragraphs], cta, escape(note) if note else None, unsub)
    headers = {"List-Unsubscribe": f"<{unsub}>"} if unsub else {}
    return Email(user.email, subject, html, _text(title, paragraphs, cta, note, lang, unsub), headers, kind)


# --- The emails ---

def welcome(user: User) -> Email:
    if _lang(user) == "en":
        return _build(
            user, "welcome", "Welcome to Sipp", "Welcome to Sipp!",
            [
                "Your account is ready. Tell Sipp what you want to learn, and it writes you a path of 5-minute lessons, at your level.",
                "Three tips to get going:",
                "1. Take your first lesson today: five minutes is enough.",
                "2. Turn on the daily reminder in Me › Settings, at the time that suits you.",
                "3. Add Sipp to your home screen: Share › Add to Home Screen on iPhone, or menu › Install app on Android.",
            ],
            ("Open Sipp", app_url("/")),
        )
    return _build(
        user, "welcome", "Bienvenue sur Sipp", "Bienvenue sur Sipp !",
        [
            "Ton compte est prêt. Dis à Sipp ce que tu veux apprendre : il t’écrit un parcours de leçons de 5 minutes, à ton niveau.",
            "Trois conseils pour bien démarrer :",
            "1. Fais ta première leçon aujourd’hui : cinq minutes suffisent.",
            "2. Active le rappel quotidien dans Moi › Réglages, à l’heure qui te va.",
            "3. Ajoute Sipp à ton écran d’accueil : Partager › Sur l’écran d’accueil sur iPhone, ou menu › Installer l’application sur Android.",
        ],
        ("Ouvrir Sipp", app_url("/")),
    )


def password_reset(user: User, token: str, minutes: int) -> Email:
    link = app_url(f"/reset-password?token={token}")
    if _lang(user) == "en":
        return _build(
            user, "password_reset", "Choose a new password", "Choose a new password",
            [
                "Someone, probably you, asked to change the password of your Sipp account.",
                f"This link works once, for {minutes} minutes.",
            ],
            ("Choose my new password", link),
            "If you did not ask for this, ignore this email: your password stays the same.",
        )
    return _build(
        user, "password_reset", "Choisis un nouveau mot de passe", "Choisis un nouveau mot de passe",
        [
            "Quelqu’un, sans doute toi, a demandé à changer le mot de passe de ton compte Sipp.",
            f"Ce lien marche une seule fois, pendant {minutes} minutes.",
        ],
        ("Choisir mon nouveau mot de passe", link),
        "Si tu n’as rien demandé, ignore cet email : ton mot de passe ne change pas.",
    )


def password_changed(user: User) -> Email:
    if _lang(user) == "en":
        return _build(
            user, "password_changed", "Your password was changed", "Your password was changed",
            [
                "The password of your Sipp account was just changed, and your other devices were signed out.",
                "If it was you, there is nothing to do.",
            ],
            ("It wasn’t me: reset it", app_url("/forgot-password")),
            "If it wasn’t you, reset your password right away and reply to this email so we can help.",
        )
    return _build(
        user, "password_changed", "Ton mot de passe a été changé", "Ton mot de passe a été changé",
        [
            "Le mot de passe de ton compte Sipp vient d’être changé, et tes autres appareils ont été déconnectés.",
            "Si c’était toi, il n’y a rien à faire.",
        ],
        ("Ce n’était pas moi", app_url("/forgot-password")),
        "Si ce n’était pas toi, choisis vite un nouveau mot de passe et réponds à cet email : on t’aidera.",
    )


def nudge(user: User, sip_title: str | None, lesson_title: str | None, lesson_id: str | None) -> Email:
    link = app_url(f"/lessons/{lesson_id}" if lesson_id else "/")
    en = _lang(user) == "en"
    if lesson_title and sip_title:
        paragraphs = (
            [f"Your next lesson of “{sip_title}” is waiting for you: {lesson_title}.", "Five minutes is enough to pick up where you left off."]
            if en else
            [f"Ta prochaine leçon de « {sip_title} » t’attend : {lesson_title}.", "Cinq minutes suffisent pour reprendre là où tu en étais."]
        )
        subject = f"Your next lesson: {lesson_title}" if en else f"Ta prochaine leçon : {lesson_title}"
    else:
        paragraphs = (
            ["What would you like to learn this week? Tell Sipp, and your first 5-minute lesson is ready in a moment."]
            if en else
            ["Qu’est-ce que tu aimerais apprendre cette semaine ? Dis-le à Sipp : ta première leçon de 5 minutes est prête dans un instant."]
        )
        subject = "Five minutes to learn something?" if en else "Cinq minutes pour apprendre quelque chose ?"
    return _build(
        user, "nudge", subject, "It’s been a few days!" if en else "Ça fait quelques jours !",
        paragraphs, ("Pick up my lesson" if en else "Reprendre ma leçon", link) if lesson_id else
        ("Choose a topic" if en else "Choisir un sujet", app_url("/new")),
        nudge=True,
    )
