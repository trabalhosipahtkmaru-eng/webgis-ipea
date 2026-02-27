/* ===============================
   WebGIS IPEA — map.js
   Estrutura:
   /css/style.css
   /data/*.json
   /js/map.js
================================= */

// ===============================
// MAPA BASE
// ===============================
const map = L.map("map", {
  center: [-15, -55],
  zoom: 4,
  minZoom: 3,
  maxZoom: 18,
});

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const esri = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri" }
);

L.control.scale().addTo(map);

// ===============================
// DADOS LOCAIS (GEOJSON) - GitHub Pages
// ===============================
const DATA = {
  municipios: "data/municipios.json",
  estratos: "data/estratos.json",
  favelas: "data/favelas.json",
  mcmv: "data/mcmv.json",
};

// ===============================
// CAMPOS (os seus)
// ===============================
const SAMPLE_FIELDS = {
  municipios: ["cd_mun", "nm_mun", "sigla_uf", "hierarquia"],
  estratos: ["codigo_es", "nome_es", "sigla_uf"],
  favelas: ["cd_fcu", "nm_fcu", "sigla_uf", "regiao"],
  mcmv: ["txt_nome_m", "txt_modali", "sigla_uf", "regiao"],
};

const SAMPLE_LABELS = {
  municipios: { cd_mun: "Código", nm_mun: "Município", sigla_uf: "UF", hierarquia: "REGIC" },
  estratos: { codigo_es: "Código do Estrato", nome_es: "Estrato", sigla_uf: "UF" },
  favelas: { cd_fcu: "Código", nm_fcu: "Favela/Comunidade", sigla_uf: "UF", regiao: "Região" },
  mcmv: { txt_nome_m: "Município", txt_modali: "Modalidade", sigla_uf: "UF", regiao: "Região" },
};

// ===============================
// FILTROS
// ===============================
const REGIOES_UF = {
  Norte: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  Nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MS", "MT"],
  Sudeste: ["ES", "MG", "RJ", "SP"],
  Sul: ["PR", "RS", "SC"],
};

const regSelect = document.getElementById("regSelect");
const ufSelect = document.getElementById("ufSelect");
const regicSelect = document.getElementById("regicSelect");
const btnClear = document.getElementById("btnClear");

