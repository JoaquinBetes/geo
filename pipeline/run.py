"""Orquestador del pipeline: scraping -> NLP -> capas militar y económica.

Uso:
    python -m pipeline.run                 # procesa todos los conflictos
    python -m pipeline.run russia_ukraine  # procesa sólo el/los indicados

Cada capa es independiente: si una fuente externa falla (p. ej. Yahoo), la
capa de narrativa sigue publicándose y la capa caída conserva su última
versión. Un cron no puede darse el lujo de morir entero por una fuente.
"""

import sys

from .analyze import analyze_article, build_entity_matchers
from .config import load_conflicts
from .econ import build_economy
from .fetch import fetch_conflict
from .influence import build_influence
from .media import build_media
from .military import build_military
from .regions import build_regions
from .store import (
    append_articles,
    build_summary,
    read_articles,
    read_json,
    write_index,
    write_json,
    write_summary,
)


def run(conflict_ids: list[str] | None = None) -> None:
    conflicts = load_conflicts()
    if conflict_ids:
        conflicts = [c for c in conflicts if c["id"] in conflict_ids]
        if not conflicts:
            print(f"No se encontró ningún conflicto con id {conflict_ids}")
            return

    index_entries = []
    for conflict in conflicts:
        cid = conflict["id"]
        tabs = ["narrative"]

        # --- Capa 1: narrativa (scraping + NLP) ---
        existing = read_articles(cid)
        existing_ids = {a["id"] for a in existing}

        raw = fetch_conflict(conflict)
        fresh_raw = [a for a in raw if a["id"] not in existing_ids]

        matchers = build_entity_matchers(conflict)
        fresh = [analyze_article(a, matchers) for a in fresh_raw]
        append_articles(cid, fresh)

        all_articles = existing + fresh
        print(
            f"[{cid}] narrativa: {len(raw)} descargados | {len(fresh)} nuevos | "
            f"{len(all_articles)} en total"
        )

        summary = build_summary(conflict, all_articles)
        write_summary(cid, summary)

        # --- Capa 1b: mapa de medios (registro global cruzado con las fuentes) ---
        try:
            media = build_media(conflict, all_articles)
        except Exception as exc:
            print(f"[{cid}] medios: ERROR ({exc}); conservo versión anterior")
            media = read_json(cid, "media.json")
        if media:
            write_json(cid, "media.json", media)
            print(
                f"[{cid}] medios: {len(media['outlets'])} con ficha | "
                f"{media['others_total']} artículos de fuentes sin ficha"
            )

        # --- Capa 2: militar (eventos desde noticias + pérdidas) ---
        try:
            military = build_military(conflict, all_articles)
        except Exception as exc:
            print(f"[{cid}] militar: ERROR ({exc}); conservo versión anterior")
            military = read_json(cid, "military.json")
        if military:
            write_json(cid, "military.json", military)
            tabs.append("military")
            print(
                f"[{cid}] militar: {military['kpis']['events_total']} eventos "
                f"geolocalizados | pérdidas: "
                f"{'OK' if military.get('losses') else 'sin datos'}"
            )

        # --- Capa 2b: agregados regionales (coropletas comparativas) ---
        try:
            regions = build_regions(conflict, all_articles)
        except Exception as exc:
            print(f"[{cid}] regiones: ERROR ({exc}); conservo versión anterior")
            regions = read_json(cid, "regions.json")
        if regions:
            write_json(cid, "regions.json", regions)
            n_con_datos = sum(1 for r in regions["regions"] if r["mentions"])
            print(f"[{cid}] regiones: {n_con_datos} con menciones")

        # --- Capa 3: economía (mercados + ayuda) ---
        try:
            economy = build_economy(conflict, read_json(cid, "economy.json"))
        except Exception as exc:
            print(f"[{cid}] economía: ERROR ({exc}); conservo versión anterior")
            economy = read_json(cid, "economy.json")
        if economy:
            write_json(cid, "economy.json", economy)
            tabs.append("economy")
            print(f"[{cid}] economía: {len(economy['markets'])} series de mercado")

        # --- Capa 4: influencia (alineamiento curado + narradores en vivo) ---
        try:
            influence = build_influence(conflict, all_articles)
        except Exception as exc:
            print(f"[{cid}] influencia: ERROR ({exc}); conservo versión anterior")
            influence = read_json(cid, "influence.json")
        if influence:
            write_json(cid, "influence.json", influence)
            tabs.append("influence")
            print(f"[{cid}] influencia: {len(influence['narrators'])} países narradores")

        # La portada (landing) se alimenta sólo de index.json: países a resaltar
        # en el mapamundi, tono global, mini-serie de actividad y stats.
        index_entries.append(
            {
                "id": cid,
                "name": summary["name"],
                "description": conflict.get("description", ""),
                "total_articles": summary["total_articles"],
                "tone": summary["overall_avg"],
                "updated": summary["updated"],
                "tabs": tabs,
                "countries": [
                    {"code": c.get("code"), "name": c.get("name"), "iso3": c.get("iso3")}
                    for c in conflict.get("countries", [])
                ],
                "spark": [d["count"] for d in summary["daily"][-14:]],
                "events_7d": military["kpis"]["events_7d"] if military else None,
            }
        )

    write_index(index_entries)
    print("Listo. Datos escritos en docs/data/")


if __name__ == "__main__":
    run(sys.argv[1:] or None)
