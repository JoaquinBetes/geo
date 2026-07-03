// =============================================================================
// military.js — pestaña 02: mapa de eventos, actividad diaria, cruce con la
// narrativa y pérdidas. Recibe {summary, military} porque el gráfico de cruce
// combina las dos capas.
// =============================================================================

function renderMilitary({ summary, military: m }) {
  if (!m) return;

  renderMilKpis(m);
  renderMap(m);
  renderMilDaily(m);
  renderMilCorrelation(summary, m);
  renderLosses(m);
}

// --- KPIs --------------------------------------------------------------------
function renderMilKpis(m) {
  const k = m.kpis;
  document.getElementById("mil-kpi-events").textContent = fmtNum(k.events_7d);
  const delta = k.events_7d - k.events_prev_7d;
  const cls = delta >= 0 ? "up" : "down";
  const sign = delta >= 0 ? "+" : "";
  document.getElementById("mil-kpi-events-sub").innerHTML =
    `<span class="${cls}">${sign}${fmtNum(delta)}</span> vs. 7 días previos`;

  document.getElementById("mil-kpi-hot").textContent = k.hottest_place ?? "–";

  const losses = m.losses;
  if (losses) {
    document.getElementById("mil-kpi-personnel").textContent = fmtNum(losses.personnel.total);
    document.getElementById("mil-kpi-personnel-sub").innerHTML =
      `<span class="up">+${fmtNum(losses.personnel.delta_7d)}</span> últimos 7 días`;

    const tanks = losses.equipment.categories.find((c) => c.key === "tank");
    if (tanks) {
      document.getElementById("mil-kpi-tanks").textContent = fmtNum(tanks.total);
      document.getElementById("mil-kpi-tanks-sub").innerHTML =
        `<span class="up">+${fmtNum(tanks.delta_30d)}</span> últimos 30 días`;
    }
  }
}