function norm(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function updateUfOptionsByRegion() {
  if (!ufSelect || !regSelect) return;

  const reg = regSelect.value;
  const allowed = reg ? new Set(REGIOES_UF[reg] || []) : null;
  const currentUf = ufSelect.value;

  Array.from(ufSelect.options).forEach((opt) => {
    if (!opt.value) {
      opt.disabled = false;
      opt.hidden = false;
      return;
    }
    const ok = allowed ? allowed.has(opt.value) : true;
    opt.disabled = !ok;
    opt.hidden = !ok;
  });

  if (allowed && currentUf && !allowed.has(currentUf)) ufSelect.value = "";
}

// ===============================
// CAMADAS (GeoJSON em memória)
// ===============================
let gjMunicipios = null,
  gjEstratos = null,
  gjFavelas = null,
  gjMcmv = null;

// ===============================
// ESTILOS (cores diferentes + hover)
// ===============================
const STYLE = {
  municipios: {
    color: "#222222",
    weight: 1.2,
    opacity: 1,
    fillColor: "#000000",
    fillOpacity: 0.0,
  },
  estratos: {
    color: "#2E86C1",
    weight: 1.0,
    opacity: 1,
    fillColor: "#5DADE2",
    fillOpacity: 0.25,
  },
  favelas: {
    color: "#B03A2E",
    weight: 1.0,
    opacity: 1,
    fillColor: "#E74C3C",
    fillOpacity: 0.35,
  },
};

const HOVER_STYLE = {
  color: "#111111",
  weight: 2,
  opacity: 1,
  fillOpacity: 0.55,
};

// Pontos (MCMV)
const MCMV_STYLE = {
  radius: 5,
  color: "#7D3C98",
  weight: 1,
  opacity: 1,
  fillColor: "#AF7AC5",
  fillOpacity: 0.9,
};

function getBaseStyle(key) {
  if (key === "municipios") return STYLE.municipios;
  if (key === "estratos") return STYLE.estratos;
  if (key === "favelas") return STYLE.favelas;
  return {};
}

function setLayerStyle(layer, key) {
  // Para camadas poligonais
  if (!layer?.setStyle) return;
  layer.setStyle(getBaseStyle(key));
}

function bindHover(layer, key) {
  if (!layer) return;
  layer.on("mouseover", () => {
    // mistura base + hover (mantém cor de preenchimento)
    const base = getBaseStyle(key);
    layer.setStyle({
      ...base,
      ...HOVER_STYLE,
      fillColor: base.fillColor ?? base.color,
    });
    layer.bringToFront?.();
  });
  layer.on("mouseout", () => {
    setLayerStyle(layer, key);
  });
}

function popupHtmlFromProps(props, key) {
  const p = props || {};
  const fields = SAMPLE_FIELDS[key] || Object.keys(p).slice(0, 6);
  const labels = SAMPLE_LABELS[key] || {};
  const rows = fields
    .filter((f) => p[f] != null && String(p[f]).trim() !== "")
    .map(
      (f) =>
        `<div style="display:flex;gap:8px;"><b style="min-width:110px;">${esc(labels[f] || f)}:</b><span>${esc(
          p[f]
        )}</span></div>`
    )
    .join("");

  const title =
    key === "municipios"
      ? esc(p.nm_mun ?? "Município")
      : key === "estratos"
      ? esc(p.nome_es ?? "Estrato")
      : key === "favelas"
      ? esc(p.nm_fcu ?? "Favela/Comunidade")
      : key === "mcmv"
      ? esc(p.txt_nome_m ?? "MCMV")
      : "Feição";

  return `<div style="min-width:220px">
      <div style="font-weight:700;margin-bottom:6px">${title}</div>
      ${rows || "<div style='color:#777'>Sem atributos configurados.</div>"}
    </div>`;
}

// ===============================
// Camadas Leaflet (com style + hover + popup)
// ===============================
const municipios = L.geoJSON(null, {
  style: () => STYLE.municipios,
  onEachFeature: (feature, layer) => {
    bindHover(layer, "municipios");
    layer.bindPopup(popupHtmlFromProps(feature.properties, "municipios"));
  },
}).addTo(map);

const estratos = L.geoJSON(null, {
  style: () => STYLE.estratos,
  onEachFeature: (feature, layer) => {
    bindHover(layer, "estratos");
    layer.bindPopup(popupHtmlFromProps(feature.properties, "estratos"));
  },
});

const favelas = L.geoJSON(null, {
  style: () => STYLE.favelas,
  onEachFeature: (feature, layer) => {
    bindHover(layer, "favelas");
    layer.bindPopup(popupHtmlFromProps(feature.properties, "favelas"));
  },
});

const mcmv = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.circleMarker(latlng, MCMV_STYLE),
  onEachFeature: (feature, layer) => {
    layer.bindPopup(popupHtmlFromProps(feature.properties, "mcmv"));
  },
});

// ===============================
// CONTROLE DE CAMADAS
// ===============================
L.control
  .layers(
    { OpenStreetMap: osm, "Satélite (ESRI)": esri },
    {
      Municípios: municipios,
      "Estratos geográficos": estratos,
      "Favelas / comunidades": favelas,
      "MCMV (pontos)": mcmv,
    },
    { collapsed: false }
  )
  .addTo(map);

// ===============================
// PERFORMANCE POR ZOOM
// ===============================
const Z_ESTRATOS_MIN = 3;
const Z_MCMV_MIN = 3;
const Z_FAVELAS_MIN = 3;

