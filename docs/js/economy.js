// =============================================================================
// economy.js — pestaña 03: mercados vinculados al conflicto + ayuda externa.
// La variación % de cada serie se calcula contra la última cotización previa
// al inicio del conflicto (baseline "pre-guerra").
// =============================================================================

function renderEconomy(e) {
  if (!e) return;

  document.getElementById("eco-note").textContent = e.note || "";
  document.getElementById("eco-note-card").hidden = !e.note;

  renderEcoKpis(e);
  renderEcoMarkets(e);
  renderAid(e);
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
