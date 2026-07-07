// =============================================================================
// landing.js — portada: mapamundi táctico SVG con los conflictos activos.
//
// Sin Leaflet ni tiles: el mundo se dibuja como SVG propio (proyección
// Mercator sobre docs/geo/world.json), lo que permite animarlo por CSS:
// barrido de radar al cargar, países revelándose en cascada, pings pulsantes
// sobre cada teatro y highlight sincronizado mapa <-> tarjetas.
//
// Escalable por diseño: todo sale de index.json — un conflicto nuevo aparece
// acá solo, con su color asignado por orden.
// =============================================================================

const CONFLICT_COLORS = ["#ef5d52", "#e5a53d", "#4db8e8", "#3fcf8e", "#b07ce8", "#f0e055"];

// --- Proyección Mercator (recortada a las latitudes útiles) -------------------
const MAP_W = 1000, MAP_H = 520, LAT_TOP = 76, LAT_BOT = -56;
const _mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const _Y_TOP = _mercY(LAT_TOP), _Y_BOT = _mercY(LAT_BOT);

function project(lon, lat) {
  const clamped = Math.max(LAT_BOT, Math.min(LAT_TOP, lat));
  return [
    ((lon + 180) / 360) * MAP_W,
    ((_Y_TOP - _mercY(clamped)) / (_Y_TOP - _Y_BOT)) * MAP_H,
  ];
}