const LAYER_RULES = [
  { key: "estratos", ref: estratos, minZoom: Z_ESTRATOS_MIN, label: "Estratos geográficos" },
  { key: "mcmv", ref: mcmv, minZoom: Z_MCMV_MIN, label: "MCMV (pontos)" },
  { key: "favelas", ref: favelas, minZoom: Z_FAVELAS_MIN, label: "Favelas / comunidades" },
];

const userLayerEnabled = {
  municipios: map.hasLayer(municipios),
  estratos: map.hasLayer(estratos),
  favelas: map.hasLayer(favelas),
  mcmv: map.hasLayer(mcmv),
};

function enforceZoomRules() {
  const z = map.getZoom();

  for (const rule of LAYER_RULES) {
    const shouldBeVisible = userLayerEnabled[rule.key] && z >= rule.minZoom;
    const isVisible = map.hasLayer(rule.ref);

    if (shouldBeVisible && !isVisible) map.addLayer(rule.ref);
    if (!shouldBeVisible && isVisible) map.removeLayer(rule.ref);
  }
}
map.on("zoomend", enforceZoomRules);

// ===============================
// LEGENDA (com símbolo colorido)
// ===============================
const legendItemsEl = document.getElementById("legend-items");
const legendConfig = [
  { label: "Municípios", ref: municipios, color: STYLE.municipios.color },
  { label: "Estratos geográficos", ref: estratos, color: STYLE.estratos.fillColor },
  { label: "Favelas / comunidades", ref: favelas, color: STYLE.favelas.fillColor },
  { label: "MCMV/OGU", ref: mcmv, color: MCMV_STYLE.fillColor },
];

