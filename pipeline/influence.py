"""Capa de influencia (soft power): alineamiento diplomático + narradores.

Dos naturalezas de dato conviven acá, bien etiquetadas:

1. ALINEAMIENTO (curado): categorías de países definidas en el TOML del
   conflicto. El esquema es genérico — cada conflicto define sus propias
   categorías (para Rusia-Ucrania: voto ONU + sanciones; para Irán-Israel:
   sanciones a Irán, acuerdos con Israel, etc.):

       [[influence.categories]]
       id = "sanction"; label = "..."; color = "cyan"; countries = ["USA", ...]
       # flags opcionales: rest = true (categoría por defecto para países no
       # listados), nodata = true (se pinta apagado).

2. NARRADORES (vivo): cuántos artículos aporta cada país sede de medios y con
   qué tono. Se recalcula en cada corrida — el soft power narrativo.
"""

from collections import defaultdict
from datetime import datetime, timezone

MAX_NARRATORS = 14


def _narrators(articles: list[dict], origins: list[dict]) -> list[dict]:
    """Agrupa artículos por país sede del medio (primera coincidencia gana)."""
    rules = [(o["match"].lower(), o["country"]) for o in origins]

    def country_of(source: str) -> str:
        s = source.lower()
        for match, country in rules:
            if match in s:
                return country
        return "Otros / sin clasificar"

    agg = defaultdict(lambda: {"articles": 0, "tone_sum": 0.0})
    for art in articles:
        a = agg[country_of(art["source"])]
        a["articles"] += 1
        a["tone_sum"] += art["sentiment"]["compound"]

    out = [
        {
            "country": c,
            "articles": v["articles"],
            "tone_avg": round(v["tone_sum"] / v["articles"], 4),
        }
        for c, v in agg.items()
    ]
    out.sort(key=lambda x: x["articles"], reverse=True)
    return out[:MAX_NARRATORS]


def build_influence(conflict: dict, articles: list[dict]) -> dict | None:
    inf = conflict.get("influence")
    if not inf:
        return None

    categories = [
        {
            "id": c.get("id", c["label"]),
            "label": c["label"],
            "color": c.get("color", "gray"),
            "countries": c.get("countries", []),
            "rest": bool(c.get("rest", False)),
            "nodata": bool(c.get("nodata", False)),
        }
        for c in inf.get("categories", [])
    ]

    return {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": inf.get("as_of", ""),
        "reference": inf.get("reference", ""),
        "note": inf.get("note", ""),
        "kpis": inf.get("kpis", []),
        "categories": categories,
        "narrators": _narrators(articles, inf.get("media_origins", [])),
    }
