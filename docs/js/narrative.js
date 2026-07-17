// =============================================================================
// narrative.js — pestaña 01: sentimiento y entidades en la cobertura mediática.
// =============================================================================

function renderNarrative(data) {
  const d = data.summary;
  renderNarrativeGeo(data, "mentions");
  renderMediaMap(data);
  renderMediaTable(data);

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

  // Sólo países con mapa regional propio (los demás, p. ej. EE.UU. en
  // Irán-Israel, participan del conflicto pero no del par comparativo).
  const mapped = r.countries.filter((c) => c.geo);
  for (const [i, country] of mapped.entries()) {
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

// --- Mapa de medios: sedes en el mundo + intensidad por país -------------------
async function renderMediaMap(data) {
  const card = document.getElementById("nar-media-card");
  const md = data.media;
  if (!md?.outlets?.length) { card.hidden = true; return; }
  card.hidden = false;

  document.getElementById("nar-media-hint").textContent =
    `${md.outlets.length} medios con ficha aportan ${fmtNum(md.matched_articles)} de ` +
    `${fmtNum(md.total_articles)} artículos de este conflicto` +
    (md.others_total ? `; los ${fmtNum(md.others_total)} restantes provienen de fuentes menores sin ficha.` : ".") +
    " Ubicación a nivel ciudad de la sede.";

  const geo = await loadGeoFile("geo/world.json");
  const map = newMap("narrative:media", "map-media", worldMapOpts());

  // Coropleta: intensidad por cantidad de medios con sede en cada país.
  const maxOutlets = Math.max(1, ...Object.values(md.by_country).map((c) => c.outlets));
  const layer = L.geoJSON(geo, {
    style: (f) => {
      const c = md.by_country[f.properties.code];
      return {
        fillColor: c ? ramp(COLORS.amber, Math.sqrt(c.outlets / maxOutlets)) : "rgba(127,146,168,0.05)",
        fillOpacity: 1,
        color: "#0a0d12",
        weight: 0.7,
      };
    },
    onEachFeature: (f, l) => {
      const c = md.by_country[f.properties.code];
      if (c) {
        l.bindTooltip(
          `${f.properties.name}: ${c.outlets} medio${c.outlets > 1 ? "s" : ""} · ${fmtNum(c.articles)} artículos`,
          { sticky: true }
        );
      }
    },
  }).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [4, 4] });

  // Marcadores por medio, con desplazamiento leve cuando comparten ciudad.
  const seen = new Map();
  const maxArt = Math.max(1, ...md.outlets.map((o) => o.articles));
  for (const o of md.outlets) {
    const key = `${o.lat.toFixed(1)},${o.lon.toFixed(1)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const ang = n * 2.4;
    const rad = n ? 0.5 + 0.25 * Math.sqrt(n) : 0;
    const color = sentimentColor(o.tone_avg);

    const marker = L.circleMarker(
      [o.lat + rad * Math.sin(ang), o.lon + rad * Math.cos(ang)],
      {
        radius: 4 + 7 * Math.sqrt(o.articles / maxArt),
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.55,
      }
    );
    marker.bindTooltip(
      `<strong>${o.name}</strong><br>` +
      `<span class="tip-desc">${o.desc}</span><br>` +
      `<span class="tip-meta">${o.country} · ${o.type}` +
      `${o.rsf ? ` · RSF #${o.rsf}` : ""} · ${fmtNum(o.articles)} art. · tono ${o.tone_avg.toFixed(2)}</span><br>` +
      `<span class="tip-cta">Clic para abrir el sitio</span>`,
      { sticky: true, direction: "top", opacity: 1, className: "media-tip" }
    );
    marker.on("click", () => window.open(o.url, "_blank", "noopener"));
    marker.addTo(map);
  }

  document.getElementById("nar-media-legend").innerHTML =
    `<span><span class="swatch" style="background:${ramp(COLORS.amber, 0.2)}"></span>pocos medios</span>` +
    `<span><span class="swatch" style="background:${ramp(COLORS.amber, 1)}"></span>muchos (máx. ${maxOutlets})</span>` +
    `<span><span class="dot" style="background:${COLORS.neg}"></span>cobertura negativa</span>` +
    `<span><span class="dot" style="background:${COLORS.neu}"></span>neutral</span>` +
    `<span><span class="dot" style="background:${COLORS.pos}"></span>positiva</span>`;
}

// --- Radiografía de medios: señales de parcialidad -----------------------------
function renderMediaTable(data) {
  const card = document.getElementById("nar-mediatable-card");
  const md = data.media;
  if (!md?.outlets?.length) { card.hidden = true; return; }
  card.hidden = false;

  document.getElementById("nar-mediatable-hint").textContent =
    `Ordenados por artículos aportados. Tono promedio del conflicto: ${md.overall_tone.toFixed(2)}. ` +
    `RSF: ranking ${md.rsf_as_of}.`;

  // Alineamiento del país sede: se toma de las categorías de la pestaña Influencia.
  const inf = data.influence;
  let catOf = null;
  if (inf?.categories?.length) {
    const listed = inf.categories.filter((c) => !c.rest).map((c) => ({ ...c, set: new Set(c.countries) }));
    const rest = inf.categories.find((c) => c.rest);
    catOf = (iso) => listed.find((c) => c.set.has(iso)) ?? rest ?? null;
  }
  const chipClass = (type) =>
    "chip chip-" + type.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s.*/, "");

  const rows = md.outlets.map((o) => {
    const cat = catOf ? catOf(o.iso3) : null;
    const alignChip = cat
      ? `<span class="chip" style="border-color:${ALIGN_PALETTE[cat.color]};color:${ALIGN_PALETTE[cat.color]}">${cat.label}</span>`
      : "–";
    const d = o.tone_delta;
    const dColor = d < -0.05 ? COLORS.neg : d > 0.05 ? COLORS.pos : COLORS.neu;
    return `<tr>` +
      `<td><a href="${o.url}" target="_blank" rel="noopener">${o.name}</a></td>` +
      `<td>${o.country}</td>` +
      `<td><span class="${chipClass(o.type)}">${o.type}</span></td>` +
      `<td>${alignChip}</td>` +
      `<td>${o.rsf ? "#" + o.rsf : "–"}</td>` +
      `<td>${fmtNum(o.articles)}</td>` +
      `<td style="color:${sentimentColor(o.tone_avg)}">${o.tone_avg.toFixed(2)}</td>` +
      `<td style="color:${dColor}">${d > 0 ? "+" : ""}${d.toFixed(2)}</td>` +
      `</tr>`;
  }).join("");

  document.getElementById("media-table").innerHTML =
    `<thead><tr><th>Medio</th><th>Sede</th><th>Tipo</th><th>Alineamiento sede</th>` +
    `<th>RSF</th><th>Artículos</th><th>Tono</th><th>Desvío</th></tr></thead>` +
    `<tbody>${rows}</tbody>`;
}
