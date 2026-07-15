"""Capa militar: eventos geolocalizados desde las noticias + pérdidas oficiales.

Dos fuentes, muy distintas y por eso etiquetadas con sus respectivos caveats:

1. EVENTOS: se extraen de los artículos que ya scrapea la capa de narrativa.
   Si un artículo usa vocabulario militar (misiles, ofensivas, etc.) y menciona
   un lugar del gazetteer del conflicto, se genera un evento geolocalizado.
   Es el enfoque tipo GDELT: mide "eventos reportados por la prensa", no
   confirmación en terreno. Barato, sin API keys y consistente con el resto.

2. PÉRDIDAS: dataset público diario con los números del Estado Mayor ucraniano
   (personal y equipamiento ruso). Estimación de una de las partes.
"""

import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from .web import get_json

# --- Clasificación de tipo de evento (el orden es prioridad) --------------------
# Un ataque a una central eléctrica también matchea "strike"; queremos la
# categoría más específica primero.
EVENT_TYPES: list[tuple[str, list[str]]] = [
    (
        "infrastructure",
        [
            "power plant", "power grid", "power station", "substation",
            "energy infrastructure", "energy facility", "blackout", "refinery",
            "oil depot", "fuel depot", "oil terminal", "pipeline", "gas facility",
            "railway", "bridge", "dam", "nuclear plant", "port",
        ],
    ),
    (
        "strike",
        [
            "missile", "missiles", "drone strike", "drone attack", "drones",
            "shahed", "airstrike", "air strike", "shelling", "shelled",
            "artillery", "rocket", "glide bomb", "bombardment", "bombed",
            "strike", "strikes", "struck", "explosion", "explosions", "blast",
        ],
    ),
    (
        "ground",
        [
            "offensive", "counteroffensive", "counter-offensive", "assault",
            "advance", "advances", "advancing", "captured", "capture", "seize",
            "seized", "liberated", "front line", "frontline", "incursion",
            "fighting", "battle", "clashes",
        ],
    ),
    (
        "air_defense",
        ["shot down", "intercepted", "downed", "air defense", "air defence"],
    ),
]

_TYPE_MATCHERS = [
    (etype, re.compile(r"\b(?:" + "|".join(re.escape(t) for t in terms) + r")\b", re.I))
    for etype, terms in EVENT_TYPES
]

# Mapeo de columnas del dataset de equipamiento -> etiquetas del dashboard.
EQUIPMENT_FIELDS = [
    ("tank", "Tanques"),
    ("APC", "Blindados (APC)"),
    ("field artillery", "Artillería"),
    ("drone", "Drones"),
    ("aircraft", "Aviones"),
    ("helicopter", "Helicópteros"),
    ("naval ship", "Buques"),
    ("cruise missiles", "Misiles crucero"),
]

MAP_EVENT_DAYS = 180   # ventana de eventos que se muestran en el mapa
MAP_EVENT_CAP = 900    # tope duro para que el JSON no explote
HOT_PLACE_DAYS = 30    # ventana para "zona más activa"


def classify_event(text: str) -> str | None:
    for etype, pattern in _TYPE_MATCHERS:
        if pattern.search(text):
            return etype
    return None


def build_place_matchers(conflict: dict) -> list[dict]:
    matchers = []
    for place in conflict.get("places", []):
        terms = [place["name"], *place.get("aliases", [])]
        matchers.append(
            {
                "name": place["name"],
                "lat": place["lat"],
                "lon": place["lon"],
                "metonym": bool(place.get("metonym", False)),
                "pattern": re.compile(
                    r"\b(?:" + "|".join(re.escape(t) for t in terms) + r")\b", re.I
                ),
            }
        )
    return matchers


def _locate(text: str, matchers: list[dict]) -> dict | None:
    """Elige el lugar del evento: el primero mencionado, evitando metónimos.

    "Moscow says strikes on Kyiv continue" debe geolocalizar en Kyiv... pero
    ojo: Kyiv también es metónimo. La regla es: los lugares "de campo" le ganan
    siempre a los metónimos (capitales usadas como sinónimo del gobierno);
    entre iguales, gana el que aparece primero en el texto.
    """
    hits = []
    for m in matchers:
        match = m["pattern"].search(text)
        if match:
            hits.append((m["metonym"], match.start(), m))
    if not hits:
        return None
    hits.sort(key=lambda h: (h[0], h[1]))  # no-metónimos primero, luego posición
    return hits[0][2]


def extract_events(articles: list[dict], matchers: list[dict]) -> list[dict]:
    """Un evento por artículo con vocabulario militar + lugar identificable."""
    events = []
    for art in articles:
        text = f"{art['title']}. {art.get('summary', '')}"
        etype = classify_event(text)
        if not etype:
            continue
        place = _locate(text, matchers)
        if not place:
            continue
        date = (art.get("published") or art.get("fetched") or "")[:10]
        if not date:
            continue
        events.append(
            {
                "date": date,
                "type": etype,
                "place": place["name"],
                "lat": place["lat"],
                "lon": place["lon"],
                "title": art["title"],
                "source": art["source"],
                "url": art["url"],
            }
        )
    return events


