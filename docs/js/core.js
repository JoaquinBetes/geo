// =============================================================================
// core.js — estado global, selector de conflicto, pestañas y helpers.
// El dashboard es 100% estático: lee los JSON que genera el pipeline.
// =============================================================================

const COLORS = {
  amber: "#e5a53d",
  cyan: "#4db8e8",
  pos: "#3fcf8e",
  neu: "#8a97a8",
  neg: "#ef5d52",
  border: "#223041",
  muted: "#7f92a8",
};

// Tipos de evento militar: etiqueta y color únicos en todo el dashboard.
const EVENT_META = {
  strike: { label: "Ataque / bombardeo", color: COLORS.neg },
  ground: { label: "Combate terrestre", color: COLORS.amber },
  infrastructure: { label: "Infraestructura", color: COLORS.cyan },
  air_defense: { label: "Defensa aérea", color: COLORS.pos },
};

Chart.defaults.color = COLORS.muted;
Chart.defaults.borderColor = COLORS.border;
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 10;

// --- Estado global -----------------------------------------------------------
const state = {
  conflictId: null,
  tabs: [],                 // pestañas disponibles para el conflicto actual
  data: {},                 // { summary, military, economy, regions, layers }
  rendered: {},             // qué pestañas ya se dibujaron (render perezoso)
  activeTab: "narrative",
  charts: {},               // instancias Chart.js (para destruir al recargar)
  maps: {},                 // instancias Leaflet, clave "pestaña:nombre"
};

const TAB_HASH = { narrative: "narrativa", military: "militar", economy: "economia" };
const HASH_TAB = Object.fromEntries(Object.entries(TAB_HASH).map(([k, v]) => [v, k]));

// --- Helpers -----------------------------------------------------------------
const nf = new Intl.NumberFormat("es-AR");
const fmtNum = (n) => (n == null ? "–" : nf.format(n));

function fmtDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function sentimentColor(v) {
  if (v <= -0.05) return COLORS.neg;
  if (v >= 0.05) return COLORS.pos;
  return COLORS.neu;
}

// Crea/reemplaza un gráfico destruyendo la instancia anterior.
function swapChart(key, canvasId, config) {
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart(document.getElementById(canvasId), config);
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// --- Mapas Leaflet -------------------------------------------------------------
// Los GeoJSON de límites (geoBoundaries CC-BY) se cachean: se comparten entre
// pestañas y no cambian entre conflictos.
const GEO_CACHE = {};
function loadGeoFile(path) {
  if (!GEO_CACHE[path]) GEO_CACHE[path] = fetchJson(path);
  return GEO_CACHE[path];
}

// Crea (o recrea) un mapa registrado en state.maps con los tiles oscuros.
function newMap(key, elId, opts = {}) {
  if (state.maps[key]) { state.maps[key].remove(); delete state.maps[key]; }
  const map = L.map(elId, { scrollWheelZoom: false, ...opts });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 12,
  }).addTo(map);
  state.maps[key] = map;
  return map;
}

function regionLabel(name) {
  return name.replace(/ Oblast$/i, "").replace("Autonomous Republic of Crimea", "Crimea");
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Color con opacidad proporcional a t ∈ [0,1] (rampa de intensidad).
function ramp(baseHex, t) {
  const { r, g, b } = hexToRgb(baseHex);
  return `rgba(${r},${g},${b},${(0.10 + 0.78 * Math.max(0, Math.min(1, t))).toFixed(3)})`;
}

// Coropleta genérica: pinta un GeoJSON de regiones según styleOf/tooltipOf.
// hasData decide qué regiones definen el encuadre inicial del mapa.
function choropleth({ key, elId, geo, styleOf, tooltipOf, hasData }) {
  const map = newMap(key, elId, { zoomControl: false, attributionControl: false });
  const layer = L.geoJSON(geo, {
    style: (f) => styleOf(f.properties.name),
    onEachFeature: (f, l) =>
      l.bindTooltip(tooltipOf(f.properties.name), { sticky: true }),
  }).addTo(map);

  const withData = geo.features.filter((f) => hasData(f.properties.name));
  const fit = withData.length >= 2
    ? L.geoJSON({ type: "FeatureCollection", features: withData }).getBounds()
    : layer.getBounds();
  map.fitBounds(fit.pad(0.12));
  return map;
}

// --- Pestañas ----------------------------------------------------------------
function showTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.id !== `tab-${tab}`;
  });
  history.replaceState(null, "", `#${TAB_HASH[tab]}`);

  // Render perezoso: los canvas ocultos se inicializan con tamaño 0,
  // así que cada pestaña se dibuja recién la primera vez que se muestra.
  if (!state.rendered[tab]) {
    state.rendered[tab] = true;
    if (tab === "narrative") renderNarrative(state.data);
    if (tab === "military") renderMilitary(state.data);
    if (tab === "economy") renderEconomy(state.data);
  }
  // Leaflet necesita recalcular tamaño al volver a ser visible.
  for (const [key, map] of Object.entries(state.maps)) {
    if (key.startsWith(`${tab}:`)) setTimeout(() => map.invalidateSize(), 60);
  }
}

function setupTabs(available) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.hidden = !available.includes(b.dataset.tab);
    b.onclick = () => showTab(b.dataset.tab);
  });
  const fromHash = HASH_TAB[location.hash.replace("#", "")];
  showTab(available.includes(fromHash) ? fromHash : "narrative");
}

// --- Carga de un conflicto ---------------------------------------------------
async function loadConflict(entry) {
  state.conflictId = entry.id;
  state.tabs = entry.tabs || ["narrative"];
  state.rendered = {};
  Object.values(state.charts).forEach((c) => c.destroy());
  state.charts = {};
  Object.values(state.maps).forEach((m) => m.remove());
  state.maps = {};

  const base = `data/${entry.id}`;
  const [summary, military, economy, regions, layers] = await Promise.all([
    fetchJson(`${base}/summary.json`),
    state.tabs.includes("military") ? fetchJson(`${base}/military.json`).catch(() => null) : null,
    state.tabs.includes("economy") ? fetchJson(`${base}/economy.json`).catch(() => null) : null,
    fetchJson(`${base}/regions.json`).catch(() => null),
    fetchJson(`${base}/layers.geojson`).catch(() => null),
  ]);
  state.data = { summary, military, economy, regions, layers };

  document.getElementById("hdr-updated").textContent = fmtDate(summary.updated);
  document.getElementById("empty").hidden = true;
  document.getElementById("dashboard").hidden = false;

  const available = state.tabs.filter(
    (t) => t === "narrative" || (t === "military" ? military : economy)
  );
  setupTabs(available);
}

// --- Arranque ----------------------------------------------------------------
async function boot() {
  let index;
  try {
    index = await fetchJson("data/index.json");
  } catch {
    document.getElementById("empty").hidden = false;
    return;
  }
  if (!index.conflicts?.length) {
    document.getElementById("empty").hidden = false;
    return;
  }

  const select = document.getElementById("conflict-select");
  select.innerHTML = "";
  for (const c of index.conflicts) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  select.onchange = () => {
    const entry = index.conflicts.find((c) => c.id === select.value);
    loadConflict(entry);
  };
  loadConflict(index.conflicts[0]);
}