// --- Mapa Leaflet -------------------------------------------------------------
function renderMap(m) {
  document.getElementById("mil-map-caveat").textContent = m.caveats.events;

  const map = L.map("map", { scrollWheelZoom: false }).setView([48.6, 33.0], 6);
  state.map = map;

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 12,
  }).addTo(map);

  // Capa de marcadores: un círculo por evento, color según tipo.
  const markers = L.layerGroup();
  for (const ev of m.events) {
    const meta = EVENT_META[ev.type] ?? { label: ev.type, color: COLORS.neu };
    const marker = L.circleMarker([ev.lat, ev.lon], {
      radius: 6,
      color: meta.color,
      weight: 1.5,
      fillColor: meta.color,
      fillOpacity: 0.45,
    });
    marker.bindPopup(
      `<div class="popup-meta">${ev.date} · ${meta.label} · ${ev.place}</div>` +
      `<a href="${ev.url}" target="_blank" rel="noopener">${ev.title}</a>` +
      `<div class="popup-meta">${ev.source}</div>`
    );
    markers.addLayer(marker);
  }
  markers.addTo(map);

  // Capa de calor (toggle): densidad de eventos.
  const heat = L.heatLayer(
    m.events.map((ev) => [ev.lat, ev.lon, 0.7]),
    { radius: 32, blur: 22, maxZoom: 9 }
  );
  document.getElementById("heat-toggle").onchange = (e) => {
    if (e.target.checked) { map.removeLayer(markers); heat.addTo(map); }
    else { map.removeLayer(heat); markers.addTo(map); }
  };

  // Leyenda
  const legend = document.getElementById("map-legend");
  legend.innerHTML = "";
  for (const [type, meta] of Object.entries(EVENT_META)) {
    const n = m.events.filter((e) => e.type === type).length;
    const span = document.createElement("span");
    span.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label} (${n})`;
    legend.appendChild(span);
  }
}

// --- Actividad diaria por tipo + anomalías ------------------------------------
function renderMilDaily(m) {
  const labels = m.daily.map((d) => d.date);
  const typeDatasets = Object.entries(EVENT_META).map(([type, meta]) => ({
    type: "bar",
    label: meta.label,
    data: m.daily.map((d) => d[type]),
    backgroundColor: meta.color + "b0",
    stack: "events",
  }));

  // Triángulos rojos sobre los días anómalos.
  const anomalies = m.daily
    .filter((d) => d.anomaly)
    .map((d) => ({ x: d.date, y: d.total + 1 }));

  swapChart("milDaily", "chart-mil-daily", {
    data: {
      labels,
      datasets: [
        ...typeDatasets,
        {
          type: "scatter",
          label: "Pico anómalo",
          data: anomalies,
          pointStyle: "triangle",
          radius: 7,
          backgroundColor: COLORS.neg,
          borderColor: COLORS.neg,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: "Eventos/día" } },
      },
    },
  });
}

// --- Cruce narrativa vs. militar -----------------------------------------------
function renderMilCorrelation(summary, m) {
  // Unión de fechas de ambas series, ordenada.
  const sentByDate = new Map(summary.daily.map((d) => [d.date, d.avg]));
  const evByDate = new Map(m.daily.map((d) => [d.date, d.total]));
  const labels = [...new Set([...sentByDate.keys(), ...evByDate.keys()])].sort();

  swapChart("milCorr", "chart-mil-corr", {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Eventos militares",
          data: labels.map((d) => evByDate.get(d) ?? 0),
          backgroundColor: "rgba(239, 93, 82, 0.4)",
          yAxisID: "y2",
          order: 2,
        },
        {
          type: "line",
          label: "Tono de los medios",
          data: labels.map((d) => sentByDate.get(d) ?? null),
          borderColor: COLORS.cyan,
          backgroundColor: COLORS.cyan,
          tension: 0.25,
          pointRadius: 2,
          spanGaps: true,
          yAxisID: "y",
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { min: -1, max: 1, title: { display: true, text: "Tono" } },
        y2: {
          position: "right", beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Eventos" },
        },
      },
    },
  });
}

// --- Pérdidas -----------------------------------------------------------------
function renderLosses(m) {
  const losses = m.losses;
  const caveatEl = document.getElementById("mil-losses-caveat");
  if (!losses) {
    caveatEl.textContent = "Sin datos de pérdidas disponibles para este conflicto.";
    return;
  }
  caveatEl.textContent = `${m.caveats.losses} Datos al ${losses.as_of}.`;

  // Tablero de contadores de equipamiento.
  const grid = document.getElementById("equip-counters");
  grid.innerHTML = "";
  for (const c of losses.equipment.categories) {
    const div = document.createElement("div");
    div.className = "counter";
    div.innerHTML =
      `<span class="c-name">${c.name}</span>` +
      `<span class="c-value">${fmtNum(c.total)}</span>` +
      `<span class="c-delta">+${fmtNum(c.delta_30d)} en 30 d</span>`;
    grid.appendChild(div);
  }

  // Evolución acumulada de las categorías "de terreno" (escala comparable;
  // los drones van aparte porque su volumen aplastaría al resto).
  const es = losses.equipment.series;
  const lineFor = (key, label, color) => ({
    label,
    data: es.map((e) => e[key]),
    borderColor: color,
    backgroundColor: color,
    pointRadius: 0,
    borderWidth: 1.8,
    tension: 0.15,
  });
  swapChart("milEquip", "chart-mil-equip", {
    type: "line",
    data: {
      labels: es.map((e) => e.date),
      datasets: [
        lineFor("field artillery", "Artillería", COLORS.amber),
        lineFor("APC", "Blindados (APC)", COLORS.cyan),
        lineFor("tank", "Tanques", COLORS.neg),
        lineFor("helicopter", "Helicópteros", COLORS.pos),
        lineFor("aircraft", "Aviones", COLORS.neu),
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: true } },
    },
  });

  // Personal: acumulado (línea) + ritmo semanal (barras, eje derecho).
  const ps = losses.personnel.series;
  const weekly = ps.map((p, i) => (i === 0 ? null : p.total - ps[i - 1].total));
  swapChart("milPersonnel", "chart-mil-personnel", {
    data: {
      labels: ps.map((p) => p.date),
      datasets: [
        {
          type: "bar",
          label: "Bajas por semana",
          data: weekly,
          backgroundColor: "rgba(239, 93, 82, 0.35)",
          yAxisID: "y2",
          order: 2,
        },
        {
          type: "line",
          label: "Acumulado",
          data: ps.map((p) => p.total),
          borderColor: COLORS.neg,
          backgroundColor: COLORS.neg,
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "y",
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Acumulado" } },
        y2: {
          position: "right", beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Por semana" },
        },
      },
    },
  });
}
