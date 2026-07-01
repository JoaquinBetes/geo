"""Orquestador del pipeline: scraping -> NLP -> agregados.

Uso:
    python -m pipeline.run                 # procesa todos los conflictos
    python -m pipeline.run russia_ukraine  # procesa sólo el/los indicados
"""

import sys

from .analyze import analyze_article, build_entity_matchers
from .config import load_conflicts
from .fetch import fetch_conflict
from .store import (
    append_articles,
    build_summary,
    read_articles,
    write_index,
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

        existing = read_articles(cid)
        existing_ids = {a["id"] for a in existing}

        raw = fetch_conflict(conflict)
        fresh_raw = [a for a in raw if a["id"] not in existing_ids]

        # Sólo analizamos lo nuevo; lo viejo ya tiene su análisis guardado.
        matchers = build_entity_matchers(conflict)
        fresh = [analyze_article(a, matchers) for a in fresh_raw]
        append_articles(cid, fresh)

        all_articles = existing + fresh
        print(
            f"[{cid}] {len(raw)} descargados | {len(fresh)} nuevos | "
            f"{len(all_articles)} en total"
        )

        summary = build_summary(conflict, all_articles)
        write_summary(cid, summary)
        index_entries.append(
            {
                "id": cid,
                "name": summary["name"],
                "total_articles": summary["total_articles"],
                "updated": summary["updated"],
            }
        )

    write_index(index_entries)
    print("Listo. Datos escritos en docs/data/")


if __name__ == "__main__":
    run(sys.argv[1:] or None)