def daily_series(events: list[dict]) -> list[dict]:
    """Serie diaria por tipo + detección de anomalías (media 30d + 2 sigma)."""
    days = defaultdict(lambda: {"total": 0, "strike": 0, "ground": 0,
                                "infrastructure": 0, "air_defense": 0})
    for ev in events:
        d = days[ev["date"]]
        d["total"] += 1
        d[ev["type"]] += 1

    series = [{"date": day, **counts} for day, counts in sorted(days.items())]

    # Anomalías: un día es anómalo si supera media+2σ de los 30 días previos.
    totals = [s["total"] for s in series]
    for i, s in enumerate(series):
        window = totals[max(0, i - 30):i]
        s["anomaly"] = False
        if len(window) >= 7:
            mean = statistics.mean(window)
            std = statistics.pstdev(window)
            if s["total"] >= 5 and s["total"] > mean + 2 * std:
                s["anomaly"] = True
    return series


def _recent(events: list[dict], days: int) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    return [e for e in events if e["date"] >= cutoff]


def _weekly(entries: list[dict]) -> list[dict]:
    """Submuestreo semanal de una serie diaria: siempre incluye el último día."""
    out = list(reversed(entries[::-7]))  # desde el final, cada 7 días
    return out


def fetch_losses(conflict: dict) -> dict | None:
    """Descarga y resume el dataset de pérdidas (si el conflicto lo define)."""
    mil = conflict.get("military", {})
    p_url, e_url = mil.get("losses_personnel_url"), mil.get("losses_equipment_url")
    if not (p_url and e_url):
        return None

    personnel = get_json(p_url)
    equipment = get_json(e_url)

    last_p = personnel[-1]
    week_ago_p = personnel[-8] if len(personnel) >= 8 else personnel[0]
    p_series = [
        {"date": e["date"], "total": e.get("personnel", 0)}
        for e in _weekly(personnel)
    ]

    last_e = equipment[-1]
    month_ago_e = equipment[-31] if len(equipment) >= 31 else equipment[0]
    categories = [
        {
            "key": key,
            "name": name,
            "total": last_e.get(key) or 0,
            "delta_30d": (last_e.get(key) or 0) - (month_ago_e.get(key) or 0),
        }
        for key, name in EQUIPMENT_FIELDS
    ]
    e_series = [
        {
            "date": e["date"],
            **{key: e.get(key) or 0 for key, _ in EQUIPMENT_FIELDS},
        }
        for e in _weekly(equipment)
    ]

    return {
        "as_of": last_p["date"],
        "personnel": {
            "total": last_p.get("personnel", 0),
            "delta_7d": last_p.get("personnel", 0) - week_ago_p.get("personnel", 0),
            "series": p_series,
        },
        "equipment": {"categories": categories, "series": e_series},
    }


def build_military(conflict: dict, articles: list[dict]) -> dict | None:
    """Arma el military.json del conflicto. None si no hay config militar."""
    if not conflict.get("places") and not conflict.get("military"):
        return None

    matchers = build_place_matchers(conflict)
    events = extract_events(articles, matchers)
    series = daily_series(events)

    # Transparencia metodológica: ventana temporal que cubren los artículos y
    # cuántas menciones militares quedaron sin lugar identificable (los
    # titulares "país contra país" no se pueden poner en el mapa).
    dates = sorted(
        d for d in ((a.get("published") or a.get("fetched") or "")[:10] for a in articles) if d
    )
    window = {"from": dates[0], "to": dates[-1]} if dates else None
    unlocated = 0
    for art in articles:
        text = f"{art['title']}. {art.get('summary', '')}"
        if classify_event(text) and not _locate(text, matchers):
            unlocated += 1

    recent7 = _recent(events, 7)
    prev7 = [e for e in _recent(events, 14) if e not in recent7]

    hot = defaultdict(int)
    for e in _recent(events, HOT_PLACE_DAYS):
        hot[e["place"]] += 1
    top_places = sorted(
        ({"place": p, "count": c} for p, c in hot.items()),
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    map_events = sorted(_recent(events, MAP_EVENT_DAYS), key=lambda e: e["date"])
    map_events = map_events[-MAP_EVENT_CAP:]

    mil = conflict.get("military", {})
    # Balance de fuerzas curado (estimaciones abiertas): comparable entre
    # conflictos, a diferencia de las pérdidas (que dependen de que exista un
    # dataset público, hoy sólo el ucraniano).
    balance = mil.get("balance")
    if balance:
        sides = [c.get("name", "") for c in conflict.get("countries", [])[:2]]
        balance = {
            "as_of": balance.get("as_of", ""),
            "source": balance.get("source", ""),
            "sides": sides,
            "items": balance.get("items", []),
        }

    out = {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "balance": balance,
        "losses_label": mil.get("losses_label", ""),
        "caveats": {
            "events": mil.get("events_caveat", ""),
            "losses": mil.get("losses_caveat", ""),
        },
        "window": window,
        "kpis": {
            "events_total": len(events),
            "events_unlocated": unlocated,
            "events_7d": len(recent7),
            "events_prev_7d": len(prev7),
            "hottest_place": top_places[0]["place"] if top_places else None,
        },
        "daily": series,
        "events": map_events,
        "top_places": top_places,
        "losses": None,
    }

    try:
        out["losses"] = fetch_losses(conflict)
    except Exception as exc:  # la fuente externa puede fallar: no rompemos todo
        print(f"  [militar] aviso: no se pudieron bajar las pérdidas: {exc}")
    return out
