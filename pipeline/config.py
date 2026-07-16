"""Carga de configuraciones de conflictos desde conflicts/*.toml.

Usamos `tomllib`, que viene en la biblioteca estándar desde Python 3.11,
así que no hace falta instalar nada para leer los TOML.
"""

import tomllib
from pathlib import Path

# Raíz del repo = carpeta que contiene a pipeline/ y conflicts/
ROOT = Path(__file__).resolve().parent.parent
CONFLICTS_DIR = ROOT / "conflicts"


def load_conflicts() -> list[dict]:
    """Devuelve la lista de conflictos configurados (uno por archivo .toml).

    'order' (opcional) controla la posición en el selector del dashboard;
    sin él, el orden es alfabético por nombre de archivo.
    """
    conflicts = []
    for path in sorted(CONFLICTS_DIR.glob("*.toml")):
        with path.open("rb") as f:
            data = tomllib.load(f)
        # Un conflicto se define por tener feeds: los TOML auxiliares de la
        # carpeta (p. ej. media_registry.toml) no lo son.
        if not data.get("feeds"):
            continue
        # Si el TOML no define 'id', usamos el nombre del archivo.
        data.setdefault("id", path.stem)
        data.setdefault("name", data["id"])
        conflicts.append(data)
    conflicts.sort(key=lambda c: (c.get("order", 99), c["id"]))
    return conflicts
