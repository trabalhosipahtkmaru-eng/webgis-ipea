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

const esri = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles &copy; Esri' }
);

L.control.scale().addTo(map);

// ===============================
// DADOS LOCAIS (GEOJSON) - GitHub Pages
// ===============================
const DATA = {
  municipios: 'data/municipios.json',
  estratos:   'data/estratos.json',
  favelas:    'data/favelas.json',
  mcmv:       'data/mcmv.json'
};

// ===============================
// CAMPOS (os seus)
// ===============================
const SAMPLE_FIELDS = {
  municipios: ['cd_mun', 'nm_mun', 'sigla_uf', 'hierarquia'],
  estratos:   ['codigo_es', 'nome_es', 'sigla_uf'],
  favelas:    ['cd_fcu', 'nm_fcu', 'sigla_uf', 'regiao'],
  mcmv:       ['txt_nome_m', 'txt_modali', 'sigla_uf', 'regiao']
};

const SAMPLE_LABELS = {
  municipios: { cd_mun:'Código', nm_mun:'Município', sigla_uf:'UF', hierarquia:'REGIC' },
  estratos:   { codigo_es:'Código do Estrato', nome_es:'Estrato', sigla_uf:'UF'},
  favelas:    { cd_fcu:'Código', nm_fcu:'Favela/Comunidade', sigla_uf:'UF', regiao:'Região' },
  mcmv:       { txt_nome_m:'Município', txt_modali:'Modalidade', sigla_uf:'UF', regiao:'Região' }
};

// ===============================
// FILTROS (mesma regra)
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

function norm(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

// ===============================
// CAMADAS (GeoJSON em memória)
// ===============================
let gjMunicipios = null, gjEstratos = null, gjFavelas = null, gjMcmv = null;

// Estilos bem visíveis
const STYLE = {
  municipios: { weight: 1.2, opacity: 1, fillOpacity: 0.0 },
  estratos:   { weight: 1.0, opacity: 1, fillOpacity: 0.15 },
  favelas:    { weight: 1.0, opacity: 1, fillOpacity: 0.25 }
};

// Camadas Leaflet
const municipios = L.geoJSON(null, { style: () => STYLE.municipios }).addTo(map);
const estratos   = L.geoJSON(null, { style: () => STYLE.estratos });
const favelas    = L.geoJSON(null, { style: () => STYLE.favelas });
const mcmv       = L.geoJSON(null, {
  pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8 })
});

