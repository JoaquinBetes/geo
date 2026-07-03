"""Helper HTTP mínimo (stdlib puro) para las fuentes de datos externas.

Sin `requests` a propósito: mantiene el pipeline 100% Python puro, que instala
sin problemas tanto en tu Python 3.14 local como en el runner de Actions.
"""

import json
import urllib.request

# Algunos servicios (Yahoo) rechazan requests sin User-Agent de navegador.
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def get_bytes(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_json(url: str, timeout: int = 60):
    return json.loads(get_bytes(url, timeout=timeout))
