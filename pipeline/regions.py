"""Agregados por región administrativa (óblast/sujeto federal).

Alimenta las coropletas comparativas del dashboard (Ucrania | Rusia):
- menciones y tono por región, sobre TODOS los artículos (capa narrativa);
- eventos militares por región (mismo criterio que el mapa de puntos).

Un artículo puede mencionar varias regiones: cuenta una vez en cada una.
Ojo metodológico: las capitales-metónimo (Moscow/Kyiv como sinónimo de sus
gobiernos) inflan la "atención" de su región; el dashboard lo aclara.
"""

from collections import defaultdict
from datetime import datetime, timezone

from .military import build_place_matchers, extract_events


def build_regions(conflict: dict, articles: list[dict]) -> dict | None:
    places = conflict.get("places", [])
    countries = conflict.get("countries", [])
    if not places or not countries:
        return None

    by_place = {p["name"]: p for p in places}
    matchers = build_place_matchers(conflict)

    def region_of(place_name: str) -> tuple[str, str] | None:
        p = by_place.get(place_name)
        if p and p.get("country") and p.get("region"):
            return (p["country"], p["region"])
        return None

    stats = defaultdict(lambda: {
        "mentions": 0, "tone_sum": 0.0, "events": 0,
        "strike": 0, "ground": 0, "infrastructure": 0, "air_defense": 0,
    })

    # --- Capa narrativa: menciones + tono, todas las regiones del artículo ---
    for art in articles:
        text = f"{art['title']}. {art.get('summary', '')}"
        hit_regions = set()
        for m in matchers:
            if m["pattern"].search(text):
                key = region_of(m["name"])
                if key:
                    hit_regions.add(key)
        comp = art["sentiment"]["compound"]
        for key in hit_regions:
            s = stats[key]
            s["mentions"] += 1
            s["tone_sum"] += comp

    # --- Capa militar: eventos por región (lugar primario por artículo) ---
    for ev in extract_events(articles, matchers):
        key = region_of(ev["place"])
        if key:
            s = stats[key]
            s["events"] += 1
            s[ev["type"]] += 1

    regions = [
        {
            "country": c,
            "region": r,
            "mentions": v["mentions"],
            "tone_avg": round(v["tone_sum"] / v["mentions"], 4) if v["mentions"] else None,
            "events": v["events"],
            "strike": v["strike"],
            "ground": v["ground"],
            "infrastructure": v["infrastructure"],
            "air_defense": v["air_defense"],
        }
        for (c, r), v in sorted(stats.items())
    ]

    return {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "countries": countries,
        "regions": regions,
    }
