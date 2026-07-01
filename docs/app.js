// Dashboard estático: sólo lee JSON generado por el pipeline y dibuja con Chart.js.
// No hay backend: todo corre en el navegador sobre archivos servidos por Pages.

const COLORS = { pos: "#22c55e", neu: "#9ca3af", neg: "#ef4444", accent: "#4f9dff" };
Chart.defaults.color = "#8b97ab";
Chart.defaults.borderColor = "#2b3547";
Chart.defaults.font.family = "system-ui, sans-serif";

let charts = {}; // guardamos las instancias para destruirlas al cambiar de conflicto

// Color continuo según el tono (-1 rojo … 0 gris … +1 verde).
function sentimentColor(v) {
  if (v <= -0.05) return COLORS.neg;
  if (v >= 0.05) return COLORS.pos;
  return COLORS.neu;
}

function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function main() {
  let index;
  try {
    index = await fetch("data/index.json").then((r) => r.json());
  } catch (e) {
    return showEmpty();
  }
  if (!index.conflicts || index.conflicts.length === 0) return showEmpty();

  const select = document.getElementById("conflict-select");
  select.innerHTML = "";
  for (const c of index.conflicts) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => loadConflict(select.value));
  loadConflict(index.conflicts[0].id);
}

function showEmpty() {
  document.getElementById("dashboard").hidden = true;
  document.getElementById("empty").hidden = false;
}

async function loadConflict(id) {
  const data = await fetch(`data/${id}/summary.json`).then((r) => r.json());
  document.getElementById("empty").hidden = true;
  document.getElementById("dashboard").hidden = false;

  renderKpis(data);
  renderTimeline(data);
  renderDistribution(data);
  renderSources(data);
  renderEntities(data);
  renderRecent(data);
}

function renderKpis(d) {
  document.getElementById("kpi-total").textContent = d.total_articles;
  const s = document.getElementById("kpi-sentiment");
  s.textContent = d.overall_avg.toFixed(2);
  s.style.color = sentimentColor(d.overall_avg);
  document.getElementById("kpi-sources").textContent = d.sources.length;
  document.getElementById("kpi-updated").textContent = fmtDate(d.updated);
}

function swap(key, ctxId, config) {
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart(document.getElementById(ctxId), config);
}

function renderTimeline(d) {
  const labels = d.daily.map((x) => x.date);
  swap("timeline", "chart-timeline", {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Artículos",
          data: d.daily.map((x) => x.count),
          backgroundColor: "rgba(79,157,255,0.25)",
          yAxisID: "y2",
          order: 2,
        },
        {
          type: "line",
          label: "Tono promedio",
          data: d.daily.map((x) => x.avg),
          borderColor: COLORS.accent,
          backgroundColor: COLORS.accent,
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
        y2: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "Nº artículos" } },
      },
    },
  });
}

function renderDistribution(d) {
  swap("dist", "chart-dist", {
    type: "doughnut",
    data: {
      labels: ["Positivo", "Neutral", "Negativo"],
      datasets: [
        {
          data: [d.distribution.pos, d.distribution.neu, d.distribution.neg],
          backgroundColor: [COLORS.pos, COLORS.neu, COLORS.neg],
          borderWidth: 0,
        },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
  });
}

function renderSources(d) {
  const top = d.by_source.slice(0, 12);
  swap("sources", "chart-sources", {
    type: "bar",
    data: {
      labels: top.map((x) => x.source),
      datasets: [
        {
          label: "Artículos",
          data: top.map((x) => x.count),
          backgroundColor: top.map((x) => sentimentColor(x.avg)),
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function renderEntities(d) {
  const ents = d.top_entities;
  swap("entities", "chart-entities", {
    type: "bar",
    data: {
      labels: ents.map((x) => x.name),
      datasets: [
        {
          label: "Menciones",
          data: ents.map((x) => x.count),
          backgroundColor: ents.map((x) => sentimentColor(x.avg)),
        },
      ],
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
}

function renderRecent(d) {
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
    main.appendChild(link);
    main.appendChild(src);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = fmtDate(a.published);

    li.append(dot, main, meta);
    ul.appendChild(li);
  }
}

main();
