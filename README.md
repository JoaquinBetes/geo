# Dashboard de tono geopolítico

Trackea cómo cambia el **tono** (análisis de sentimiento) y qué **entidades**
aparecen en la cobertura mediática de un conflicto, a lo largo del tiempo.

**Pipeline:** RSS (scraping) → NLP (sentimiento + entidades) → JSON → dashboard estático.

Arranca con **Rusia–Ucrania** y está diseñado para agregar otros conflictos
(China–Taiwán, etc.) con sólo copiar un archivo de configuración.

## Cómo funciona

```
conflicts/*.toml   →   pipeline/   →   docs/data/*.json   →   docs/ (dashboard)
  (config)          (Python: RSS+NLP)   (datos generados)     (HTML+JS estático)
```

- **`conflicts/`** — un `.toml` por conflicto: feeds RSS, palabras clave y
  entidades a trackear.
- **`pipeline/`** — código Python:
  - `fetch.py` descarga y filtra artículos de los RSS.
  - `analyze.py` calcula sentimiento (VADER) y detecta entidades (gazetteer).
  - `store.py` acumula el histórico y arma los agregados.
  - `run.py` orquesta todo.
- **`docs/`** — el sitio estático que sirve GitHub Pages. Lee los JSON de
  `docs/data/` y dibuja los gráficos con Chart.js.

El histórico (`docs/data/<id>/articles.jsonl`) se **acumula con cada corrida**:
así se puede ver la evolución del discurso en el tiempo.

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
2. Cambiá `id`, `name`, `keywords`, los `feeds` y las `entities`.
3. Corré `python -m pipeline.run`. El dashboard suma el conflicto solo (aparece
   en el selector de arriba).

No hay que tocar código: el pipeline levanta todos los `.toml` de `conflicts/`.

## Desplegar en GitHub (Pages + Actions)

1. Subí el repo a GitHub (tiene que ser **público** para que Pages y los
   workflows programados sean gratis e ilimitados).
2. **Settings → Pages** → *Build and deployment* → Source: **Deploy from a
   branch** → Branch: `main`, carpeta: **`/docs`** → Save.
3. **Settings → Actions → General** → *Workflow permissions* → marcá
   **Read and write permissions** (para que el bot pueda commitear la data).
4. El workflow `.github/workflows/update.yml` corre solo cada 6 horas. Para
   probarlo ya: **Actions → Actualizar dashboard → Run workflow**.

Tu dashboard queda en `https://<usuario>.github.io/<repo>/`.

## Limitaciones y próximos pasos

- **Sentimiento (VADER):** liviano y sin modelos, pero está afinado para textos
  cortos en inglés estilo redes sociales. Para titulares de noticias es un buen
  primer paso; se puede mejorar con un modelo transformer afinado en noticias.
- **Entidades (gazetteer):** listamos a mano las entidades por conflicto. Es
  preciso y rápido, pero no descubre entidades nuevas. Se puede reemplazar por
  NER real (spaCy / transformers) sin tocar el resto del pipeline.
- **Histórico:** los RSS sólo traen lo reciente; el histórico se construye a
  medida que el cron va corriendo día a día.