function refreshLegend() {
  if (!legendItemsEl) return;
  legendItemsEl.innerHTML = "";

  for (const it of legendConfig) {
    if (!map.hasLayer(it.ref)) continue;

    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:14px;height:14px;background:${it.color};
          display:inline-block;border-radius:3px;border:1px solid rgba(0,0,0,.35)"></span>
        <span class="lbl">${it.label}</span>
      </div>
    `;
    legendItemsEl.appendChild(div);
  }
}
map.on("overlayadd", (e) => {
  const rule = LAYER_RULES.find((r) => r.ref === e.layer);
  if (rule) {
    userLayerEnabled[rule.key] = true;
    if (map.getZoom() < rule.minZoom) {
      showMessage(`A camada "${rule.label}" volta a aparecer no zoom ${rule.minZoom}+.`);
    }
  }
  refreshLegend();
  updateInfoPanel?.();
  updateDashboard?.();
});

map.on("overlayremove", (e) => {
  const rule = LAYER_RULES.find((r) => r.ref === e.layer);
  if (rule) userLayerEnabled[rule.key] = false;
  refreshLegend();
  updateInfoPanel?.();
  updateDashboard?.();
});

// ===============================
// FILTRO LOCAL
// ===============================
function passesFilters(props, key) {
  const reg = regSelect?.value || "";
  const uf = ufSelect?.value || "";
  const regic = regicSelect?.value || "";

  const p = props || {};
  const fUF = norm(p.sigla_uf).toUpperCase();
  const fRegic = norm(p.hierarquia);

  if (regic) {
    if (p.hierarquia != null && fRegic !== norm(regic)) return false;
  }

  if (uf) {
    if (fUF !== uf.toUpperCase()) return false;
  } else if (reg) {
    const allowed = new Set(REGIOES_UF[reg] || []);
    if (!allowed.has(fUF)) return false;
  }

  return true;
}

// Converte qualquer GeoJSON em FeatureCollection
function toFeatureCollection(gj) {
  if (!gj) return { type: "FeatureCollection", features: [] };

  if (gj.type === "FeatureCollection") return gj;
  if (gj.type === "Feature") return { type: "FeatureCollection", features: [gj] };

  // Geometry (Polygon, MultiPolygon, etc)
  if (gj.type && typeof gj.type === "string") {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: gj }] };
  }

  return { type: "FeatureCollection", features: [] };
}

function applyToLayer(layer, geojson, key) {
  const fc = toFeatureCollection(geojson);
  layer.clearLayers();

  const filtered = {
    type: "FeatureCollection",
    features: (fc.features || []).filter((f) => passesFilters(f.properties, key)),
  };

  layer.addData(filtered);
}

function applyFilters() {
  applyToLayer(municipios, gjMunicipios, "municipios");
  applyToLayer(estratos, gjEstratos, "estratos");
  applyToLayer(favelas, gjFavelas, "favelas");
  applyToLayer(mcmv, gjMcmv, "mcmv");

  refreshLegend();
  updateInfoPanel?.();
  updateDashboard?.();
}

// Eventos filtros
regSelect?.addEventListener("change", () => {
  updateUfOptionsByRegion();
  applyFilters();
});
ufSelect?.addEventListener("change", applyFilters);
regicSelect?.addEventListener("change", applyFilters);

btnClear?.addEventListener("click", () => {
  if (regSelect) regSelect.value = "";
  if (ufSelect) ufSelect.value = "";
  if (regicSelect) regicSelect.value = "";
  updateUfOptionsByRegion();
  applyFilters();
});

updateUfOptionsByRegion();

// ===============================
// INFO PANEL (mantém o seu)
// ===============================
const btnInfo = document.getElementById("btnInfo");
const btnInfoClose = document.getElementById("btnInfoClose");
const infoPanel = document.getElementById("infoPanel");
const infoBody = document.getElementById("infoBody");
const statusMessage = document.getElementById("statusMessage");
const dashboardBody = document.getElementById("dashboardBody");

let statusTimer = null;

function showMessage(msg, type = "info", timeout = 3600) {
  if (!statusMessage) return;
  statusMessage.textContent = msg;
  statusMessage.className = `status-message ${type}`;

  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusMessage.className = "status-message hidden";
  }, timeout);
}

btnInfo?.addEventListener("click", () => {
  infoPanel.classList.toggle("hidden");
  if (!infoPanel.classList.contains("hidden")) updateInfoPanel();
});

btnInfoClose?.addEventListener("click", () => {
  infoPanel.classList.add("hidden");
});

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}

const INFO_LAYERS = [
  { key: "municipios", label: "Municípios", ref: municipios, gj: () => gjMunicipios },
  { key: "estratos", label: "Estratos", ref: estratos, gj: () => gjEstratos },
  { key: "favelas", label: "Favelas", ref: favelas, gj: () => gjFavelas },
  { key: "mcmv", label: "MCMV", ref: mcmv, gj: () => gjMcmv },
];


function getFilteredFeatures(meta) {
  const gj = toFeatureCollection(meta.gj());
  return (gj.features || []).filter((f) => passesFilters(f.properties, meta.key));
}

function updateDashboard() {
  if (!dashboardBody) return;

  const activeFilters = [regSelect?.value, ufSelect?.value, regicSelect?.value].filter(Boolean);

  const counts = INFO_LAYERS.map((meta) => {
    const features = getFilteredFeatures(meta);
    return {
      label: meta.label,
      count: features.length,
      features,
    };
  });

  const totals = counts.reduce((acc, item) => acc + item.count, 0);

  const byUf = new Map();
  for (const item of counts) {
    for (const f of item.features) {
      const uf = norm(f.properties?.sigla_uf).toUpperCase();
      if (!uf) continue;
      byUf.set(uf, (byUf.get(uf) || 0) + 1);
    }
  }

  const topUfs = Array.from(byUf.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxUf = topUfs.length ? topUfs[0][1] : 1;

  dashboardBody.innerHTML = `
    <div class="dashboard-subtitle">
      ${activeFilters.length ? `Resumo com filtros ativos: ${esc(activeFilters.join(" • "))}` : "Resumo geral (sem filtros)"}
    </div>

    <div class="dashboard-cards">
      ${counts
        .map(
          (c) => `
        <div class="dashboard-card">
          <div class="k">${esc(c.label)}</div>
          <div class="v">${c.count.toLocaleString("pt-BR")}</div>
        </div>
      `
        )
        .join("")}
      <div class="dashboard-card">
        <div class="k">Total de feições</div>
        <div class="v">${totals.toLocaleString("pt-BR")}</div>
      </div>
      <div class="dashboard-card">
        <div class="k">UFs representadas</div>
        <div class="v">${byUf.size.toLocaleString("pt-BR")}</div>
      </div>
    </div>

    <div class="dashboard-list">
      <div class="k">Top 5 UFs por quantidade</div>
      ${
        topUfs.length
          ? topUfs
              .map(
                ([uf, n]) => `
            <div class="dashboard-row">
              <div class="tag">${esc(uf)}</div>
              <div class="bar"><span style="width:${Math.max(6, (n / maxUf) * 100)}%"></span></div>
              <div class="n">${n.toLocaleString("pt-BR")}</div>
            </div>
          `
              )
              .join("")
          : `<div class="dashboard-subtitle">Sem dados para UFs com o filtro atual.</div>`
      }
    </div>
  `;
}

function featureBounds(feature) {
  try {
    const tmp = L.geoJSON(feature);
    return tmp.getBounds();
  } catch {
    return null;
  }
}

function sampleVisible(meta, max = 5) {
  if (!map.hasLayer(meta.ref)) return [];
  const gj = toFeatureCollection(meta.gj());
  const fields = (SAMPLE_FIELDS[meta.key] || []).slice(0, 4);
  const b = map.getBounds();

  const out = [];
  for (const f of gj.features || []) {
    if (!passesFilters(f.properties, meta.key)) continue;
    const fb = featureBounds(f);
    if (!fb || !b.intersects(fb)) continue;

    const row = {};
    for (const k of fields) row[k] = f.properties?.[k] ?? "";
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

function visibleRowsForExport(meta) {
  if (!map.hasLayer(meta.ref)) return [];
  const gj = toFeatureCollection(meta.gj());
  const b = map.getBounds();
  const rows = [];

  for (const f of gj.features || []) {
    if (!passesFilters(f.properties, meta.key)) continue;
    const fb = featureBounds(f);
    if (!fb || !b.intersects(fb)) continue;

    rows.push({
      camada: meta.label,
      ...Object.fromEntries((SAMPLE_FIELDS[meta.key] || []).map((k) => [k, f.properties?.[k] ?? ""])),
    });
  }

  return rows;
}

function visibleFeaturesForExport(meta) {
  if (!map.hasLayer(meta.ref)) return [];
  const gj = toFeatureCollection(meta.gj());
  const b = map.getBounds();
  const features = [];

  for (const f of gj.features || []) {
    if (!passesFilters(f.properties, meta.key)) continue;
    const fb = featureBounds(f);
    if (!fb || !b.intersects(fb)) continue;

    features.push({
      ...f,
      properties: {
        ...(f.properties || {}),
        camada: meta.label,
      },
    });
  }

  return features;
}

function toCsv(rows) {
  if (!rows.length) return "";

  const header = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const lines = [header.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCell(row[key])).join(","));
  }
  return lines.join("\n");
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportVisibleCsv() {
  const rows = INFO_LAYERS.flatMap((meta) => visibleRowsForExport(meta));

  if (!rows.length) {
    showMessage("Não há feições visíveis para exportar.", "warn");
    return;
  }

  const csv = toCsv(rows);
  downloadBlob(csv, "text/csv;charset=utf-8;", `webgis_visivel_${new Date().toISOString().slice(0, 10)}.csv`);
  showMessage(`CSV exportado com ${rows.length} feições visíveis.`, "success");
}

function exportVisibleGeoJSON() {
  const features = INFO_LAYERS.flatMap((meta) => visibleFeaturesForExport(meta));

  if (!features.length) {
    showMessage("Não há feições visíveis para exportar em GeoJSON.", "warn");
    return;
  }

  const fc = {
    type: "FeatureCollection",
    name: "webgis_visivel",
    features,
  };

  downloadBlob(JSON.stringify(fc), "application/geo+json;charset=utf-8;", `webgis_visivel_${new Date().toISOString().slice(0, 10)}.geojson`);
  showMessage(`GeoJSON exportado com ${features.length} feições visíveis.`, "success");
}

function updateInfoPanel() {
  if (!infoBody || infoPanel?.classList.contains("hidden")) return;

  const z = map.getZoom();
  const c = map.getCenter();
  const active = INFO_LAYERS.filter((m) => map.hasLayer(m.ref));

  const activeChips = active.length
    ? active.map((m) => `<span class="info-chip info-ok">${esc(m.label)}</span>`).join(" ")
    : `<span class="info-chip info-bad">nenhuma camada ativa</span>`;

  let tables = "";
  active.forEach((m) => {
    const rows = sampleVisible(m, 5);
    const cols = (SAMPLE_FIELDS[m.key] || []).slice(0, 4);
    const labels = SAMPLE_LABELS[m.key] || {};

    if (!rows.length) {
      tables += `<div class="info-mini"><b>${esc(m.label)}</b><div style="color:#777">Sem feições na tela.</div></div>`;
      return;
    }

    tables += `<div class="info-mini"><b>${esc(m.label)}</b><div style="overflow:auto;margin-top:6px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr>${cols
            .map((cn) => `<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">${esc(labels[cn] || cn)}</th>`)
            .join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              ${cols.map((cn) => `<td style="border-bottom:1px solid #f0f0f0;padding:4px">${esc(r[cn] ?? "")}</td>`).join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div></div>`;
  });

  infoBody.innerHTML = `
    <div><b>Zoom:</b> ${z}</div>
    <div><b>Centro:</b> ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</div>

    <div class="info-section">
      <h4>Camadas ativas</h4>
      ${activeChips}
    </div>

    <div class="info-section">
      <h4>Amostra (visível no enquadramento)</h4>
      <div class="info-note">A tabela mostra apenas uma amostra de até 5 feições por camada. A exportação baixa todas as feições visíveis na tela.</div>
      ${tables}
    </div>

    <div class="export-actions">
      <button id="btnExportCsv" type="button">Exportar CSV (todas feições visíveis)</button>
      <button id="btnExportGeojson" type="button">Exportar GeoJSON (espacial)</button>
    </div>
  `;

  const btnExportCsv = document.getElementById("btnExportCsv");
  const btnExportGeojson = document.getElementById("btnExportGeojson");
  btnExportCsv?.addEventListener("click", exportVisibleCsv);
  btnExportGeojson?.addEventListener("click", exportVisibleGeoJSON);
}

map.on("zoomend moveend overlayadd overlayremove", updateInfoPanel);

// ===============================
// CARREGAR GEOJSON E INICIAR
// ===============================
async function loadGeoJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Erro ao carregar ${url} (${res.status})`);
  return await res.json();
}

(async function boot() {
  try {
    [gjMunicipios, gjEstratos, gjFavelas, gjMcmv] = await Promise.all([
      loadGeoJSON(DATA.municipios),
      loadGeoJSON(DATA.estratos),
      loadGeoJSON(DATA.favelas),
      loadGeoJSON(DATA.mcmv),
    ]);

    applyFilters();
    enforceZoomRules();
    refreshLegend();
    updateInfoPanel();
    updateDashboard();

    // ✅ Enquadrar no Brasil (municípios)
    const b = municipios.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b, { padding: [10, 10] });
    } else {
      console.warn("Bounds inválido: possível GeoJSON em CRS errado (ex: UTM).");
      showMessage("Camadas carregadas, mas o limite espacial está inválido (verifique CRS EPSG:4326).", "warn", 5000);
    }
  } catch (e) {
    console.error(e);
    showMessage("Erro ao carregar GeoJSON local. Confira /data e os nomes dos arquivos.", "error", 5000);
  }
})();



