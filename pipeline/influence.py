"""Capa de influencia (soft power): alineamiento diplomático + narradores.

Dos naturalezas de dato conviven acá, bien etiquetadas:

1. ALINEAMIENTO (curado): voto en la Asamblea General de la ONU + sanciones.
   Vive en el TOML del conflicto como listas de códigos ISO-3; se revisa a
   mano de tanto en tanto (campo as_of).

2. NARRADORES (vivo): cuántos artículos aporta cada país sede de medios y con
   qué tono. Sale de los artículos del pipeline en cada corrida: mide desde
   dónde se cuenta el conflicto — el soft power narrativo.
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

    return {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": inf.get("as_of", ""),
        "un_resolution": inf.get("un_resolution", ""),
        "note": inf.get("note", ""),
        "alignment": {
            "sanctions": inf.get("sanctions", []),
            "un_no": inf.get("un_no", []),
            "un_abstain": inf.get("un_abstain", []),
            "un_absent": inf.get("un_absent", []),
            "no_data": inf.get("no_data", []),
            "un_yes_total": inf.get("un_yes", None),
        },
        "narrators": _narrators(articles, inf.get("media_origins", [])),
    }
