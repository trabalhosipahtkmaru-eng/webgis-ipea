// ===============================
// MAPA BASE
// ===============================
const map = L.map('map', {
  center: [-15, -55],
  zoom: 4,
  minZoom: 3,
  maxZoom: 18
});

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

L.control.scale().addTo(map);

// ===============================
// GEOSERVER
// ===============================
const GS_BASE = 'http://localhost:8080/geoserver';
const WORKSPACE = 'webgis';
const WMS_URL = `${GS_BASE}/${WORKSPACE}/wms`;

function makeWMS(layerName, options = {}) {
  return L.tileLayer.wms(WMS_URL, {
    layers: layerName,
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    tiled: true,
    ...options
  });
}

// ===============================
// CAMADAS (AJUSTE AQUI SE PRECISAR)
// ===============================
const L_MUNICIPIOS = 'webgis:municipios_com_regiao';
const L_ESTRATOS   = 'webgis:REPROJ_Corrig_Base_inicial_14012026___Estratos_Geograficos';
const L_FAVELAS    = 'webgis:REPROJ_Corrig_Base_inicial_14012026___Favelas_comunidades_urb20';
const L_MCMV       = 'webgis:REPROJ_Corrig_Base_inicial_14012026___MCMV_OGU  copiar'; // <-- confirme o nome exato no GeoServer

// ===============================
// INSTÂNCIAS WMS
// ===============================
const municipios = makeWMS(L_MUNICIPIOS, { opacity: 0.90 }).addTo(map);
const estratos   = makeWMS(L_ESTRATOS,   { opacity: 0.85 });
const favelas    = makeWMS(L_FAVELAS,    { opacity: 0.90 });
const mcmv       = makeWMS(L_MCMV,       { opacity: 1.00 });

// ===============================
// CONTROLE DE CAMADAS
// ===============================
L.control.layers(
  { 'OpenStreetMap': osm,
  'Satélite (ESRI)': esri},
  {
    'Municípios': municipios,
    'Estratos geográficos': estratos,
    'Favelas / comunidades': favelas,
    'MCMV (pontos)': mcmv
  },
  { collapsed: false }
).addTo(map);

// ===============================
// PERFORMANCE POR ZOOM
// ===============================
const Z_ESTRATOS_MIN = 3;
const Z_MCMV_MIN     = 3;
const Z_FAVELAS_MIN  = 3;

function enforceZoomRules() {
  const z = map.getZoom();
  if (z < Z_ESTRATOS_MIN && map.hasLayer(estratos)) map.removeLayer(estratos);
  if (z < Z_MCMV_MIN && map.hasLayer(mcmv)) map.removeLayer(mcmv);
  if (z < Z_FAVELAS_MIN && map.hasLayer(favelas)) map.removeLayer(favelas);
}
map.on('zoomend', enforceZoomRules);
enforceZoomRules();

// ===============================
// LEGENDA DINÂMICA
// ===============================
function wmsLegendUrl(layerName) {
  return `${GS_BASE}/${WORKSPACE}/wms?request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(layerName)}`;
}

const legendItemsEl = document.getElementById('legend-items');
const legendConfig = [
  { label: 'Municípios', layer: L_MUNICIPIOS, ref: municipios },
  { label: 'Estratos geográficos', layer: L_ESTRATOS, ref: estratos },
  { label: 'Favelas / comunidades', layer: L_FAVELAS, ref: favelas },
  { label: 'MCMV/OGU', layer: L_MCMV, ref: mcmv }
];

