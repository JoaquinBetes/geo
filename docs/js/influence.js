// =============================================================================
// influence.js — pestaña 04: alineamiento diplomático (curado) + soft power
// narrativo (vivo). El mapamundi combina voto en la ONU y sanciones.
// =============================================================================

const ALIGN_META = {
  sanction: { label: "Condena y sanciona", color: "#4db8e8" },
  condemn: { label: "Condena sin sancionar", color: "#3fcf8e" },
  abstain: { label: "Ambiguo (abstención)", color: "#e5a53d" },
  against: { label: "Alineado con Rusia", color: "#ef5d52" },
  nodata: { label: "Sin voto / sin datos", color: "#3a4657" },
};

function renderInfluence(data) {
  const inf = data.influence;
  if (!inf) return;

  document.getElementById("inf-note").textContent =
    `${inf.note} Voto de referencia: ${inf.un_resolution}. Snapshot curado a ${inf.as_of}; ` +
    "el bloque narrativo se recalcula solo en cada corrida.";

  // Clasificador país -> categoría. Prioridad: sanción > voto.
  const a = inf.alignment;
  const sets = {
    sanction: new Set(a.sanctions),
    against: new Set(a.un_no),
    abstain: new Set(a.un_abstain),
    absent: new Set(a.un_absent),
    nodata: new Set(a.no_data),
  };
  const categoryOf = (code) => {
    if (sets.sanction.has(code)) return "sanction";
    if (sets.against.has(code)) return "against";
    if (sets.abstain.has(code)) return "abstain";
    if (sets.absent.has(code) || sets.nodata.has(code)) return "nodata";
    return "condemn"; // el resto de la Asamblea votó a favor de la condena
  };

  renderInfKpis(inf);
  renderWorldMap(inf, categoryOf);
  renderBlocs(inf, categoryOf);
  renderNarrators(inf);
}

function renderInfKpis(inf) {
  const a = inf.alignment;
  const set = (id, v, color) => {
    const el = document.getElementById(id);
    el.textContent = v;
    if (color) el.style.color = color;
  };
  set("inf-kpi-sanctions", a.sanctions.length, ALIGN_META.sanction.color);
  set("inf-kpi-yes", a.un_yes_total ?? "–", ALIGN_META.condemn.color);
  set("inf-kpi-abstain", a.un_abstain.length, ALIGN_META.abstain.color);
  set("inf-kpi-no", a.un_no.length, ALIGN_META.against.color);
}

async function renderWorldMap(inf, categoryOf) {
  document.getElementById("inf-map-hint").textContent =
    `Sanciones + voto en la Asamblea General (${inf.un_resolution}). ` +
    `Snapshot a ${inf.as_of}. Límites: Natural Earth (dominio público).`;

  const geo = await loadGeoFile("geo/world.json");
  const map = newMap("influence:world", "map-world", {
    zoomControl: false,
    attributionControl: false,
    maxBounds: [[-62, -180], [84, 180]],
    maxBoundsViscosity: 0.8,
  });

  L.geoJSON(geo, {
    style: (f) => {
      const meta = ALIGN_META[categoryOf(f.properties.code)];
      return {
        fillColor: meta.color,
        fillOpacity: categoryOf(f.properties.code) === "nodata" ? 0.25 : 0.55,
        color: "#0a0d12",
        weight: 0.7,
      };
    },
    onEachFeature: (f, l) => {
      const meta = ALIGN_META[categoryOf(f.properties.code)];
      l.bindTooltip(`${f.properties.name}: ${meta.label}`, { sticky: true });
    },
  }).addTo(map);

  map.setView([24, 12], 1);

  const legend = document.getElementById("inf-map-legend");
  legend.innerHTML = "";
  for (const meta of Object.values(ALIGN_META)) {
    const span = document.createElement("span");
    span.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
    legend.appendChild(span);
  }
}

async function renderBlocs(inf, categoryOf) {
  // Contamos países del mapa (176 de Natural Earth) por categoría.
  const geo = await loadGeoFile("geo/world.json");
  const counts = { sanction: 0, condemn: 0, abstain: 0, against: 0, nodata: 0 };
  for (const f of geo.features) counts[categoryOf(f.properties.code)]++;

  const keys = Object.keys(ALIGN_META);
  swapChart("infBlocs", "chart-inf-blocs", {
    type: "doughnut",
    data: {
      labels: keys.map((k) => ALIGN_META[k].label),
      datasets: [{
        data: keys.map((k) => counts[k]),
        backgroundColor: keys.map((k) => ALIGN_META[k].color),
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
