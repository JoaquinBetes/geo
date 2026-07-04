// =============================================================================
// economy.js — pestaña 03: mercados vinculados al conflicto + ayuda externa.
// La variación % de cada serie se calcula contra la última cotización previa
// al inicio del conflicto (baseline "pre-guerra").
// =============================================================================

function renderEconomy(data) {
  const e = data.economy;
  if (!e) return;

  document.getElementById("eco-note").textContent = e.note || "";
  document.getElementById("eco-note-card").hidden = !e.note;

  renderEcoKpis(e);
  renderEcoMap(data.layers);
  renderEcoMarkets(e);
  renderAid(e);
}

// --- Mapa de rutas y chokepoints geoeconómicos ---------------------------------
const ROUTE_KIND_META = {
  grain: { label: "Granos", color: COLORS.pos },
  gas: { label: "Gas", color: COLORS.cyan },
  oil: { label: "Petróleo", color: COLORS.amber },
  strait: { label: "Chokepoint", color: COLORS.neg },
};

function renderEcoMap(layers) {
  const card = document.getElementById("eco-map-card");
  const features = (layers?.features ?? []).filter(
    (f) => f.properties.layer === "route" || f.properties.layer === "chokepoint"
  );
  if (!features.length) { card.hidden = true; return; }
  card.hidden = false;

  const map = newMap("economy:routes", "map-eco");

  // Ruta punteada = cortada / fuera de servicio (el estado vive en el GeoJSON).
  const isDown = (p) => /cortado|fuera de servicio/i.test(p.status ?? "");

  const layer = L.geoJSON({ type: "FeatureCollection", features }, {
    style: (f) => {
      const meta = ROUTE_KIND_META[f.properties.kind] ?? { color: COLORS.neu };
      return {
        color: meta.color,
        weight: 2.5,
        opacity: isDown(f.properties) ? 0.55 : 0.9,
        dashArray: isDown(f.properties) ? "6 7" : null,
      };
    },
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 7,
        color: COLORS.neg,
        weight: 2,
        fillColor: COLORS.neg,
        fillOpacity: 0.5,
      }),
    onEachFeature: (f, l) => {
      const p = f.properties;
      l.bindPopup(
        `<div class="popup-meta">${p.layer === "chokepoint" ? "Chokepoint" : "Ruta"}` +
        `${p.status ? ` · ${p.status}` : ""}</div>` +
        `<strong>${p.name}</strong><br>${p.desc}`
      );
    },
  }).addTo(map);

  map.fitBounds(layer.getBounds().pad(0.08));

  const legend = document.getElementById("eco-map-legend");
  legend.innerHTML = "";
  for (const meta of Object.values(ROUTE_KIND_META)) {
    const span = document.createElement("span");
    span.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
    legend.appendChild(span);
  }
}

// --- KPIs: última cotización + variación vs. pre-guerra ------------------------
function renderEcoKpis(e) {
  const wrap = document.getElementById("eco-kpis");
  wrap.innerHTML = "";
  for (const mk of e.markets) {
    const div = document.createElement("div");
    div.className = "card kpi";

    let sub = "";
    if (mk.change_pct != null) {
      const up = mk.change_pct >= 0;
      // Subas = presión (rojo): commodities más caros o divisa más depreciada.
      sub = `<span class="kpi-sub"><span class="${up ? "up" : "down"}">` +
            `${up ? "▲" : "▼"} ${Math.abs(mk.change_pct)}%</span> vs. pre-guerra</span>`;
    }
    div.innerHTML =
      `<span class="kpi-label">${mk.name}</span>` +
      `<span class="kpi-value small-lg">${fmtNum(mk.latest)}</span>` +
      sub;
    wrap.appendChild(div);
  }
}

// --- Un gráfico de línea por serie, con baseline pre-guerra punteada -----------
function renderEcoMarkets(e) {
  const grid = document.getElementById("eco-markets");
  grid.innerHTML = "";

  for (const mk of e.markets) {
    const card = document.createElement("section");
    card.className = "card";
    const canvasId = `chart-eco-${mk.id}`;
    card.innerHTML =
      `<h2>${mk.name}</h2>` +
      `<p class="hint">${mk.unit}${mk.baseline != null ? ` · línea punteada = nivel pre-guerra (${mk.baseline_date})` : ""}</p>` +
      `<div class="chart-box"><canvas id="${canvasId}"></canvas></div>`;
    grid.appendChild(card);

    const labels = mk.points.map((p) => p[0]);
    const datasets = [
      {
        label: mk.name,
        data: mk.points.map((p) => p[1]),
        borderColor: mk.group === "fx" ? COLORS.cyan : COLORS.amber,
        backgroundColor: mk.group === "fx" ? COLORS.cyan : COLORS.amber,
        pointRadius: 0,
        borderWidth: 1.8,
        tension: 0.15,
      },
    ];
    if (mk.baseline != null) {
      datasets.push({
        label: "Pre-guerra",
        data: labels.map(() => mk.baseline),
        borderColor: COLORS.muted,
        borderDash: [6, 5],
        borderWidth: 1,
        pointRadius: 0,
      });
    }

    swapChart(`eco-${mk.id}`, canvasId, {
      type: "line",
      data: { labels, datasets },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { title: { display: true, text: mk.unit } },
        },
      },
    });
  }
}

// --- Ayuda internacional: barras apiladas por donante --------------------------
function renderAid(e) {
  const card = document.getElementById("eco-aid-card");
  const aid = e.aid;
  if (!aid?.donors?.length) { card.hidden = true; return; }
  card.hidden = false;

  document.getElementById("eco-aid-caveat").textContent =
    `${aid.source} · datos a ${aid.as_of} · en ${aid.unit}. ` +
    "El desglose militar/financiero/humanitario muestra la naturaleza del apoyo de cada donante.";

  const donors = [...aid.donors].sort(
    (a, b) => (b.military + b.financial + b.humanitarian) - (a.military + a.financial + a.humanitarian)
  );

  swapChart("ecoAid", "chart-eco-aid", {
    type: "bar",
    data: {
      labels: donors.map((d) => d.donor),
      datasets: [
        { label: "Militar", data: donors.map((d) => d.military), backgroundColor: COLORS.neg + "cc" },
        { label: "Financiera", data: donors.map((d) => d.financial), backgroundColor: COLORS.amber + "cc" },
        { label: "Humanitaria", data: donors.map((d) => d.humanitarian), backgroundColor: COLORS.pos + "cc" },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true, title: { display: true, text: aid.unit } },
        y: { stacked: true },
      },
    },
  });
}
