"""Descarga de artículos desde feeds RSS y filtrado por palabras clave.

Devuelve artículos "crudos" (sin analizar). El análisis de sentimiento y
entidades se hace en analyze.py; así cada etapa hace una sola cosa.
"""

import hashlib
import html
import re
import time
from datetime import datetime, timezone

import feedparser

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    """Saca etiquetas HTML y normaliza espacios (los resúmenes RSS traen HTML)."""
    if not text:
        return ""
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _entry_datetime(entry) -> datetime | None:
    """Fecha de publicación del artículo en UTC, si el feed la trae."""
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
    return None


def _article_id(url: str) -> str:
    """ID estable a partir de la URL (para deduplicar entre corridas)."""
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def fetch_conflict(conflict: dict) -> list[dict]:
    """Descarga y filtra todos los artículos de un conflicto."""
    keywords = [k.lower() for k in conflict.get("keywords", [])]
    seen_ids: set[str] = set()
    articles: list[dict] = []

    for feed in conflict.get("feeds", []):
        url = feed["url"]
        default_source = feed.get("source", "Desconocido")
        aggregator = bool(feed.get("aggregator", False))

        parsed = feedparser.parse(url)
        for entry in parsed.entries:
            title = _clean(entry.get("title", ""))
            summary = _clean(entry.get("summary", ""))
            link = entry.get("link", "")
            if not title or not link:
                continue

            source = default_source
            if aggregator:
                # Google News y similares traen el medio real en entry.source
                # y agregan " - Medio" al final del título.
                src = entry.get("source")
                if src and src.get("title"):
                    source = src["title"]
                    suffix = f" - {source}"
                    if title.endswith(suffix):
                        title = title[: -len(suffix)].strip()

            text = f"{title} {summary}".lower()
            if keywords and not any(k in text for k in keywords):
                continue

            article_id = _article_id(link)
            if article_id in seen_ids:  # dedup dentro de esta corrida
                continue
            seen_ids.add(article_id)

            dt = _entry_datetime(entry)
            articles.append(
                {
                    "id": article_id,
                    "conflict": conflict["id"],
                    "source": source,
                    "title": title,
                    "summary": summary,
                    "url": link,
                    "published": dt.isoformat() if dt else None,
                }
            )

    return articles
