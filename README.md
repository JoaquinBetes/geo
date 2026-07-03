# GEO//MONITOR — Monitor de conflictos OSINT

Dashboard de fuentes abiertas que sigue un conflicto en **tres ejes cruzables**:

| Pestaña | Qué mide | Fuente |
|---|---|---|
| **01 Narrativa** | Tono (sentimiento) y entidades en la cobertura mediática | RSS de medios + Google News |
| **02 Militar** | Eventos geolocalizados, anomalías de actividad, pérdidas | Eventos derivados de las propias noticias + dataset del Estado Mayor ucraniano |
| **03 Economía** | Commodities, tipos de cambio, ayuda internacional | Yahoo Finance (sin key) + snapshot del Kiel Institute |

**Pipeline:** RSS/APIs → NLP y agregación (Python puro) → JSON estático → dashboard (Chart.js + Leaflet). Sin backend, sin API keys, deploy en GitHub Pages con actualización automática vía Actions.

Arranca con **Rusia–Ucrania** y está diseñado para agregar otros conflictos
(China–Taiwán, etc.) con sólo copiar un archivo de configuración.

## Cómo funciona

```
conflicts/*.toml   →   pipeline/           →   docs/data/<id>/*.json   →   docs/ (dashboard)
  (config)            (Python: fetch+NLP)       (datos generados)          (HTML+JS estático)
```

- **`conflicts/`** — un `.toml` por conflicto: feeds RSS, keywords, entidades,
  gazetteer de lugares (lat/lon), datasets de pérdidas y series de mercado.
- **`pipeline/`** — código Python (100% puro, sin compilar):
  - `fetch.py` descarga y filtra artículos de los RSS.
  - `analyze.py` sentimiento (VADER) + entidades (gazetteer).
  - `military.py` extrae eventos geolocalizados de las noticias (estilo GDELT),
    detecta picos anómalos (media móvil 30 d + 2σ) y baja las pérdidas.
  - `econ.py` series de mercado semanales de Yahoo Finance, con baseline pre-guerra.
  - `store.py` histórico acumulativo + agregados.
  - `run.py` orquesta; cada capa es tolerante a fallos de su fuente.
- **`docs/`** — sitio estático (Pages): `js/core.js` (estado y pestañas),
  `js/narrative.js`, `js/military.js` (mapa Leaflet + heatmap), `js/economy.js`.

El histórico de artículos (`docs/data/<id>/articles.jsonl`) se **acumula con
cada corrida**: la profundidad temporal del dashboard crece sola con el cron.

## Honestidad metodológica (importante)

- Los **eventos militares** se extraen automáticamente de titulares: miden
  *cobertura de eventos por la prensa*, no confirmación en terreno.
- Las **pérdidas** son el reclamo del Estado Mayor de Ucrania: estimación de
  una de las partes, no verificada independientemente.
- La **ayuda internacional** es un snapshot manual aproximado del Kiel Institute
  Ukraine Support Tracker (actualizar de tanto en tanto en el TOML).
- Cada caveat se muestra en el propio dashboard, junto al dato.

## Correr localmente (Windows)

> Ojo: en esta máquina el comando `python` del PATH es el *stub* de la Microsoft
> Store y rompe `venv`. Usá el Python real por su ruta completa la primera vez.

```powershell
# 1) Crear el entorno virtual (una sola vez)
& "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe" -m venv .venv

# 2) Instalar dependencias
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) Correr el pipeline (descarga, analiza y guarda en docs/data/)
.\.venv\Scripts\python.exe -m pipeline.run

# 4) Levantar el dashboard (NO abras el HTML como archivo: los fetch fallan)
.\.venv\Scripts\python.exe -m http.server 8000 --directory docs
# abrí http://localhost:8000
```

## Agregar otro conflicto

1. Copiá `conflicts/russia_ukraine.toml` a, por ejemplo, `conflicts/china_taiwan.toml`.
2. Cambiá `id`, `name`, `keywords`, `feeds`, `entities` y — si querés esas
   pestañas — `places` (militar) y `economy.markets` (economía). Las pestañas
   sin config simplemente no aparecen para ese conflicto.
3. Corré `python -m pipeline.run`. Aparece solo en el selector.

## Desplegar en GitHub (Pages + Actions)

1. Repo **público** (Pages y cron gratis e ilimitados).
2. **Settings → Pages** → Deploy from a branch → `main` + carpeta **`/docs`**.
3. **Settings → Actions → General** → Workflow permissions → **Read and write**.
4. `.github/workflows/update.yml` corre cada 6 h; para probar ya:
   **Actions → Actualizar dashboard → Run workflow**.

> Recordatorio: en repos públicos, GitHub desactiva los workflows programados
> tras 60 días sin actividad. Cualquier push los reactiva.

## Limitaciones y próximos pasos

- **VADER** está afinado para inglés corto; un transformer afinado en noticias
  mejoraría el matiz. Es enchufable en `analyze.py`.
- El **gazetteer** (entidades y lugares) no descubre nombres nuevos; NER real
  (spaCy/transformers) es el upgrade natural, sin tocar el resto.
- **Pestaña energética** (Zaporiyia, ataques a la red, flujo de gas): la
  arquitectura de pestañas ya lo soporta; falta la fuente de datos.
- El histórico de artículos crece con el tiempo; si el repo engorda, podar o
  mover el store.
