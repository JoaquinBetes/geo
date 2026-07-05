// =============================================================================
// influence.js — pestaña 04: alineamiento diplomático (curado, categorías
// genéricas por conflicto) + soft power narrativo (vivo).
// =============================================================================

// Paleta semántica: el TOML de cada conflicto elige el color de cada categoría.
const ALIGN_PALETTE = {
  cyan: "#4db8e8",
  green: "#3fcf8e",
  amber: "#e5a53d",
  red: "#ef5d52",
  gray: "#3a4657",
};

function renderInfluence(data) {
  const inf = data.influence;
  if (!inf?.categories?.length) return;

  document.getElementById("inf-note").textContent =
    `${inf.note} Referencia: ${inf.reference}. Snapshot curado a ${inf.as_of}; ` +
    "el bloque narrativo se recalcula solo en cada corrida.";

  // Clasificador país -> categoría: primera lista que lo contenga gana;
  // los no listados caen en la categoría marcada rest = true.
  const listed = inf.categories
    .filter((c) => !c.rest)
    .map((c) => ({ ...c, set: new Set(c.countries) }));
  const restCat = inf.categories.find((c) => c.rest);
  const categoryOf = (code) =>
    listed.find((c) => c.set.has(code)) ?? restCat ?? inf.categories[0];

  renderInfKpis(inf);
  renderWorldMap(inf, categoryOf);
  renderBlocs(inf, categoryOf);
  renderNarrators(inf);
}

function renderInfKpis(inf) {
  const wrap = document.getElementById("inf-kpis");
  wrap.innerHTML = "";
  for (const [i, kpi] of inf.kpis.entries()) {
    const div = document.createElement("div");
    div.className = "card kpi";
    const color = ALIGN_PALETTE[inf.categories[i]?.color] ?? "";
    div.innerHTML =
      `<span class="kpi-label">${kpi.label}</span>` +
      `<span class="kpi-value" style="color:${color}">${kpi.value}</span>`;
    wrap.appendChild(div);
  }
}

async function renderWorldMap(inf, categoryOf) {
  document.getElementById("inf-map-hint").textContent =
    `${inf.reference}. Snapshot a ${inf.as_of}. Límites: Natural Earth (dominio público).`;

  const geo = await loadGeoFile("geo/world.json");
  const map = newMap("influence:world", "map-world", {
    zoomControl: false,
    attributionControl: false,
    maxBounds: [[-62, -180], [84, 180]],
    maxBoundsViscosity: 0.8,
  });

  const layer = L.geoJSON(geo, {
    style: (f) => {
      const cat = categoryOf(f.properties.code);
      return {
        fillColor: ALIGN_PALETTE[cat.color],
        fillOpacity: cat.nodata ? 0.25 : 0.55,
        color: "#0a0d12",
        weight: 0.7,
      };
    },
    onEachFeature: (f, l) => {
      const cat = categoryOf(f.properties.code);
      l.bindTooltip(`${f.properties.name}: ${cat.label}`, { sticky: true });
    },
  }).addTo(map);

  // fitBounds (y no un zoom fijo): el mapamundi se adapta al ancho del
  // contenedor, clave en móviles.
  map.fitBounds(layer.getBounds(), { padding: [4, 4] });

  const legend = document.getElementById("inf-map-legend");
  legend.innerHTML = "";
  for (const cat of inf.categories) {
    const span = document.createElement("span");
    span.innerHTML =
      `<span class="dot" style="background:${ALIGN_PALETTE[cat.color]}"></span>${cat.label}`;
    legend.appendChild(span);
  }
}

async function renderBlocs(inf, categoryOf) {
  // Contamos los países del mapamundi (Natural Earth) por categoría.
  const geo = await loadGeoFile("geo/world.json");
  const counts = new Map(inf.categories.map((c) => [c.id, 0]));
  for (const f of geo.features) {
    const cat = categoryOf(f.properties.code);
    counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
  }

  swapChart("infBlocs", "chart-inf-blocs", {
    type: "doughnut",
    data: {
      labels: inf.categories.map((c) => c.label),
      datasets: [{
        data: inf.categories.map((c) => counts.get(c.id) ?? 0),
        backgroundColor: inf.categories.map((c) => ALIGN_PALETTE[c.color]),
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      cutout: "62%",
    },
  });
}

function renderNarrators(inf) {
  const n = inf.narrators;
  swapChart("infNarrators", "chart-inf-narrators", {
    type: "bar",
    data: {
      labels: n.map((x) => x.country),
      datasets: [{
        label: "Artículos",
        data: n.map((x) => x.articles),
        backgroundColor: n.map((x) => sentimentColor(x.tone_avg)),
      }],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => `Tono promedio: ${n[ctx.dataIndex].tone_avg.toFixed(2)}`,
          },
        },
      },
    },
  });
}
