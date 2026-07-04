"""Persistencia de datos y construcción de agregados para el frontend.

Modelo de almacenamiento (todo dentro de docs/data/ para que GitHub Pages lo sirva):

  docs/data/index.json                      -> lista de conflictos disponibles
  docs/data/<id>/articles.jsonl             -> histórico crudo, 1 artículo por línea
  docs/data/<id>/summary.json               -> agregados que consume el dashboard

articles.jsonl es "append-only": cada corrida sólo agrega las líneas nuevas.
Así el histórico se va acumulando con el tiempo (que es lo que permite ver la
evolución del discurso) y los diffs de git quedan chicos.
"""

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "docs" / "data"

# Etiqueta de sentimiento -> clave corta usada en los agregados.
_LABEL_KEY = {"positive": "pos", "neutral": "neu", "negative": "neg"}

# Cuántos elementos exponer en el resumen (para que el JSON no crezca infinito).
MAX_ENTITIES = 25
MAX_RECENT = 60


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _conflict_dir(conflict_id: str) -> Path:
    return DATA_DIR / conflict_id


def read_articles(conflict_id: str) -> list[dict]:
    """Lee el histórico acumulado de un conflicto (lista vacía si no existe)."""
    path = _conflict_dir(conflict_id) / "articles.jsonl"
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def append_articles(conflict_id: str, fresh: list[dict]) -> None:
    """Agrega artículos nuevos (ya analizados) al histórico."""
    if not fresh:
        return
    d = _conflict_dir(conflict_id)
    d.mkdir(parents=True, exist_ok=True)
    stamp = _now_iso()
    with (d / "articles.jsonl").open("a", encoding="utf-8") as f:
        for art in fresh:
            art["fetched"] = stamp
            f.write(json.dumps(art, ensure_ascii=False) + "\n")


def build_summary(conflict: dict, articles: list[dict]) -> dict:
    """Calcula los agregados que consume el dashboard a partir del histórico."""
    daily = defaultdict(lambda: {"count": 0, "sum": 0.0, "pos": 0, "neu": 0, "neg": 0})
    by_source = defaultdict(lambda: {"count": 0, "sum": 0.0})
    entities = defaultdict(lambda: {"count": 0, "sum": 0.0, "type": "MISC"})
    dist = {"pos": 0, "neu": 0, "neg": 0}
    total_sum = 0.0

    for art in articles:
        comp = art["sentiment"]["compound"]
        key = _LABEL_KEY[art["sentiment"]["label"]]
        total_sum += comp
        dist[key] += 1

        day = (art.get("published") or art.get("fetched") or "")[:10]
        if day:
            bucket = daily[day]
            bucket["count"] += 1
            bucket["sum"] += comp
            bucket[key] += 1

        src = by_source[art["source"]]
        src["count"] += 1
        src["sum"] += comp

        for ent in art.get("entities", []):
            e = entities[ent["name"]]
            e["count"] += 1
            e["sum"] += comp
            e["type"] = ent["type"]

    daily_list = [
        {
            "date": day,
            "count": b["count"],
            "avg": round(b["sum"] / b["count"], 4),
            "pos": b["pos"],
            "neu": b["neu"],
            "neg": b["neg"],
        }
        for day, b in sorted(daily.items())
    ]

    source_list = sorted(
        (
            {"source": s, "count": v["count"], "avg": round(v["sum"] / v["count"], 4)}
            for s, v in by_source.items()
        ),
        key=lambda x: x["count"],
        reverse=True,
    )

    entity_list = sorted(
        (
            {
                "name": n,
                "type": v["type"],
                "count": v["count"],
                "avg": round(v["sum"] / v["count"], 4),
            }
            for n, v in entities.items()
        ),
        key=lambda x: x["count"],
        reverse=True,
    )[:MAX_ENTITIES]

    recent = sorted(
        articles, key=lambda a: (a.get("published") or a.get("fetched") or ""), reverse=True
    )[:MAX_RECENT]
    recent_list = [
        {
            "title": a["title"],
            "source": a["source"],
            "url": a["url"],
            "published": a.get("published") or a.get("fetched"),
            "compound": a["sentiment"]["compound"],
            "label": a["sentiment"]["label"],
            "entities": [e["name"] for e in a.get("entities", [])],
        }
        for a in recent
    ]

    total = len(articles)
    return {
        "id": conflict["id"],
        "name": conflict.get("name", conflict["id"]),
        "description": conflict.get("description", ""),
        "updated": _now_iso(),
        "total_articles": total,
        "overall_avg": round(total_sum / total, 4) if total else 0.0,
        "distribution": dist,
        "sources": [s["source"] for s in source_list],
        "daily": daily_list,
        "by_source": source_list,
        "top_entities": entity_list,
        "recent": recent_list,
    }


def write_summary(conflict_id: str, summary: dict) -> None:
    d = _conflict_dir(conflict_id)
    d.mkdir(parents=True, exist_ok=True)
    with (d / "summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)


def write_json(conflict_id: str, filename: str, obj: dict) -> None:
    """Escribe un JSON arbitrario en la carpeta de datos del conflicto."""
    d = _conflict_dir(conflict_id)
    d.mkdir(parents=True, exist_ok=True)
    with (d / filename).open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def read_json(conflict_id: str, filename: str) -> dict | None:
    """Lee un JSON previo (None si no existe o está corrupto).

    "Corrupto" pasa en la vida real: p. ej. un merge de git que dejó
    marcadores de conflicto adentro. Para un fallback, None es mejor que
    tirar abajo toda la corrida.
    """
    path = _conflict_dir(conflict_id) / filename
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def write_index(entries: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    index = {"updated": _now_iso(), "conflicts": entries}
    with (DATA_DIR / "index.json").open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
