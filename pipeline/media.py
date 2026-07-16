"""Mapa de medios: cruza las fuentes reales de cada conflicto con el registro
global curado (conflicts/media_registry.toml).

Para cada medio identificado se calculan métricas propias del conflicto
(artículos aportados, tono promedio y su desvío contra el promedio general)
y se adjuntan los atributos curados (sede, tipo de propiedad, descripción,
ranking RSF del país sede). Las fuentes sin ficha quedan listadas aparte.

El match es por substring, pero gana la coincidencia MÁS LARGA: así
"The Times of Israel" empareja con su ficha y no con la de "TIME".
"""

import tomllib
from collections import defaultdict
from datetime import datetime, timezone

from .config import ROOT

_REGISTRY = None


def load_registry() -> dict:
    global _REGISTRY
    if _REGISTRY is None:
        path = ROOT / "conflicts" / "media_registry.toml"
        with path.open("rb") as f:
            _REGISTRY = tomllib.load(f)
    return _REGISTRY


def _match_outlet(source_lower: str, outlets: list[dict]) -> dict | None:
    best = None
    for o in outlets:
        m = o["match"]
        if m in source_lower and (best is None or len(m) > len(best["match"])):
            best = o
    return best


def build_media(conflict: dict, articles: list[dict]) -> dict | None:
    reg = load_registry()
    outlets = reg.get("outlets", [])
    rsf = reg.get("rsf", {})
    if not outlets or not articles:
        return None

    # Agregación por nombre de fuente crudo
    per_source = defaultdict(lambda: {"count": 0, "tone": 0.0})
    total, tone_total = 0, 0.0
    for a in articles:
        s = per_source[a["source"]]
        comp = a["sentiment"]["compound"]
        s["count"] += 1
        s["tone"] += comp
        total += 1
        tone_total += comp
    overall = tone_total / total if total else 0.0

    # Cruce contra el registro (varias variantes de fuente -> una misma ficha)
    stats: dict[str, dict] = {}
    others: dict[str, int] = defaultdict(int)
    for source, v in per_source.items():
        o = _match_outlet(source.lower(), outlets)
        if not o:
            others[source] += v["count"]
            continue
        st = stats.setdefault(o["name"], {
            "name": o["name"],
            "url": o["url"],
            "city": o.get("city", ""),
            "country": o.get("country", ""),
            "iso3": o.get("iso3", ""),
            "type": o.get("type", ""),
            "desc": o.get("desc", ""),
            "lat": o["lat"],
            "lon": o["lon"],
            "rsf": rsf.get(o.get("iso3", "")),
            "articles": 0,
            "_tone_sum": 0.0,
        })
        st["articles"] += v["count"]
        st["_tone_sum"] += v["tone"]

    out_list = []
    for st in stats.values():
        st["tone_avg"] = round(st["_tone_sum"] / st["articles"], 4)
        st["tone_delta"] = round(st["tone_avg"] - overall, 4)
        del st["_tone_sum"]
        out_list.append(st)
    out_list.sort(key=lambda x: -x["articles"])

    # Intensidad por país sede (para la coropleta)
    by_country = defaultdict(lambda: {"outlets": 0, "articles": 0})
    for st in out_list:
        if st["iso3"]:
            c = by_country[st["iso3"]]
            c["outlets"] += 1
            c["articles"] += st["articles"]

    others_total = sum(others.values())
    others_list = sorted(others.items(), key=lambda kv: -kv[1])[:15]

    return {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "overall_tone": round(overall, 4),
        "rsf_as_of": reg.get("rsf_as_of", ""),
        "outlets": out_list,
        "by_country": dict(by_country),
        "others": [{"source": s, "articles": n} for s, n in others_list],
        "others_total": others_total,
        "matched_articles": total - others_total,
        "total_articles": total,
    }