function refreshLegend() {
  legendItemsEl.innerHTML = '';
  for (const it of legendConfig) {
    if (!map.hasLayer(it.ref)) continue;
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<div class="lbl">${it.label}</div><img src="${wmsLegendUrl(it.layer)}">`;
    legendItemsEl.appendChild(div);
  }
}
map.on('overlayadd overlayremove', refreshLegend);
refreshLegend();

// ===============================
// FILTROS: REGIÃO + UF + REGIC (hierarquia)
// Regras:
// - Se UF selecionada: filtra por UF (prioridade)
// - Se UF vazia e Região selecionada: filtra por lista de UFs
// - REGIC aplica junto (somente onde existe o campo 'hierarquia')
// ===============================
const REGIOES_UF = {
  'Norte': ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  'Nordeste': ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  'Sudeste': ['ES', 'MG', 'RJ', 'SP'],
  'Sul': ['PR', 'RS', 'SC']
};

const regSelect = document.getElementById('regSelect');
const ufSelect = document.getElementById('ufSelect');
const regicSelect = document.getElementById('regicSelect');
const btnClear = document.getElementById('btnClear');

function clearCql(layer) {
  if (layer.wmsParams && 'CQL_FILTER' in layer.wmsParams) delete layer.wmsParams.CQL_FILTER;
  layer.setParams({ _ts: Date.now() });
  if (layer.redraw) layer.redraw();
}

function setCql(layer, cql) {
  layer.setParams({ CQL_FILTER: cql, _ts: Date.now() });
  if (layer.redraw) layer.redraw();
}

function updateUfOptionsByRegion() {
  const reg = regSelect.value;
  const allowed = reg ? new Set(REGIOES_UF[reg] || []) : null;
  const currentUf = ufSelect.value;

  Array.from(ufSelect.options).forEach(opt => {
    if (!opt.value) { opt.disabled = false; opt.hidden = false; return; }
    const ok = allowed ? allowed.has(opt.value) : true;
    opt.disabled = !ok;
    opt.hidden = !ok;
  });

  if (allowed && currentUf && !allowed.has(currentUf)) ufSelect.value = '';
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

async function applyFilters() {
  const reg = regSelect.value;
  const uf = ufSelect.value;
  const regic = regicSelect?.value || '';

  // se tudo vazio -> limpa
  if (!reg && !uf && !regic) {
    [municipios, estratos, favelas, mcmv].forEach(clearCql);
    refreshLegend();
    updateInfoPanel(); // painel
    return;
  }

  // monta condições
  let partsMun = [];
  let partsEst = [];
  let partsFav = [];
  let partsMcm = [];

  // REGIC (hierarquia) — aplica onde o campo existe
  if (regic) {
    const cqlRegic = `hierarquia='${escSql(regic)}'`;
    partsMun.push(cqlRegic);
    // Se estratos/favelas/mcmv também têm hierarquia, pode habilitar:
    partsEst.push(cqlRegic);
    partsFav.push(cqlRegic);
    partsMcm.push(cqlRegic);
  }

  // UF tem prioridade
  if (uf) {
    const cqlUF = `strToUpperCase(sigla_uf)='${uf}'`;
    partsMun.push(cqlUF);
    partsEst.push(cqlUF);
    partsFav.push(cqlUF);
    partsMcm.push(cqlUF);
  } else if (reg) {
    const ufs = REGIOES_UF[reg] || [];
    const inList = ufs.map(x => `'${x}'`).join(',');
    const cqlList = `strToUpperCase(sigla_uf) IN (${inList})`;
    partsMun.push(cqlList);
    partsEst.push(cqlList);
    partsFav.push(cqlList);
    partsMcm.push(cqlList);
  }

  // aplica
  const cqlMun = partsMun.length ? partsMun.join(' AND ') : null;
  const cqlEst = partsEst.length ? partsEst.join(' AND ') : null;
  const cqlFav = partsFav.length ? partsFav.join(' AND ') : null;
  const cqlMcm = partsMcm.length ? partsMcm.join(' AND ') : null;

  cqlMun ? setCql(municipios, cqlMun) : clearCql(municipios);
  cqlEst ? setCql(estratos, cqlEst)   : clearCql(estratos);
  cqlFav ? setCql(favelas, cqlFav)    : clearCql(favelas);
  cqlMcm ? setCql(mcmv, cqlMcm)       : clearCql(mcmv);

  refreshLegend();
  updateInfoPanel(); // painel
}

regSelect.addEventListener('change', () => {
  updateUfOptionsByRegion();
  applyFilters();
});
ufSelect.addEventListener('change', applyFilters);
regicSelect?.addEventListener('change', applyFilters);

btnClear.addEventListener('click', () => {
  regSelect.value = '';
  ufSelect.value = '';
  if (regicSelect) regicSelect.value = '';
  updateUfOptionsByRegion();
  applyFilters();
});

updateUfOptionsByRegion();

// ===============================
// PAINEL INFO (Zoom + Camadas ativas + Tabela leve + Export CSV)
// ===============================
const btnInfo = document.getElementById('btnInfo');
const btnInfoClose = document.getElementById('btnInfoClose');
const infoPanel = document.getElementById('infoPanel');
const infoBody = document.getElementById('infoBody');

btnInfo.addEventListener('click', () => {
  infoPanel.classList.toggle('hidden');
  if (!infoPanel.classList.contains('hidden')) {
    updateInfoPanel(); // força preencher quando abre
  }
});

btnInfoClose.addEventListener('click', () => {
  infoPanel.classList.add('hidden');
});

// Campos reais (ajuste os 2 do estrato se estiverem com outro nome!)
const SAMPLE_FIELDS = {
  municipios: ['cd_mun', 'nm_mun', 'sigla_uf', 'hierarquia'],
  // ⚠️ AJUSTE AQUI: descubra os nomes reais no GeoServer (Layer Preview → JSON)
  estratos:   ['codigo_es', 'nome_es'],
  favelas:    ['cd_fcu', 'nm_fcu', 'sigla_uf', 'regiao'],
  mcmv:       ['txt_nome_m', 'txt_modali', 'sigla_uf', 'regiao']
};

// Labels bonitos no painel (não dependem do nome real do campo)
const SAMPLE_LABELS = {
  municipios: { cd_mun:'Código', nm_mun:'Município', sigla_uf:'UF', hierarquia:'REGIC' },
  estratos:   { codigo_es:'Código do Estrato',nome_es:'Estrato'},
  favelas:    { cd_fcu:'Código', nm_fcu:'Favela/Comunidade', sigla_uf:'UF', regiao:'Região' },
  mcmv:       { txt_nome_m:'Município', txt_modali:'Modalidade', sigla_uf:'UF', regiao:'Região' }
};

const INFO_LAYERS = [
  { key:'municipios', label:'Municípios', layerName: L_MUNICIPIOS, ref: municipios },
  { key:'estratos',   label:'Estratos',   layerName: L_ESTRATOS,   ref: estratos },
  { key:'favelas',    label:'Favelas',    layerName: L_FAVELAS,    ref: favelas },
  { key:'mcmv',       label:'MCMV',       layerName: L_MCMV,       ref: mcmv }
];

function bbox4326() {
  const b = map.getBounds();
  return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()},EPSG:4326`;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

async function fetchSample(meta) {
  if (!map.hasLayer(meta.ref)) return [];

  const fields = SAMPLE_FIELDS[meta.key] || [];
  const prop = fields.join(',');

  let url =
    `${GS_BASE}/${WORKSPACE}/ows?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(meta.layerName)}` +
    `&outputFormat=application/json` +
    `&maxFeatures=5` +
    `&bbox=${encodeURIComponent(bbox4326())}` +
    `&propertyName=${encodeURIComponent(prop)}`;

  const cql = meta.ref?.wmsParams?.CQL_FILTER;
  if (cql) url += `&CQL_FILTER=${encodeURIComponent(cql)}`;

  try {
    const gj = await fetch(url).then(r => r.json());
    return (gj.features || []).map(f => f.properties || {});
  } catch {
    return [];
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function exportCsvVisible() {
  const active = INFO_LAYERS.filter(m => map.hasLayer(m.ref));
  if (!active.length) return;

  let lines = ['layer,' + ['c1','c2','c3','c4'].join(',')];

  for (const m of active) {
    const cols = (SAMPLE_FIELDS[m.key] || []).slice(0, 4);
    const prop = cols.join(',');

    let url =
      `${GS_BASE}/${WORKSPACE}/ows?service=WFS&version=1.0.0&request=GetFeature` +
      `&typeName=${encodeURIComponent(m.layerName)}` +
      `&outputFormat=application/json` +
      `&maxFeatures=300` +
      `&bbox=${encodeURIComponent(bbox4326())}` +
      `&propertyName=${encodeURIComponent(prop)}`;

    const cql = m.ref?.wmsParams?.CQL_FILTER;
    if (cql) url += `&CQL_FILTER=${encodeURIComponent(cql)}`;

    const gj = await fetch(url).then(r => r.json()).catch(() => null);
    const feats = gj?.features || [];

    feats.forEach(f => {
      const p = f.properties || {};
      const row = [
        m.label,
        p[cols[0]] ?? '',
        p[cols[1]] ?? '',
        p[cols[2]] ?? '',
        p[cols[3]] ?? ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      lines.push(row);
    });
  }

  downloadText(`webgis_visivel_${new Date().toISOString().slice(0,10)}.csv`, lines.join('\n'));
}

async function updateInfoPanel() {
  if (infoPanel.classList.contains('hidden')) return;

  const z = map.getZoom();
  const c = map.getCenter();

  const active = INFO_LAYERS.filter(m => map.hasLayer(m.ref));

  const activeChips = active.length
    ? active.map(m => `<span class="info-chip info-ok">${esc(m.label)}</span>`).join(' ')
    : `<span class="info-chip info-bad">nenhuma camada ativa</span>`;

  infoBody.innerHTML = `
    <div><b>Zoom:</b> ${z}</div>
    <div><b>Centro:</b> ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</div>

    <div class="info-section">
      <h4>Camadas ativas</h4>
      ${activeChips}
    </div>

    <div class="info-section">
      <h4>Amostra (visível no enquadramento)</h4>
      <div style="color:#666;font-size:12px">Carregando...</div>
    </div>
  `;

  const samples = await Promise.all(active.map(m => fetchSample(m)));

  let tables = '';
  active.forEach((m, i) => {
    const rows = samples[i];
    const cols = (SAMPLE_FIELDS[m.key] || []).slice(0, 4);
    const labels = SAMPLE_LABELS[m.key] || {};

    if (!rows.length) {
      tables += `<div class="info-mini"><b>${esc(m.label)}</b><div style="color:#777">Sem feições na tela.</div></div>`;
      return;
    }

    tables += `<div class="info-mini"><b>${esc(m.label)}</b><div style="overflow:auto;margin-top:6px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr>${cols.map(cn => `<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">${esc(labels[cn] || cn)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.slice(0, 5).map(r => `
            <tr>
              ${cols.map(cn => `<td style="border-bottom:1px solid #f0f0f0;padding:4px">${esc(r[cn] ?? '')}</td>`).join('')}
            </tr>
          `).join('')}
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
      ${tables}
      <button id="btnExport" style="width:100%;margin-top:8px;padding:8px;cursor:pointer">Exportar CSV (visível)</button>
    </div>
  `;

  document.getElementById('btnExport').addEventListener('click', exportCsvVisible);
}

map.on('zoomend moveend overlayadd overlayremove', () => {
  updateInfoPanel();
});