function ringPath(ring) {
  return "M" + ring.map(([lon, lat]) => {
    const [x, y] = project(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("L") + "Z";
}

function featurePath(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.map((rings) => rings.map(ringPath).join("")).join("");
}

// bbox [minLon, minLat, maxLon, maxLat] del anillo exterior más grande
function featureBbox(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = null, bestArea = -1;
  for (const rings of polys) {
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
    for (const [lon, lat] of rings[0]) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    const area = (maxLon - minLon) * (maxLat - minLat);
    if (area > bestArea) { bestArea = area; best = [minLon, minLat, maxLon, maxLat]; }
  }
  return { bbox: best, area: bestArea };
}

// --- Construcción de la portada ------------------------------------------------
async function renderLanding(index) {
  const conflicts = index.conflicts ?? [];
  const geo = await loadGeoFile("geo/world.json");

  // iso3 -> {conflict, color}
  const byIso = new Map();
  conflicts.forEach((c, i) => {
    const color = CONFLICT_COLORS[i % CONFLICT_COLORS.length];
    c._color = color;
    for (const country of c.countries ?? []) {
      if (country.iso3) byIso.set(country.iso3, { conflict: c, color });
    }
  });

  // --- Países como paths SVG ---
  const paths = [];
  const focus = new Map(); // conflicto -> {x, y} (centro del país MÁS CHICO = el teatro)
  for (const f of geo.features) {
    const code = f.properties.code;
    const d = featurePath(f.geometry);
    const war = byIso.get(code);
    const { bbox, area } = featureBbox(f.geometry);
    const [cx, cy] = project((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
    // el barrido revela de izquierda a derecha: delay proporcional a x
    const delay = ((cx / MAP_W) * 1.6).toFixed(2);

    if (war) {
      const cid = war.conflict.id;
      if (!focus.has(cid) || area < focus.get(cid).area) {
        focus.set(cid, { x: cx, y: cy, area, color: war.color });
      }
      paths.push(
        `<path class="country war" d="${d}" data-conflict="${cid}" ` +
        `style="animation-delay:${delay}s; fill:${war.color}; color:${war.color}">` +
        `<title>${f.properties.name}</title></path>`
      );
    } else {
      paths.push(`<path class="country" d="${d}" style="animation-delay:${delay}s"></path>`);
    }
  }

  // --- Pings de radar sobre cada teatro ---
  const pings = [...focus.entries()].map(([cid, p]) =>
    `<g class="ping-group" data-conflict="${cid}" style="color:${p.color}">` +
    `<circle class="ping" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"/>` +
    `<circle class="ping d2" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"/>` +
    `<circle class="core-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2"/>` +
    `</g>`
  ).join("");

  document.getElementById("world-svg").innerHTML =
    `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" role="img" ` +
    `aria-label="Mapa mundial con los conflictos monitoreados">` +
    `<g>${paths.join("")}</g>${pings}</svg>` +
    `<div class="sweep" aria-hidden="true"></div>`;

  renderLandingMeta(index);
  renderLandingCards(conflicts);
  wireLandingEvents(conflicts);
}

function renderLandingMeta(index) {
  document.getElementById("landing-meta").innerHTML =
    `<span class="meta-chip">${index.conflicts.length} conflictos monitoreados</span>` +
    `<span class="meta-chip">actualizado ${fmtDate(index.updated)}</span>` +
    `<span class="meta-chip">actualización automática cada 6 h</span>`;
}

function sparkSvg(data, color) {
  if (!data?.length) return "";
  const max = Math.max(1, ...data);
  const bars = data.map((v, i) => {
    const h = Math.max(1.5, (v / max) * 22);
    return `<rect x="${i * 7}" y="${(24 - h).toFixed(1)}" width="5" height="${h.toFixed(1)}" rx="1"/>`;
  }).join("");
  return `<svg class="spark" viewBox="0 0 ${data.length * 7 - 2} 24" fill="${color}" ` +
    `preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

function renderLandingCards(conflicts) {
  const wrap = document.getElementById("landing-cards");
  wrap.innerHTML = "";
  conflicts.forEach((c, i) => {
    const card = document.createElement("article");
    card.className = "c-card";
    card.dataset.conflict = c.id;
    card.style.setProperty("--c", c._color);
    card.style.animationDelay = `${1.2 + i * 0.18}s`;

    const tone = c.tone ?? 0;
    const countries = (c.countries ?? []).map((x) => x.name).join(" · ");
    card.innerHTML =
      `<div class="c-head"><span class="c-num">${String(i + 1).padStart(2, "0")}</span>` +
      `<h3 class="c-name">${c.name}</h3></div>` +
      `<p class="c-countries">${countries}</p>` +
      `<div class="c-stats">` +
      `<span>${fmtNum(c.total_articles)} artículos</span>` +
      `<span style="color:${sentimentColor(tone)}">tono ${tone.toFixed(2)}</span>` +
      (c.events_7d != null ? `<span>${fmtNum(c.events_7d)} eventos/7d</span>` : "") +
      `</div>` +
      sparkSvg(c.spark, c._color) +
      `<span class="c-open">Abrir monitor <span class="arrow">▸</span></span>`;
    wrap.appendChild(card);
  });
}

// --- Interacción: hover sincronizado mapa <-> tarjetas, tooltip y navegación ---
function wireLandingEvents(conflicts) {
  const landing = document.getElementById("landing");
  const tip = document.getElementById("map-tip");
  const byId = new Map(conflicts.map((c) => [c.id, c]));

  const setHot = (cid, on) => {
    landing.querySelectorAll(`[data-conflict="${cid}"]`).forEach((el) =>
      el.classList.toggle("hot", on)
    );
  };

  landing.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-conflict]");
    if (!el) return;
    setHot(el.dataset.conflict, true);
    const c = byId.get(el.dataset.conflict);
    if (c && el.closest("#world-svg")) {
      tip.style.borderColor = c._color;
      tip.innerHTML =
        `<strong>${c.name}</strong>` +
        `<span>${fmtNum(c.total_articles)} artículos · tono ${(c.tone ?? 0).toFixed(2)}</span>` +
        `<span class="tip-cta">Click para abrir el monitor</span>`;
      tip.hidden = false;
    }
  });
  landing.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-conflict]");
    if (!el) return;
    setHot(el.dataset.conflict, false);
    tip.hidden = true;
  });
  landing.addEventListener("mousemove", (e) => {
    if (tip.hidden) return;
    const box = landing.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - box.left + 14, box.width - 210)}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
  });
  landing.addEventListener("click", (e) => {
    const el = e.target.closest("[data-conflict]");
    if (el) openConflict(el.dataset.conflict, "narrative");
  });
}
