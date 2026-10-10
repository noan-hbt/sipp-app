"""Visual themes of a Sip: each one has an illustration, a pastel tone and a map landscape in the web app."""

from typing import Annotated, Literal

from pydantic import BeforeValidator

THEMES = (
    "ai",
    "art",
    "biology",
    "books",
    "business",
    "career",
    "cars",
    "chemistry",
    "cinema",
    "communication",
    "cooking",
    "design",
    "diy",
    "drinks",
    "ecology",
    "economy",
    "fashion",
    "finance",
    "fitness",
    "games",
    "gardening",
    "general",
    "health",
    "history",
    "language",
    "law",
    "leadership",
    "marketing",
    "math",
    "meditation",
    "music",
    "mythology",
    "parenting",
    "pets",
    "philosophy",
    "photography",
    "physics",
    "productivity",
    "psychology",
    "public-speaking",
    "sleep",
    "society",
    "space",
    "tech",
    "travel",
    "writing",
)

ThemeKey = Literal[
    "ai",
    "art",
    "biology",
    "books",
    "business",
    "career",
    "cars",
    "chemistry",
    "cinema",
    "communication",
    "cooking",
    "design",
    "diy",
    "drinks",
    "ecology",
    "economy",
    "fashion",
    "finance",
    "fitness",
    "games",
    "gardening",
    "general",
    "health",
    "history",
    "language",
    "law",
    "leadership",
    "marketing",
    "math",
    "meditation",
    "music",
    "mythology",
    "parenting",
    "pets",
    "philosophy",
    "photography",
    "physics",
    "productivity",
    "psychology",
    "public-speaking",
    "sleep",
    "society",
    "space",
    "tech",
    "travel",
    "writing",
]


def _known(value: object) -> object:
    """An unknown theme falls back to the generic one instead of failing the whole profile."""
    return value if value in THEMES else "general"


Theme = Annotated[ThemeKey, BeforeValidator(_known)]


def theme_of(profile: dict | None) -> str | None:
    value = (profile or {}).get("theme")
    return value if value in THEMES else None