// ===============================
// CONTROLE DE CAMADAS
// ===============================
L.control.layers(
  { 'OpenStreetMap': osm, 'Satélite (ESRI)': esri },
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

// ===============================
// LEGENDA (simples)
// ===============================
const legendItemsEl = document.getElementById('legend-items');
const legendConfig = [
  { label: 'Municípios', ref: municipios },
  { label: 'Estratos geográficos', ref: estratos },
  { label: 'Favelas / comunidades', ref: favelas },
  { label: 'MCMV/OGU', ref: mcmv }
];

function refreshLegend() {
  if (!legendItemsEl) return;
  legendItemsEl.innerHTML = '';
  for (const it of legendConfig) {
    if (!map.hasLayer(it.ref)) continue;
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<div class="lbl">${it.label}</div>`;
    legendItemsEl.appendChild(div);
  }
}
map.on('overlayadd overlayremove', refreshLegend);

// ===============================
// FILTRO LOCAL
// ===============================
function passesFilters(props, key) {
  const reg  = regSelect.value;
  const uf   = ufSelect.value;
  const regic = regicSelect?.value || '';

  const p = props || {};
  const fUF    = norm(p.sigla_uf).toUpperCase();
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
  if (!gj) return { type: 'FeatureCollection', features: [] };

  if (gj.type === 'FeatureCollection') return gj;
  if (gj.type === 'Feature') return { type: 'FeatureCollection', features: [gj] };

  // Geometry (Polygon, MultiPolygon, etc)
  if (gj.type && typeof gj.type === 'string') {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: gj }]
    };
  }

  return { type: 'FeatureCollection', features: [] };
}

function applyToLayer(layer, geojson, key) {
  const fc = toFeatureCollection(geojson);
  layer.clearLayers();

  const filtered = {
    type: 'FeatureCollection',
    features: (fc.features || []).filter(f => passesFilters(f.properties, key))
  };

  layer.addData(filtered);
}

function applyFilters() {
  applyToLayer(municipios, gjMunicipios, 'municipios');
  applyToLayer(estratos,   gjEstratos,   'estratos');
  applyToLayer(favelas,    gjFavelas,    'favelas');
  applyToLayer(mcmv,       gjMcmv,       'mcmv');

  refreshLegend();
  updateInfoPanel?.();
}

// Eventos filtros
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
// INFO PANEL (mantém o seu existente)
// ===============================
const btnInfo = document.getElementById('btnInfo');
const btnInfoClose = document.getElementById('btnInfoClose');
const infoPanel = document.getElementById('infoPanel');
const infoBody = document.getElementById('infoBody');

btnInfo?.addEventListener('click', () => {
  infoPanel.classList.toggle('hidden');
  if (!infoPanel.classList.contains('hidden')) updateInfoPanel();
});

btnInfoClose?.addEventListener('click', () => {
  infoPanel.classList.add('hidden');
});

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

const INFO_LAYERS = [
  { key:'municipios', label:'Municípios', ref: municipios, gj: () => gjMunicipios },
  { key:'estratos',   label:'Estratos',   ref: estratos,   gj: () => gjEstratos },
  { key:'favelas',    label:'Favelas',    ref: favelas,    gj: () => gjFavelas },
  { key:'mcmv',       label:'MCMV',       ref: mcmv,       gj: () => gjMcmv }
];

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
    for (const k of fields) row[k] = f.properties?.[k] ?? '';
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

function updateInfoPanel() {
  if (!infoBody || infoPanel.classList.contains('hidden')) return;

  const z = map.getZoom();
  const c = map.getCenter();
  const active = INFO_LAYERS.filter(m => map.hasLayer(m.ref));

  const activeChips = active.length
    ? active.map(m => `<span class="info-chip info-ok">${esc(m.label)}</span>`).join(' ')
    : `<span class="info-chip info-bad">nenhuma camada ativa</span>`;

  let tables = '';
  active.forEach(m => {
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
          <tr>${cols.map(cn => `<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">${esc(labels[cn] || cn)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(r => `
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
    </div>
  `;
}

map.on('zoomend moveend overlayadd overlayremove', updateInfoPanel);

// ===============================
// CARREGAR GEOJSON E INICIAR
// ===============================
async function loadGeoJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Erro ao carregar ${url} (${res.status})`);
  return await res.json();
}

(async function boot() {
  try {
    [gjMunicipios, gjEstratos, gjFavelas, gjMcmv] = await Promise.all([
      loadGeoJSON(DATA.municipios),
      loadGeoJSON(DATA.estratos),
      loadGeoJSON(DATA.favelas),
      loadGeoJSON(DATA.mcmv)
    ]);

    applyFilters();
    enforceZoomRules();
    refreshLegend();
    updateInfoPanel();

    // ✅ PROVA visual + corrige caso as geometrias estejam “perdidas”
    const b = municipios.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b, { padding: [10, 10] });
    } else {
      console.warn('Bounds inválido: possível GeoJSON em CRS errado (ex: UTM).');
      alert('As camadas carregaram, mas o Bounds é inválido. Provável CRS errado (GeoJSON precisa estar em EPSG:4326).');
    }

  } catch (e) {
    console.error(e);
    alert('Erro carregando GeoJSON local. Confira a pasta /data e os nomes dos arquivos.');
  }
})();



