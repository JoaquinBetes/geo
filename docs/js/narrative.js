// =============================================================================
// narrative.js — pestaña 01: sentimiento y entidades en la cobertura mediática.
// =============================================================================

function renderNarrative(d) {
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
