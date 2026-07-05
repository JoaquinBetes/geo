"""Capa económica: series de mercado (Yahoo Finance) + ayuda internacional.

Yahoo Finance no requiere API key para su endpoint de gráficos, lo que encaja
con la restricción del proyecto (correr en Actions sin secretos). Pedimos
velas SEMANALES de 5 años: suficiente resolución para ver el efecto de la
guerra y archivos chicos. Si una serie falla, se conserva la de la corrida
anterior (mejor dato viejo que agujero).
"""

import urllib.parse
from datetime import datetime, timezone

from .web import get_json

YAHOO_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    "?range=5y&interval=1wk"
)


def fetch_market(market: dict) -> dict:
    """Baja una serie de Yahoo y la deja lista para el frontend."""
    url = YAHOO_URL.format(symbol=urllib.parse.quote(market["symbol"]))
    result = get_json(url)["chart"]["result"][0]
    stamps = result.get("timestamp", [])
    closes = result["indicators"]["quote"][0].get("close", [])

    points = []
    for ts, close in zip(stamps, closes):
        if close is None:
            continue
        date = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        points.append([date, round(close, 4)])

    return {
        "id": market["id"],
        "name": market["name"],
        "unit": market.get("unit", ""),
        "group": market.get("group", "other"),
        "points": points,
    }


def _with_deltas(series: dict, start_date: str) -> dict:
    """Anota última cotización y variación % contra la víspera del conflicto."""
    points = series["points"]
    if not points:
        return series
    series["latest"] = points[-1][1]
    series["latest_date"] = points[-1][0]

    baseline = next((p for p in reversed(points) if p[0] < start_date), None)
    if baseline:
        series["baseline"] = baseline[1]
        series["baseline_date"] = baseline[0]
        if baseline[1]:
            series["change_pct"] = round(
                (points[-1][1] - baseline[1]) / baseline[1] * 100, 1
            )
    return series


def build_economy(conflict: dict, previous: dict | None) -> dict | None:
    """Arma el economy.json. `previous` es la corrida anterior (fallback)."""
    econ = conflict.get("economy", {})
    markets_cfg = econ.get("markets", [])
    aid = econ.get("aid")
    if not markets_cfg and not aid:
        return None

    start_date = conflict.get("start_date", "1900-01-01")
    prev_markets = {m["id"]: m for m in (previous or {}).get("markets", [])}

    markets = []
    for cfg in markets_cfg:
        try:
            markets.append(_with_deltas(fetch_market(cfg), start_date))
        except Exception as exc:
            print(f"  [economía] aviso: falló {cfg['id']} ({exc})", end="")
            if cfg["id"] in prev_markets:
                print(" -> conservo datos de la corrida anterior")
                markets.append(prev_markets[cfg["id"]])
            else:
                print(" -> sin datos previos, se omite")

    return {
        "id": conflict["id"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "start_date": conflict.get("start_date"),
        "note": econ.get("note", ""),
        # Cómo llamar al nivel de referencia ("pre-guerra", "pre-crisis"...)
        "baseline_label": econ.get("baseline_label", "pre-guerra"),
        "markets": markets,
        "aid": aid,
    }
