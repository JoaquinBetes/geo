// =============================================================================
// narrative.js — pestaña 01: sentimiento y entidades en la cobertura mediática.
// =============================================================================

function renderNarrative(data) {
  const d = data.summary;
  renderNarrativeGeo(data, "mentions");

  // --- KPIs ---
  document.getElementById("kpi-total").textContent = fmtNum(d.total_articles);
  const s = document.getElementById("kpi-sentiment");
  s.textContent = d.overall_avg.toFixed(2);
  s.style.color = sentimentColor(d.overall_avg);
  document.getElementById("kpi-sources").textContent = d.sources.length;
  const negPct = d.total_articles
    ? Math.round((d.distribution.neg / d.total_articles) * 100)
    : 0;
  const np = document.getElementById("kpi-negpct");
  np.textContent = `${negPct}%`;
  np.style.color = COLORS.neg;

  // --- Serie temporal ---
  swapChart("timeline", "chart-timeline", {
    data: {
      labels: d.daily.map((x) => x.date),
      datasets: [
        {
          type: "bar",
          label: "Artículos",
          data: d.daily.map((x) => x.count),
          backgroundColor: "rgba(77, 184, 232, 0.22)",
          yAxisID: "y2",
          order: 2,
        },
        {
          type: "line",
          label: "Tono promedio",
          data: d.daily.map((x) => x.avg),
          borderColor: COLORS.amber,
          backgroundColor: COLORS.amber,
          tension: 0.25,
          pointRadius: 2,
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
          title: { display: true, text: "Nº artículos" },
        },
      },
    },
  });

  // --- Distribución ---
  swapChart("dist", "chart-dist", {
    type: "doughnut",
    data: {
      labels: ["Positivo", "Neutral", "Negativo"],
      datasets: [{
        data: [d.distribution.pos, d.distribution.neu, d.distribution.neg],
        backgroundColor: [COLORS.pos, COLORS.neu, COLORS.neg],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      cutout: "62%",
    },
  });

  // --- Medios ---
  const top = d.by_source.slice(0, 12);
  swapChart("sources", "chart-sources", {
    type: "bar",
    data: {
      labels: top.map((x) => x.source),
      datasets: [{
        label: "Artículos",
        data: top.map((x) => x.count),
        backgroundColor: top.map((x) => sentimentColor(x.avg)),
      }],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });

  // --- Entidades ---
  const ents = d.top_entities;
  swapChart("entities", "chart-entities", {
    type: "bar",
    data: {
      labels: ents.map((x) => x.name),
      datasets: [{
        label: "Menciones",
        data: ents.map((x) => x.count),
        backgroundColor: ents.map((x) => sentimentColor(x.avg)),
      }],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => `Tono promedio: ${ents[ctx.dataIndex].avg.toFixed(2)}`,
          },
        },
      },
    },
  });

  // --- Titulares recientes ---
  const ul = document.getElementById("recent-list");
  ul.innerHTML = "";
  for (const a of d.recent) {
    const li = document.createElement("li");

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = sentimentColor(a.compound);

    const main = document.createElement("div");
    const link = document.createElement("a");
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = a.title;
    const src = document.createElement("span");
    src.className = "src";
    src.textContent = " · " + a.source;
    main.append(link, src);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = fmtDate(a.published);

    li.append(dot, main, meta);
    ul.appendChild(li);
  }
}

// --- Geografía del relato: coropletas comparativas (atención / tono) ----------
async function renderNarrativeGeo(data, metric) {
  const card = document.getElementById("nar-geo-card");
  const r = data.regions;
  if (!r?.countries?.length) { card.hidden = true; return; }
  card.hidden = false;

  // Estado del toggle Atención/Tono.
  document.querySelectorAll("#nar-metric button").forEach((b) => {
    b.classList.toggle("active", b.dataset.metric === metric);
    b.onclick = () => renderNarrativeGeo(data, b.dataset.metric);
  });

  const byCountry = {};
  for (const reg of r.regions) {
    (byCountry[reg.country] ??= new Map()).set(reg.region, reg);
  }
  const maxMentions = Math.max(1, ...r.regions.map((x) => x.mentions));

  for (const [i, country] of r.countries.entries()) {
    document.getElementById(`nar-geo-title-${i}`).textContent = country.name;
    const values = byCountry[country.code] ?? new Map();
    const geo = await loadGeoFile(country.geo);

    choropleth({
      key: `narrative:geo${i}`,
      elId: `map-nar-${i}`,
      geo,
      hasData: (name) => values.has(name),
      styleOf: (name) => {
        const v = values.get(name);
        let fill = "rgba(127,146,168,0.05)";
        if (v?.mentions) {
          fill = metric === "mentions"
            ? ramp(COLORS.amber, Math.sqrt(v.mentions / maxMentions))
            : ramp(v.tone_avg < 0 ? COLORS.neg : COLORS.pos, Math.abs(v.tone_avg));
        }
        return { fillColor: fill, fillOpacity: 1, color: "#223041", weight: 1 };
      },
      tooltipOf: (name) => {
        const v = values.get(name);
        if (!v?.mentions) return `${regionLabel(name)}: sin menciones`;
        return `${regionLabel(name)}: ${v.mentions} menciones · tono ${v.tone_avg.toFixed(2)}`;
      },
    });
  }

  const legend = document.getElementById("nar-geo-legend");
  legend.innerHTML = metric === "mentions"
    ? `<span><span class="swatch" style="background:${ramp(COLORS.amber, 0.15)}"></span>pocas menciones</span>` +
      `<span><span class="swatch" style="background:${ramp(COLORS.amber, 1)}"></span>muchas (máx. ${maxMentions})</span>`
    : `<span><span class="swatch" style="background:${ramp(COLORS.neg, 0.9)}"></span>tono negativo</span>` +
      `<span><span class="swatch" style="background:${ramp(COLORS.pos, 0.9)}"></span>tono positivo</span>`;
}
