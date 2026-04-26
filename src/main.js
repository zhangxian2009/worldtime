// @ts-check
// ES module — 'use strict' is implicit. Empty export marks this as a module
// (required for top-level await to be recognized).
export {};

// ── 工具模块导入 ──────────────────────────────────────────────────────
import {
  solarPosition, moonPhase, moonPositionAt, moonPosition,
  getSunTimes, getMoonPhase,
  WEEK_DAYS, getLunarStr, SOLAR_TERMS, getSolarTerm,
} from './core/astro.js';
import {
  getUTCOffset, getUTCOffsetHours, localTimeStr,
  getHourMinute, localDayStartMs, localDateLabel, fmtHHMM,
} from './core/time-utils.js';
import {
  lerp2, lerp3, getColorRGB, getColorStr, lightLevel,
  buildGradientCentered, compBgRGB, compTextColor,
} from './core/color-utils.js';

/**
 * @typedef {Object} City
 * @property {string} id     - 城市唯一标识 (e.g. "beijing")
 * @property {string} label  - 显示名 (e.g. "北京")
 * @property {string} tz     - IANA 时区名 (e.g. "Asia/Shanghai")
 * @property {number} lat    - 纬度 (degrees, +N -S)
 * @property {number} lon    - 经度 (degrees, +E -W)
 */

/**
 * @typedef {Object} Country
 * @property {string} country
 * @property {City[]} cities
 */

/**
 * @typedef {Object} Continent
 * @property {string} continent
 * @property {Country[]} countries
 */

/**
 * @typedef {Object} SunTimes
 * @property {number} sunrise - hour-of-day fraction
 * @property {number} sunset  - hour-of-day fraction
 */

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat
 * @property {number} lon
 */

// ES module — 不再需要 IIFE 包裹，因为顶层 await 在 module 中可用，
// 且 module 自带闭包语义（声明不会污染 window）。

// ── DOM ID 常量（避免散落的字符串字面量）───────────────────────────────
const DOM = /** @type {const} */ ({
  modalBg:        'modalBg',
  selectedChips:  'selectedChips',
  cityList:       'cityList',
  settingsBtn:    'settingsBtn',
  wpCityBtn:      'wpCityBtn',
  modalDone:      'modalDone',
  mapPanel:       'mapPanel',
  mapSvg:         'mapSvg',
  timelinePanel:  'timelinePanel',
  localClock:     'localClock',
  wpclockTime:    'wpclock-time',
  wpclockDate:    'wpclock-date',
  worldClock:     'worldClock',
});

// ── localStorage 键名常量 ─────────────────────────────────────────────
const STORAGE = /** @type {const} */ ({
  selected: 'selectedCityIds',
  pinned:   'pinnedCityIds',
  map:      'mapState',
});

// ── City catalogue (异步加载) ─────────────────────────────────────────
let CITY_CATALOG;
try {
  const resp = await fetch('data/cities.json');
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  CITY_CATALOG = await resp.json();
} catch (err) {
  console.error('[WorldTime] Failed to load data/cities.json:', err);
  document.body.innerHTML =
    '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#666">' +
    '<h2>无法加载城市数据</h2>' +
    '<p>请检查 <code>data/cities.json</code> 是否存在，并通过 HTTP 服务器访问（不要直接 file://）。</p>' +
    '<p>错误：' + (err && err.message ? err.message : err) + '</p></div>';
  // ES module 顶层 return 不允许；重新抛出以终止模块执行（错误 UI 已渲染）
  throw err;
}

const ALL_CITIES = CITY_CATALOG.flatMap(c => c.countries.flatMap(n => n.cities));
window.ALL_CITIES = ALL_CITIES;  // Make ALL_CITIES accessible to Clock functions
const WALLPAPER_MODE = new URLSearchParams(location.search).get('wallpaper') === '1';
if (WALLPAPER_MODE) document.body.classList.add('wallpaper');
const DEFAULT_IDS = ['beijing','amsterdam','berlin','london','newyork','sanfrancisco'];

// ── 应用状态聚合 ──────────────────────────────────────────────────────
// 所有可变的应用状态归类到这一个对象，按 TAB / 功能分组。
// 不在这里的 mutable 名字（如 d3 的 projection / geoPath / svg / worldData）
// 是缓存的库实例而非应用状态，故保留为顶层 let。

/**
 * @typedef {Object} AppState
 * @property {{ selected: string[], pinned: string[] }} selection
 * @property {{
 *   proj: 'naturalEarth' | 'braun',
 *   term: 'natural' | 'simple',
 *   rotation: number,
 *   isTransitioning: boolean,
 *   isTermTransitioning: boolean,
 *   termSimpleOpacity: number,
 *   termNaturalOpacity: number,
 *   isRotating: boolean,
 *   tzBoundaryData: any,
 * }} map
 * @property {{ resizeTimer: ReturnType<typeof setTimeout> | null }} comp
 * @property {{
 *   showSecond: boolean,
 *   updateInterval: ReturnType<typeof setInterval> | null,
 *   secondTimer:    ReturnType<typeof setInterval> | null,
 *   autoHideTimeout: ReturnType<typeof setTimeout> | null,
 *   initialized: boolean,
 * }} clock
 */

/** @type {AppState} */
const state = {
  // 城市选择（4 个 TAB 共用）
  selection: {
    selected: (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE.selected) || 'null');
        if (Array.isArray(saved) && saved.length > 0 &&
            saved.every(id => ALL_CITIES.some(c => c.id === id))) return saved;
      } catch(e) {}
      return [...DEFAULT_IDS];
    })(),
    pinned: (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE.pinned) || 'null');
        if (Array.isArray(saved)) return saved.filter(id => ALL_CITIES.some(c => c.id === id));
      } catch(e) {}
      return [];
    })(),
  },

  // 世界地图 TAB
  map: {
    proj:                'naturalEarth',  // or 'braun'
    term:                'natural',       // or 'simple'
    rotation:            -116.39,         // default: Beijing centered (D3: negate lon)
    isTransitioning:     false,
    isTermTransitioning: false,
    termSimpleOpacity:   0,               // natural is default-active
    termNaturalOpacity:  1,
    isRotating:          false,
    tzBoundaryData:      null,
  },

  // 对照表 TAB
  comp: {
    resizeTimer: null,
  },

  // Clock TAB
  clock: {
    showSecond:      true,
    updateInterval:  null,
    secondTimer:     null,
    autoHideTimeout: null,
    initialized:     false,
  },
};

// ── 从 localStorage 恢复地图状态 ──────────────────────────────────────
(function() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE.map) || '{}');
    if (s.proj === 'braun') state.map.proj = 'braun';
    if (s.term === 'simple') {
      state.map.term        = 'simple';
      state.map.termSimpleOpacity  = 1;
      state.map.termNaturalOpacity = 0;
    }
    if (typeof s.rotation === 'number') state.map.rotation = s.rotation;
  } catch(e) {}
})();
// 同步初始按钮选中状态
document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(b =>
  b.classList.toggle('active', b.dataset.proj === state.map.proj));
document.querySelectorAll('.term-btn').forEach(b =>
  b.classList.toggle('active', b.dataset.term === state.map.term));

async function loadTzBoundaries() {
  try {
    state.map.tzBoundaryData = await d3.json('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_time_zones.geojson');
  } catch(e) {
    console.warn('Timezone boundary data unavailable, using meridians');
  }
}

function saveSelection() {
  localStorage.setItem(STORAGE.selected, JSON.stringify(state.selection.selected));
}
function savePinned() {
  localStorage.setItem(STORAGE.pinned, JSON.stringify(state.selection.pinned));
}

function saveMapState() {
  localStorage.setItem(STORAGE.map, JSON.stringify({
    proj:     state.map.proj,
    term:     state.map.term,
    rotation: state.map.rotation
  }));
}

// ── Tabs ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active');
    if (btn.dataset.panel === 'compPanel') {
      setTimeout(() => {
        const nowTh = document.querySelector('#compPanel th.ct-now-col');
        if (nowTh) nowTh.scrollIntoView({ inline: 'center', block: 'nearest' });
      }, 30);
    }
    if (btn.dataset.panel === 'clockPanel') {
      ensureClockInit();
      updateClockPanel();
    }
  });
});

// ── Projection switcher ───────────────────────────────────────────────
document.querySelectorAll('.term-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.term === state.map.term || state.map.isTermTransitioning) return;
    document.querySelectorAll('.term-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    transitionToTerm(btn.dataset.term);
  });
});

document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.proj === state.map.proj || state.map.isTransitioning) return;
    document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    transitionToProjection(btn.dataset.proj);
  });
});

// ── Settings modal ────────────────────────────────────────────────────
const modalBg = document.getElementById(DOM.modalBg);

function renderModalChips() {
  const chips = document.getElementById(DOM.selectedChips);
  const sorted = ALL_CITIES
    .filter(c => state.selection.selected.includes(c.id))
    .sort((a, b) => getUTCOffsetHours(a.tz) - getUTCOffsetHours(b.tz));
  chips.innerHTML = sorted.map(c =>
    `<span class="city-chip" data-id="${c.id}">${c.label} <span style="opacity:.6">×</span></span>`
  ).join('');
  chips.querySelectorAll('.city-chip').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      state.selection.selected = state.selection.selected.filter(x => x !== id);
      saveSelection();
      renderModalChips();
      renderModalCityList();
      renderTimeline();
      redrawCities();
      setTimeout(buildCompTable, 0);
    });
  });
}

function renderModalCityList() {
  const list = document.getElementById(DOM.cityList);
  let html = '';
  for (const cont of CITY_CATALOG) {
    html += `<div class="continent-hd">${cont.continent}</div>`;
    for (const nation of cont.countries) {
      html += `<div class="country-hd">${nation.country}</div>`;
      for (const city of nation.cities) {
        const sel = state.selection.selected.includes(city.id);
        html += `<div class="city-row${sel ? ' sel' : ''}" data-id="${city.id}">
          <span class="city-check">${sel ? '✓' : ''}</span>
          <span class="city-name">${city.label}</span>
          <span class="city-utc">${getUTCOffset(city.tz)}</span>
        </div>`;
      }
    }
  }
  list.innerHTML = html;
  list.querySelectorAll('.city-row').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (state.selection.selected.includes(id)) {
        state.selection.selected = state.selection.selected.filter(x => x !== id);
      } else {
        state.selection.selected.push(id);
      }
      saveSelection();
      renderModalChips();
      renderModalCityList();
      renderTimeline();
      redrawCities();
      setTimeout(buildCompTable, 0);
    });
  });
}

function openModal() {
  renderModalChips();
  renderModalCityList();
  modalBg.classList.add('open');
}

document.getElementById(DOM.settingsBtn).addEventListener('click', openModal);
document.getElementById(DOM.wpCityBtn).addEventListener('click', openModal);
document.getElementById(DOM.modalDone).addEventListener('click', () => modalBg.classList.remove('open'));
modalBg.addEventListener('click', e => { if (e.target === modalBg) modalBg.classList.remove('open'); });

// ── Map ───────────────────────────────────────────────────────────────
let projection, geoPath, svg, worldData;
const TROPIC_LAT = 23.436;

// Fixed viewBox: 960×540 = 16:9
// Mercator at this scale shows ±70° lat (world width=960px, ±270px height → ±70°lat ≈ 16:9)
const VW = 960, VH = 540;

// ── Projection transition ──────────────────────────────────────────────
// Raw projection functions (D3 doesn't expose .raw on plugin projections)
function _rawNaturalEarth(λ, φ) {
  const p2 = φ*φ, p4 = p2*p2;
  return [
    λ * (0.8707 - 0.131979*p2 + p4*(-0.013791 + 0.003971*p2 - 0.001529*p4)),
    φ * (1.007226 + p2*(0.015085 + p4*(-0.044475 + 0.028874*p2 - 0.005916*p4)))
  ];
}
function _rawBraun(λ, φ) {
  // Cylindrical Stereographic, parallel=0: x=λ, y=2·tan(φ/2)
  return [λ, 2 * Math.tan(φ / 2)];
}

function buildBlendedProjection(t) {
  const neScale = Math.min(VW/6.3, VH/3.2);
  const brScale = VH / 4;
  const rawA  = state.map.proj === 'naturalEarth' ? _rawNaturalEarth : _rawBraun;
  const rawB  = state.map.proj === 'naturalEarth' ? _rawBraun : _rawNaturalEarth;
  const scaleA = state.map.proj === 'naturalEarth' ? neScale : brScale;
  const scaleB = state.map.proj === 'naturalEarth' ? brScale : neScale;
  const rawBlend = (λ, φ) => {
    const a = rawA(λ, φ), b = rawB(λ, φ);
    return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
  };
  return d3.geoProjection(rawBlend)
    .scale(scaleA + (scaleB - scaleA) * t)
    .translate([VW/2, VH/2])
    .rotate([state.map.rotation, 0]);
}

function updateDateLine(proj, gp) {
  const dl = svg.select('.date-line');
  if (dl.empty()) return;
  dl.attr('d', gp);

  const fmtDate = tz => new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz, month: 'numeric', day: 'numeric', weekday: 'short'
  }).format(new Date());
  const westDate = fmtDate('Pacific/Fiji');       // UTC+12, west of IDL (later date)
  const eastDate = fmtDate('Pacific/Pago_Pago');  // UTC-11, east of IDL (earlier date)

  // Build projected path strings along offset longitudes (north→south so text reads top-down)
  function buildPath(lon) {
    const pts = [];
    for (let lat = 75; lat >= -75; lat -= 3) {
      const pt = proj([lon, lat]);
      if (pt) pts.push(pt);
    }
    if (pts.length < 2) return '';
    return 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
  }

  svg.select('#idl-west-path').attr('d', buildPath(176));
  svg.select('#idl-east-path').attr('d', buildPath(-176));
  svg.select('.date-label-west textPath').text(westDate);
  svg.select('.date-label-east textPath').text(eastDate);
}

// Extract shared polygon edges between two timezone zone buckets → MultiLineString
function computeMidnightBoundaryGeo(zoneToday, zoneYest) {
  function getEdges(zoneVal) {
    const edges = new Map();
    state.map.tzBoundaryData.features.forEach(f => {
      if (Math.round(f.properties.zone) !== zoneVal) return;
      const geom = f.geometry;
      const polys = geom.type === 'Polygon'      ? [geom.coordinates]      :
                    geom.type === 'MultiPolygon' ? geom.coordinates        : [];
      polys.forEach(poly => {
        poly.forEach(ring => {
          for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i], b = ring[i+1];
            const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
            const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
            edges.set(key, [a, b]);
          }
        });
      });
    });
    return edges;
  }
  const edgesToday = getEdges(zoneToday);
  const edgesYest  = getEdges(zoneYest);
  const shared = [];
  edgesToday.forEach((seg, key) => { if (edgesYest.has(key)) shared.push(seg); });
  return shared.length ? { type:'MultiLineString', coordinates: shared } : null;
}

function updateMidnightLine(proj, gp) {
  const ml = svg.select('.midnight-line');
  if (ml.empty()) return;

  const now = new Date();
  const UTC_H = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
  let midLon = ((-UTC_H * 15) % 360 + 360) % 360;
  if (midLon > 180) midLon -= 360;

  // Integer zone buckets: zoneToday just crossed midnight, zoneYest hasn't yet
  // Math.ceil is correct: e.g. midLon=-55.75 → ceil(-3.717)=-3 (UTC-3 just past midnight)
  // Math.round would give -4 (wrong). ceil works for all UTC_H including >12h.
  const zoneToday = Math.ceil(midLon / 15);
  const zoneYest  = zoneToday - 1;

  // Try real timezone boundary; fall back to smooth meridian
  let lineGeo = state.map.tzBoundaryData ? computeMidnightBoundaryGeo(zoneToday, zoneYest) : null;
  if (!lineGeo) {
    const pts = [];
    for (let lat = -85; lat <= 85; lat++) pts.push([midLon, lat]);
    lineGeo = { type:'LineString', coordinates: pts };
  }
  ml.datum(lineGeo).attr('d', gp);

  // Date labels: east side = new day, west side = yesterday
  const offsetH = midLon / 15;
  const days = ['日','一','二','三','四','五','六'];
  function fmtMl(d) {
    return `${d.getUTCMonth()+1}/${d.getUTCDate()} 周${days[d.getUTCDay()]}`;
  }
  const eastStr = fmtMl(new Date(Date.now() + (offsetH + 1/60) * 3600000));
  const westStr = fmtMl(new Date(Date.now() + (offsetH - 1/60) * 3600000));

  // Same approach as IDL labels: project a meridian arc at midLon ± offset,
  // flowing north→south so textPath text reads top-to-bottom (matching IDL style).
  function buildMlPath(lon) {
    const pts = [];
    for (let lat = 75; lat >= -75; lat -= 3) {
      const pt = proj([lon, lat]);
      if (pt) pts.push(pt[0].toFixed(1) + ',' + pt[1].toFixed(1));
    }
    return pts.length >= 2 ? 'M' + pts.join('L') : '';
  }
  svg.select('#ml-west-path').attr('d', buildMlPath(midLon - 4));
  svg.select('#ml-east-path').attr('d', buildMlPath(midLon + 4));
  svg.select('.midnight-label-west textPath').text(westStr);
  svg.select('.midnight-label-east textPath').text(eastStr);
}

function applyProjectionToPaths(proj, gp) {
  svg.select('.ocean').attr('d', gp);
  svg.select('.graticule').attr('d', gp);
  svg.select('.land').attr('d', gp);
  svg.selectAll('.polar-land').attr('d', gp);
  svg.selectAll('.tz-line').attr('d', gp);
  svg.select('.equator').attr('d', gp);
  svg.selectAll('.tropic').attr('d', gp);
  // Update geographic line label positions
  const lblData = [
    {lat: 0, name: '赤道'},
    {lat: TROPIC_LAT, name: '北回归线'},
    {lat: -TROPIC_LAT, name: '南回归线'}
  ];
  svg.selectAll('.geo-line-label').each(function() {
    const dataName = this.getAttribute('data-name');
    if (!dataName) return;
    let lat, offset = 0;
    if (dataName.endsWith('-future')) {
      // Date on left (comes first), shifted left by 9 chars total
      const name = dataName.slice(0, -7);
      const entry = lblData.find(e => e.name === name);
      if (!entry) return;
      lat = entry.lat;
      offset = -51;
    } else {
      // Name on right (after date)
      const entry = lblData.find(e => e.name === dataName);
      if (!entry) return;
      lat = entry.lat;
      offset = -51 + 45;
    }
    const pt = proj([165, lat]);
    if (pt) d3.select(this).attr('x', pt[0]+offset).attr('y', pt[1]);
  });
  updateDateLine(proj, gp);
  updateMidnightLine(proj, gp);
}

function rotateMapTo(lon) {
  if (state.map.isRotating || state.map.isTransitioning) return;
  state.map.isRotating = true;

  // Switch to map tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn[data-panel="mapPanel"]').classList.add('active');
  document.getElementById(DOM.mapPanel).classList.add('active');

  const fromRot = state.map.rotation;
  let toRot = -lon;
  // Shortest arc
  let delta = toRot - fromRot;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  toRot = fromRot + delta;

  const DURATION = 900;
  const startTime = performance.now();
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function frame(now) {
    const raw = Math.min((now - startTime) / DURATION, 1);
    const e = easeInOut(raw);
    state.map.rotation = fromRot + (toRot - fromRot) * e;

    projection = buildProjection();
    geoPath    = d3.geoPath(projection);
    applyProjectionToPaths(projection, geoPath);
    drawNight();
    redrawCities();

    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      state.map.rotation = toRot;
      state.map.isRotating  = false;
      saveMapState();
    }
  }
  requestAnimationFrame(frame);
}

function transitionToTerm(targetTerm) {
  state.map.isTermTransitioning = true;
  document.querySelectorAll('.term-btn').forEach(b => b.disabled = true);

  const fromSimple  = state.map.termSimpleOpacity;
  const fromNatural = state.map.termNaturalOpacity;
  const toSimple    = targetTerm === 'simple'  ? 1 : 0;
  const toNatural   = targetTerm === 'natural' ? 1 : 0;

  // Rebuild both groups at their current opacities, then animate
  drawNight();

  const DURATION = 500;
  const startTime = performance.now();
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function frame(now) {
    const raw = Math.min((now - startTime) / DURATION, 1);
    const e   = easeInOut(raw);
    state.map.termSimpleOpacity  = fromSimple  + (toSimple  - fromSimple)  * e;
    state.map.termNaturalOpacity = fromNatural + (toNatural - fromNatural) * e;

    svg.select('.term-simple-grp').attr('opacity', state.map.termSimpleOpacity);
    svg.select('.term-natural-grp').attr('opacity', state.map.termNaturalOpacity);

    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      state.map.term = targetTerm;
      state.map.isTermTransitioning = false;
      document.querySelectorAll('.term-btn').forEach(b => b.disabled = false);
      saveMapState();
    }
  }
  requestAnimationFrame(frame);
}

function transitionToProjection(targetName) {
  state.map.isTransitioning = true;
  document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(b => b.disabled = true);

  const DURATION = 700;
  const startTime = performance.now();
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function frame(now) {
    const raw = Math.min((now - startTime) / DURATION, 1);

    if (raw < 1) {
      const e = easeInOut(raw);
      const blendedProj = buildBlendedProjection(e);
      const blendedPath = d3.geoPath(blendedProj);
      projection = blendedProj;
      geoPath    = blendedPath;
      applyProjectionToPaths(blendedProj, blendedPath);
      drawNight();
      redrawCities();
      requestAnimationFrame(frame);
    } else {
      // Final frame: use official projection directly — no blended draw first
      state.map.proj = targetName;
      projection  = buildProjection();
      geoPath     = d3.geoPath(projection);
      applyProjectionToPaths(projection, geoPath);
      drawNight();
      redrawCities();
      state.map.isTransitioning = false;
      document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(b => b.disabled = false);
      saveMapState();
    }
  }
  requestAnimationFrame(frame);
}

function buildProjection() {
  if (state.map.proj === 'braun') {
    return d3.geoCylindricalStereographic()
      .parallel(0)
      .scale(VH / 4)
      .translate([VW/2, VH/2])
      .rotate([state.map.rotation, 0]);
  }
  return d3.geoNaturalEarth1()
    .scale(Math.min(VW/6.3, VH/3.2))
    .translate([VW/2, VH/2])
    .rotate([state.map.rotation, 0]);
}

async function initMap() {
  svg = d3.select('#mapSvg');
  svg.selectAll('*').remove();

  projection = buildProjection();
  geoPath    = d3.geoPath(projection);

  // 1. Ocean (sphere)
  svg.append('path')
    .datum({type:'Sphere'})
    .attr('d', geoPath)
    .attr('class','ocean');

  // 2. Graticule
  svg.append('path')
    .datum(d3.geoGraticule10())
    .attr('d', geoPath)
    .attr('class','graticule');

  // 3. Land
  if (!worldData) {
    try {
      worldData = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    } catch(e) { console.warn('World atlas load failed', e); }
  }
  if (worldData) {
    const land = topojson.feature(worldData, worldData.objects.land);
    svg.append('path').datum(land).attr('d', geoPath).attr('class','land');

    // Draw Antarctica in white using the country feature (avoids polar winding issues)
    if (worldData.objects.countries) {
      const allCountries = topojson.feature(worldData, worldData.objects.countries);
      const antarctica = allCountries.features.find(f =>
        f.id === '010' || f.id === 10 ||
        (f.properties && (f.properties.ISO_A3 === 'ATA' ||
                          f.properties.iso_a3 === 'ATA' ||
                          f.properties.name === 'Antarctica'))
      );
      if (antarctica) {
        svg.append('path').datum(antarctica).attr('d', geoPath).attr('class','polar-land');
      }
    }
  }

  // 4. Timezone boundary lines (real political boundaries, or meridian fallback)
  if (state.map.tzBoundaryData) {
    state.map.tzBoundaryData.features.forEach(feature => {
      svg.append('path').datum(feature).attr('d', geoPath).attr('class','tz-line');
    });
  } else {
    for (let lon = -165; lon <= 165; lon += 15) {
      const pts = [];
      for (let lat = -89; lat <= 89; lat += 1) pts.push([lon, lat]);
      svg.append('path')
        .datum({type:'LineString', coordinates: pts})
        .attr('d', geoPath).attr('class','tz-line');
    }
  }

  // 5. Geographic reference lines (BELOW night shadow)
  function latLine(lat) {
    const pts = [];
    for (let lo = -180; lo <= 180; lo += 1) pts.push([lo, lat]);
    return { type:'LineString', coordinates: pts };
  }
  svg.append('path').datum(latLine(0))            .attr('d', geoPath).attr('class','equator');
  svg.append('path').datum(latLine( TROPIC_LAT))  .attr('d', geoPath).attr('class','tropic');
  svg.append('path').datum(latLine(-TROPIC_LAT))  .attr('d', geoPath).attr('class','tropic');

  // 5b. Geographic line labels with solar declination dates
  const lblG = svg.append('g');
  const sunDates = [
    {lat: 0, name: '赤道', past: '2026/3/20', future: '2026/9/22'},
    {lat: TROPIC_LAT, name: '北回归线', past: '2025/6/21', future: '2026/6/21'},
    {lat: -TROPIC_LAT, name: '南回归线', past: '2025/12/21', future: '2026/12/21'}
  ];
  sunDates.forEach(({lat, name, future}) => {
    const pt = projection([165, lat]);
    if (!pt) return;
    // Future date (faded, smaller, left side) — shifted left by 9 chars total
    lblG.append('text').attr('x', pt[0]-51).attr('y', pt[1])
      .attr('class','geo-line-label geo-line-date').attr('fill-opacity', 0.35)
      .attr('data-name', `${name}-future`).text(future);
    // Object name (normal, right after date)
    lblG.append('text').attr('x', pt[0]-51+45).attr('y', pt[1])
      .attr('class','geo-line-label').attr('data-name', name).text(name);
  });

  // 6. Night layer (terminator shadow only)
  svg.append('g').attr('id','night-layer');

  // 7. IDL + dynamic midnight line (ABOVE night shadow)
  const dlPts = [];
  for (let lat = -85; lat <= 85; lat++) dlPts.push([180, lat]);
  svg.append('path')
    .datum({type:'LineString', coordinates: dlPts})
    .attr('d', geoPath)
    .attr('class','date-line');
  const svgDefs = svg.append('defs');
  svgDefs.append('path').attr('id','idl-west-path');
  svgDefs.append('path').attr('id','idl-east-path');
  svgDefs.append('path').attr('id','ml-west-path');
  svgDefs.append('path').attr('id','ml-east-path');
  // Sun core gradient
  const sunGrad = svgDefs.append('radialGradient').attr('id','sun-core-grad')
    .attr('cx','38%').attr('cy','35%').attr('r','65%');
  sunGrad.append('stop').attr('offset','0%').attr('stop-color','#FFFDE7');
  sunGrad.append('stop').attr('offset','45%').attr('stop-color','#FDE68A');
  sunGrad.append('stop').attr('offset','100%').attr('stop-color','#F59E0B');
  svg.append('text').attr('class','date-label date-label-west')
    .append('textPath').attr('href','#idl-west-path').attr('startOffset','50%').attr('text-anchor','middle');
  svg.append('text').attr('class','date-label date-label-east')
    .append('textPath').attr('href','#idl-east-path').attr('startOffset','50%').attr('text-anchor','middle');
  updateDateLine(projection, geoPath);

  svg.append('path').attr('class','midnight-line');
  svg.append('text').attr('class','midnight-label midnight-label-west')
    .append('textPath').attr('href','#ml-west-path').attr('startOffset','50%').attr('text-anchor','middle');
  svg.append('text').attr('class','midnight-label midnight-label-east')
    .append('textPath').attr('href','#ml-east-path').attr('startOffset','50%').attr('text-anchor','middle');
  updateMidnightLine(projection, geoPath);

  // 8. Moon track layer (ABOVE IDL/midnight line)
  svg.append('g').attr('id','moon-track-layer');

  // 9. Solar bodies layer – sun + moon icons (ABOVE moon track)
  svg.append('g').attr('id','solar-bodies-layer');

  // 10. Cities layer (always on top)
  svg.append('g').attr('id','cities-layer');

  drawNight();
  redrawCities();
}

// Draw sun icon in SVG (g element)
function drawSunIcon(g, x, y) {
  const sunG = g.append('g')
    .attr('transform', `translate(${x},${y})`)
    .attr('class','sun-marker');

  // Outer soft glow ring
  sunG.append('circle').attr('r', 17)
    .attr('fill','#FDB813').attr('opacity', 0.12);
  sunG.append('circle').attr('r', 12)
    .attr('fill','#FDE68A').attr('opacity', 0.18);

  // 16 alternating long/short rays
  for (let i = 0; i < 16; i++) {
    const a = (i * 22.5) * Math.PI/180;
    const isMain = i % 2 === 0;
    const r1 = isMain ? 9.5 : 8.5;
    const r2 = isMain ? 15  : 12;
    sunG.append('line')
      .attr('x1', Math.cos(a)*r1).attr('y1', Math.sin(a)*r1)
      .attr('x2', Math.cos(a)*r2).attr('y2', Math.sin(a)*r2)
      .attr('stroke', isMain ? '#F59E0B' : '#FCD34D')
      .attr('stroke-width', isMain ? 1.8 : 1.1)
      .attr('stroke-linecap','round');
  }

  // Core circle with radial gradient
  sunG.append('circle').attr('r', 7.5)
    .attr('fill','url(#sun-core-grad)')
    .attr('stroke','#D97706').attr('stroke-width', 0.7);
}

function drawMoonIcon(parent, x, y, phase) {
  const r  = 7;
  const HR = r * 2.3;  // halo radius (proportional)
  const g  = parent.append('g').attr('transform',`translate(${x},${y})`).attr('class','moon-marker');

  const LIT = '#eef4ff';
  const STR = '#d0e4f8';

  const isNew  = phase < 0.06 || phase > 0.94;
  const isFull = Math.abs(phase - 0.5) < 0.02;

  if (isNew) {
    // 新月：仅淡轮廓，无月晕
    g.append('circle').attr('r', r).attr('fill','none').attr('stroke', STR).attr('stroke-width', 1.0).attr('opacity', 0.6);
    return;
  }

  // ── 月晕 — 纯漫射光，无外圈描边 ──────────────────────────────────────
  g.append('circle').attr('r', HR + 7).attr('fill','rgba(180,215,255,0.04)');
  g.append('circle').attr('r', HR + 4).attr('fill','rgba(185,218,255,0.06)');
  g.append('circle').attr('r', HR    ).attr('fill','rgba(190,220,255,0.09)');
  g.append('circle').attr('r', HR - 3).attr('fill','rgba(195,222,255,0.06)');
  // Corona close to disc
  g.append('circle').attr('r', r + 6).attr('fill','rgba(215,232,255,0.16)');
  g.append('circle').attr('r', r + 4).attr('fill','rgba(218,234,255,0.20)');
  g.append('circle').attr('r', r + 2).attr('fill','rgba(238,244,255,0.22)');

  if (isFull) {
    g.append('circle').attr('r', r).attr('fill', LIT).attr('stroke', STR).attr('stroke-width', 0.8);
    return;
  }

  // ── 月相 — 镂空暗面 + 亮面叠加 ───────────────────────────────────────
  const uid = `moon-clip-${Math.random().toString(36).slice(2,8)}`;
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.insert('defs', ':first-child');
  defs.append('clipPath').attr('id', uid).append('circle').attr('r', r);

  // 轮廓（镂空暗面）
  g.append('circle').attr('r', r).attr('fill','none').attr('stroke', STR).attr('stroke-width', 1.0);

  // 亮面
  const ex = r * Math.abs(Math.cos(2 * Math.PI * phase));
  let d;
  if (phase < 0.5) {
    const sw = phase < 0.25 ? 0 : 1;
    d = `M 0,${-r} A ${r},${r} 0 0,1 0,${r} A ${ex},${r} 0 0,${sw} 0,${-r} Z`;
  } else {
    const sw = phase < 0.75 ? 0 : 1;
    d = `M 0,${-r} A ${r},${r} 0 0,0 0,${r} A ${ex},${r} 0 0,${sw} 0,${-r} Z`;
  }
  g.append('path').attr('d', d).attr('fill', LIT).attr('stroke','none').attr('clip-path',`url(#${uid})`);
}

function drawNight() {
  if (!svg || !geoPath) return;
  const solar = solarPosition();

  let nightLon = solar.lon + 180;
  if (nightLon > 180) nightLon -= 360;
  const nightCenter = [nightLon, -solar.lat];

  const nightLayer = svg.select('#night-layer');
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.insert('defs', ':first-child');

  const gc = r => d3.geoCircle().center(nightCenter).radius(r)();
  const nightCircle = gc(90);
  const nightPathStr = geoPath(nightCircle);

  // ── During projection transition: update in-place, no DOM rebuild ────────
  if ((state.map.isTransitioning || state.map.isRotating) && !nightLayer.select('.term-simple-grp').empty()) {
    defs.select('#clip-sphere path').attr('d', geoPath({type:'Sphere'}));
    if (nightPathStr) {
      defs.select('#clip-dayside path')
        .attr('d', `M0,0H${VW}V${VH}H0Z${nightPathStr}`);
    }
    nightLayer.select('.term-simple-grp').selectAll('path').attr('d', nightPathStr);
    nightLayer.select('.term-natural-grp').selectAll('path').attr('d', nightPathStr);
    nightLayer.select('.term-natural-grp path:first-child')
      .attr('clip-path', nightPathStr ? 'url(#clip-dayside)' : null);

    const solarBodiesLayer = svg.select('#solar-bodies-layer');
    const moonTrackLayer   = svg.select('#moon-track-layer');
    const solarPt = projection([solar.lon, solar.lat]);
    if (solarPt) solarBodiesLayer.select('.sun-marker')
      .attr('transform', `translate(${solarPt[0]},${solarPt[1]})`);
    const moon = moonPosition();
    const moonPt = projection([moon.lon, moon.lat]);
    if (moonPt) solarBodiesLayer.select('.moon-marker')
      .attr('transform', `translate(${moonPt[0]},${moonPt[1]})`);
    // Re-project moon track dots to follow map rotation
    moonTrackLayer.selectAll('.moon-track-grp circle').each(function() {
      const el = d3.select(this);
      const pt = projection([+el.attr('data-lon'), +el.attr('data-lat')]);
      if (pt) el.attr('cx', pt[0]).attr('cy', pt[1]).attr('visibility', 'visible');
      else el.attr('visibility', 'hidden');
    });
    return;
  }

  // ── Full rebuild ──────────────────────────────────────────────────────────
  nightLayer.selectAll('*').remove();
  svg.select('#solar-bodies-layer').selectAll('*').remove();
  svg.select('#moon-track-layer').selectAll('*').remove();
  defs.selectAll('#clip-sphere,#clip-dayside,#blur-glow').remove();

  defs.append('clipPath').attr('id','clip-sphere')
    .append('path').attr('d', geoPath({type:'Sphere'}));
  nightLayer.attr('clip-path','url(#clip-sphere)');

  // ── Simple group ──
  const simpleGrp = nightLayer.append('g').attr('class','term-simple-grp')
    .attr('opacity', state.map.termSimpleOpacity);
  simpleGrp.append('path').datum(nightCircle).attr('d', geoPath)
    .attr('fill','#1e2f5c').attr('opacity', 0.30);
  simpleGrp.append('path').datum(nightCircle).attr('d', geoPath)
    .attr('fill','none').attr('stroke','#4a7fc0').attr('stroke-width', 1.2).attr('opacity', 0.65);

  // ── Natural group ──
  defs.append('filter').attr('id','blur-glow')
    .attr('x','-20%').attr('y','-20%').attr('width','140%').attr('height','140%')
    .append('feGaussianBlur').attr('stdDeviation', 16);
  if (nightPathStr) {
    defs.append('clipPath').attr('id','clip-dayside')
      .append('path')
      .attr('d', `M0,0H${VW}V${VH}H0Z${nightPathStr}`)
      .attr('clip-rule','evenodd');
  }
  const naturalGrp = nightLayer.append('g').attr('class','term-natural-grp')
    .attr('opacity', state.map.termNaturalOpacity);
  naturalGrp.append('path').datum(nightCircle).attr('d', geoPath)
    .attr('fill','none').attr('stroke','#c04010').attr('stroke-width', 40)
    .attr('opacity', 0.22).attr('filter','url(#blur-glow)')
    .attr('clip-path', nightPathStr ? 'url(#clip-dayside)' : null);
  naturalGrp.append('path').datum(nightCircle).attr('d', geoPath)
    .attr('fill','#0b1438').attr('opacity', 0.28);

  const _solarBodiesLayer = svg.select('#solar-bodies-layer');
  const _moonTrackLayer   = svg.select('#moon-track-layer');

  const proj = projection([solar.lon, solar.lat]);
  if (proj) drawSunIcon(_solarBodiesLayer, proj[0], proj[1]);
  // ── Moon ground track ±12 h ──────────────────────────────────────────
  const _nowMs   = Date.now();
  const _STEP_MS = 20 * 60 * 1000;
  const _STEPS   = 36;

  const trackGrp = _moonTrackLayer.append('g').attr('class', 'moon-track-grp');
  // Opacity gradient: brightest near "now", fading symmetrically to both ends
  const _opMax = 0.80, _opMin = 0.10;
  const _opFor = i => _opMin + (_opMax - _opMin) * ((_STEPS - i) / (_STEPS - 1));

  // Past track dots (oldest → newest, fading away from moon)
  for (let i = _STEPS; i >= 1; i--) {
    const pos = moonPositionAt(_nowMs - i * _STEP_MS);
    const pt  = projection([pos.lon, pos.lat]);
    if (!pt) continue;
    trackGrp.append('circle')
      .attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 1.5)
      .attr('fill', `rgba(238,244,255,${_opFor(i).toFixed(2)})`)
      .attr('class', 'moon-track-past-dot')
      .attr('data-lon', pos.lon).attr('data-lat', pos.lat);
  }
  // Future track dots (nearest → farthest, fading away from moon)
  for (let i = 1; i <= _STEPS; i++) {
    const pos = moonPositionAt(_nowMs + i * _STEP_MS);
    const pt  = projection([pos.lon, pos.lat]);
    if (!pt) continue;
    trackGrp.append('circle')
      .attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 1.5)
      .attr('fill', `rgba(238,244,255,${_opFor(i).toFixed(2)})`)
      .attr('class', 'moon-track-future-dot')
      .attr('data-lon', pos.lon).attr('data-lat', pos.lat);
  }

  const moon = moonPosition();
  const moonProj = projection([moon.lon, moon.lat]);
  if (moonProj) drawMoonIcon(_solarBodiesLayer, moonProj[0], moonProj[1], moonPhase());
}

function redrawCities() {
  if (!svg || !projection) return;

  const svgEl = document.getElementById(DOM.mapSvg);
  const citiesLayerEl = svgEl.querySelector('#cities-layer');
  if (citiesLayerEl) svgEl.appendChild(citiesLayerEl);

  const g = svg.select('#cities-layer');
  g.selectAll('*').remove();

  // Render all cities as gray background dots
  ALL_CITIES.forEach(c => {
    const p = projection([c.lon, c.lat]);
    if (!p) return;
    g.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 0.9).attr('class', 'city-dot-bg');
  });

  const cities = ALL_CITIES.filter(c => state.selection.selected.includes(c.id));

  // Project cities
  const pts = cities.map(c => {
    const p = projection([c.lon, c.lat]);
    return p ? { city: c, cx: p[0], cy: p[1] } : null;
  }).filter(Boolean);

  // Estimate label bounding box width (Chinese ~9px/char at font-size 9px)
  function lblW(text) { return text.length * 9 + 6; }
  const LH = 22; // height for two-line label block

  // Obstacle list starts with all city dots
  const boxes = pts.map(({ cx, cy }) => ({ x: cx-6, y: cy-6, w: 12, h: 12 }));

  // Candidate angles (degrees) and distances to try for each label
  const ANGLES = [0, -35, 35, -70, 70, 110, -110, 145, -145, 180, -20, 20, 90, -90];
  const DISTS  = [14, 22, 32, 44];

  const results = [];
  pts.forEach(({ city, cx, cy }) => {
    const lw = lblW(city.label);
    let best = { dx: 8, dy: -4, right: true }, bestScore = Infinity;

    for (const dist of DISTS) {
      for (const adeg of ANGLES) {
        const rad = adeg * Math.PI / 180;
        const dx = Math.cos(rad) * dist;
        const dy = Math.sin(rad) * dist;
        const right = dx >= 0;
        // Bounding box: text-anchor start → box starts at cx+dx; end → box ends at cx+dx
        const bx = right ? cx + dx : cx + dx - lw;
        const by = cy + dy - LH / 2;
        const box = { x: bx, y: by, w: lw, h: LH };

        let score = 0;
        for (const b of boxes) {
          if (box.x < b.x+b.w && box.x+box.w > b.x && box.y < b.y+b.h && box.y+box.h > b.y)
            score += 10;
        }
        score += dist * 0.04;          // prefer closer
        if (right) score -= 0.5;       // prefer right side

        if (score < bestScore) { bestScore = score; best = { dx, dy, right, bx, by, lw }; }
      }
    }

    // Commit bounding box of chosen label
    boxes.push({ x: best.bx, y: best.by, w: best.lw, h: LH });
    results.push({ city, cx, cy, ...best });
  });

  // Render: leader line → dot → text (dot on top of line)
  results.forEach(({ city, cx, cy, dx, dy, right }) => {
    const grp = g.append('g').attr('class', 'city-grp');
    const tx = cx + dx, ty = cy + dy;
    const dist = Math.hypot(dx, dy);

    // Leader line (only when label is moved away from dot)
    if (dist > 10) {
      const ang = Math.atan2(dy, dx);
      const sx = cx + Math.cos(ang) * 5.5;   // start at dot edge
      const sy = cy + Math.sin(ang) * 5.5;
      const ex = right ? tx - 2 : tx + 2;    // end just before text
      grp.append('line').attr('x1', sx).attr('y1', sy)
        .attr('x2', ex).attr('y2', ty).attr('class', 'city-leader');
    }

    grp.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 2.8).attr('class', 'city-dot');

    const anchor = right ? 'start' : 'end';
    grp.append('text').attr('x', tx).attr('y', ty - 3)
      .attr('text-anchor', anchor).attr('class', 'city-name-lbl').text(city.label);
    grp.append('text').attr('x', tx).attr('y', ty + 7)
      .attr('text-anchor', anchor).attr('class', 'city-time-lbl')
      .attr('data-tz', city.tz).text(localTimeStr(city.tz));
  });
}

function updateMapTimes() {
  if (!svg) return;
  svg.selectAll('[data-tz]').each(function() {
    const el = d3.select(this);
    el.text(localTimeStr(el.attr('data-tz')));
  });
  drawNight();
  // Keep cities on top after night redraws
  const svgEl = document.getElementById(DOM.mapSvg);
  const cl = svgEl.querySelector('#cities-layer');
  if (cl) svgEl.appendChild(cl);
}

// ── Timeline ──────────────────────────────────────────────────────────

const HALF_WINDOW_MS = 2.5 * 86400000; // ±2.5 days, 5 days total, NOW at center

// Build collab gradient: green=all in 09-18, amber=partial, gray=none
function buildCollabGradient(tzList, startMs, totalMs) {
  const N = 300, stops = [];
  for (let i = 0; i <= N; i++) {
    const t = startMs + (i / N) * totalMs;
    const n = tzList.filter(tz => { const h = getHourMinute(tz, t); return h >= 9 && h < 18; }).length;
    const r = n / tzList.length;
    const c = r >= 1 ? '#7ec87e' : r > 0 ? '#f5dfa0' : '#e4e6e9';
    stops.push(`${c} ${(i / N * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right,${stops.join(',')})`;
}

// Find contiguous time windows where condition holds; stepMs granularity
function findCollabWindows(tzList, startMs, endMs, needAll, stepMs = 60000) {
  const wins = [];
  let ws = null;
  for (let t = startMs; t <= endMs; t += stepMs) {
    const n = tzList.filter(tz => { const h = getHourMinute(tz, t); return h >= 9 && h < 18; }).length;
    const ok = needAll ? n === tzList.length : n > 0;
    if (ok && ws === null) ws = t;
    if (!ok && ws !== null) { wins.push([ws, t - stepMs]); ws = null; }
  }
  if (ws !== null) wins.push([ws, endMs]);
  return wins;
}

// fmtHHMM 已移到 src/core/time-utils.js

function renderTimeline() {
  const panel = document.getElementById(DOM.timelinePanel);
  panel.innerHTML = '';

  const cities = ALL_CITIES
    .filter(c => state.selection.selected.includes(c.id))
    .sort((a,b) => getUTCOffsetHours(b.tz) - getUTCOffsetHours(a.tz));

  const nowMs   = Date.now();
  const startMs = nowMs - HALF_WINDOW_MS;
  const totalMs = 2 * HALF_WINDOW_MS;

  // ── 协作窗口 bar ──────────────────────────────────────────────────────
  // pinned 城市（且在 state.selection.selected 中）用于协作计算；无 pin 时退化为全部
  const collabCities = cities.filter(c => state.selection.pinned.includes(c.id));
  const collabSrc    = collabCities.length >= 2 ? collabCities : cities;

  if (collabSrc.length >= 2) {
    const tzList = collabSrc.map(c => c.tz);
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Bar row (same layout as city rows)
    const cRow = document.createElement('div');
    cRow.className = 'tl-row';
    cRow.style.marginBottom = '6px';

    const cInfo = document.createElement('div');
    cInfo.className = 'tl-city';
    const collabLabel = collabCities.length >= 2 ? `置顶 ${collabCities.length} 城市` : '全部城市';
    cInfo.innerHTML = `<div class="tl-city-text">
      <div class="tl-city-name" style="color:#1a7a2a">协作窗口</div>
      <div class="tl-utc">${collabLabel}</div></div>`;
    cRow.appendChild(cInfo);

    const cTrack = document.createElement('div');
    cTrack.className = 'tl-track';

    const cBg = document.createElement('div');
    cBg.className = 'tl-track-bg';
    cBg.style.background = buildCollabGradient(tzList, startMs, totalMs);
    cTrack.appendChild(cBg);

    // Day separators (local timezone)
    for (let d = -4; d <= 4; d++) {
      const ms = localDayStartMs(localTz, d);
      if (ms > startMs && ms < startMs + totalMs) {
        const sep = document.createElement('div');
        sep.className = 'tl-day-sep';
        sep.style.left = `${(ms - startMs) / totalMs * 100}%`;
        cTrack.appendChild(sep);
      }
    }
    const cNow = document.createElement('div');
    cNow.className = 'tl-now-line';
    cTrack.appendChild(cNow);

    cRow.appendChild(cTrack);
    panel.appendChild(cRow);

    // Summary card: find today's full-overlap windows
    const todayStart = localDayStartMs(localTz, 0);
    const todayEnd   = localDayStartMs(localTz, 1);
    const fullWins   = findCollabWindows(tzList, todayStart, todayEnd, true);

    const card = document.createElement('div');
    card.className = 'collab-summary-card';

    if (fullWins.length > 0) {
      const chips = fullWins.map(([s, e]) =>
        `<span class="collab-chip">${fmtHHMM(localTz, s)}–${fmtHHMM(localTz, e)}</span>`
      ).join('');
      card.innerHTML = `今日全员在线 ${chips}`;
    } else {
      // Find the peak overlap count
      let peak = 0;
      for (let t = todayStart; t <= todayEnd; t += 60000) {
        const n = tzList.filter(tz => { const h = getHourMinute(tz, t); return h >= 9 && h < 18; }).length;
        if (n > peak) peak = n;
      }
      if (peak === 0) {
        card.classList.add('no-overlap');
        card.innerHTML = '今日无任何城市处于工作时间重叠';
      } else {
        card.classList.add('partial');
        const partWins = findCollabWindows(tzList, todayStart, todayEnd, false);
        const chips = partWins.map(([s, e]) =>
          `<span class="collab-chip" style="background:#fff8e1;color:#8a6000">${fmtHHMM(localTz, s)}–${fmtHHMM(localTz, e)}</span>`
        ).join('');
        card.innerHTML = `今日无全员重叠，最多 <b>${peak}/${tzList.length}</b> 城市同时在线 ${chips}`;
      }
    }

    // Legend
    const legend = document.createElement('div');
    legend.className = 'collab-legend';
    legend.innerHTML = `
      <span><span class="collab-ld" style="background:#7ec87e"></span>全员在线</span>
      <span><span class="collab-ld" style="background:#f5dfa0"></span>部分重叠</span>
      <span><span class="collab-ld" style="background:#e4e6e9"></span>无重叠</span>`;
    card.appendChild(legend);
    panel.appendChild(card);
  }

  // Sort: pinned first (by UTC desc within each group), then unpinned
  const pinnedCities   = cities.filter(c =>  state.selection.pinned.includes(c.id));
  const unpinnedCities = cities.filter(c => !state.selection.pinned.includes(c.id));
  const sortedCities   = [...pinnedCities, ...unpinnedCities];
  let sepInserted = false;

  sortedCities.forEach((city, idx) => {
    // Separator between pinned and unpinned groups
    if (!sepInserted && pinnedCities.length > 0 && !state.selection.pinned.includes(city.id)) {
      const sep = document.createElement('div');
      sep.className = 'tl-sep';
      sep.dataset.label = '其他城市';
      panel.appendChild(sep);
      sepInserted = true;
    }

    const row = document.createElement('div');
    row.className = 'tl-row' + (state.selection.pinned.includes(city.id) ? ' tl-pinned' : '');

    // Pin button + city info
    const info = document.createElement('div');
    info.className = 'tl-city';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'tl-pin-btn' + (state.selection.pinned.includes(city.id) ? ' pinned' : '');
    pinBtn.title = state.selection.pinned.includes(city.id) ? '取消置顶' : '置顶（加入协作计算）';
    pinBtn.textContent = state.selection.pinned.includes(city.id) ? '★' : '☆';
    pinBtn.addEventListener('click', () => {
      if (state.selection.pinned.includes(city.id)) {
        state.selection.pinned = state.selection.pinned.filter(id => id !== city.id);
      } else {
        state.selection.pinned.push(city.id);
      }
      savePinned();
      renderTimeline();
      buildCompTable();
    });

    const cityText = document.createElement('div');
    cityText.className = 'tl-city-text';
    cityText.innerHTML = `<div class="tl-city-name">${city.label}</div>
                          <div class="tl-utc">${getUTCOffset(city.tz)}</div>`;

    info.appendChild(pinBtn);
    info.appendChild(cityText);
    row.appendChild(info);

    const track = document.createElement('div');
    track.className = 'tl-track';

    // Gradient background centered on NOW
    const bg = document.createElement('div');
    bg.className = 'tl-track-bg';
    bg.style.background = buildGradientCentered(city.tz, nowMs, HALF_WINDOW_MS);
    track.appendChild(bg);

    // Find local midnights within the window
    const mids = [];
    for (let d = -4; d <= 4; d++) {
      const ms = localDayStartMs(city.tz, d);
      if (ms > startMs && ms < startMs + totalMs) mids.push(ms);
    }
    mids.sort((a,b) => a - b);

    // Day separators
    mids.forEach(ms => {
      const sep = document.createElement('div');
      sep.className = 'tl-day-sep';
      sep.style.left = `${(ms - startMs) / totalMs * 100}%`;
      track.appendChild(sep);
    });

    // Date labels: one per section between boundaries
    const bounds = [startMs, ...mids, startMs + totalMs];
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = bounds[i], e = bounds[i+1];
      const centerMs = (s + e) / 2;
      const isNow    = nowMs >= s && nowMs < e;
      const pct      = isNow ? 50 : (centerMs - startMs) / totalMs * 100;

      const lbl = document.createElement('div');
      lbl.className = 'tl-day-label';
      lbl.style.left = `${pct}%`;

      const dateStr = localDateLabel(city.tz, s); // s + 12h is sampled inside
      lbl.textContent = isNow ? `${dateStr} ${localTimeStr(city.tz)}` : dateStr;

      lbl.style.color = '#111';
      lbl.style.textShadow = '0 0 4px rgba(255,255,255,0.8)';
      track.appendChild(lbl);
    }

    // NOW line fixed at center
    const nowLine = document.createElement('div');
    nowLine.className = 'tl-now-line';
    track.appendChild(nowLine);

    row.dataset.lon = city.lon;

    row.appendChild(track);
    panel.appendChild(row);
  });
}


// ── Comparison Table ──────────────────────────────────────────────────
function buildCompTable() {
  try {
    const table = document.querySelector('#compPanel .comp-table');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const allCities = ALL_CITIES.filter(c => state.selection.selected.includes(c.id));
    const offsetMap = new Map(allCities.map(c => [c.id, getUTCOffsetHours(c.tz)]));
    const byUtcDesc = (a, b) => offsetMap.get(b.id) - offsetMap.get(a.id);

    if (!allCities.length) { thead.innerHTML = ''; tbody.innerHTML = ''; return; }

    // Sort: pinned first (UTC desc), then unpinned (UTC desc)
    const pinnedCities   = allCities.filter(c =>  state.selection.pinned.includes(c.id)).sort(byUtcDesc);
    const unpinnedCities = allCities.filter(c => !state.selection.pinned.includes(c.id)).sort(byUtcDesc);
    const refOffset = offsetMap.get((pinnedCities[0] || unpinnedCities[0]).id);

    // ── Header row: city col + 24 hour cols ──
    const htr = document.createElement('tr');
    const thCity = document.createElement('th');
    thCity.className = 'ct-city-col';
    thCity.textContent = '城市';
    htr.appendChild(thCity);
    for (let h = 0; h < 24; h++) {
      const th = document.createElement('th');
      th.textContent = String(h).padStart(2, '0');
      th.dataset.h = String(h);
      htr.appendChild(th);
    }
    thead.innerHTML = '';
    thead.appendChild(htr);

    // ── Body rows: one row per city ──
    tbody.innerHTML = '';
    const buildRow = (city, isPinned) => {
      const tr = document.createElement('tr');
      if (isPinned) tr.classList.add('ct-pinned');

      // City cell
      const tdCity = document.createElement('td');
      tdCity.className = 'ct-city-col';
      const cell = document.createElement('div');
      cell.className = 'ct-city-cell';
      const pinBtn = document.createElement('button');
      pinBtn.className = 'tl-pin-btn' + (isPinned ? ' pinned' : '');
      pinBtn.title = isPinned ? '取消置顶' : '置顶';
      pinBtn.textContent = isPinned ? '★' : '☆';
      pinBtn.addEventListener('click', () => {
        if (state.selection.pinned.includes(city.id)) {
          state.selection.pinned = state.selection.pinned.filter(id => id !== city.id);
        } else {
          state.selection.pinned.push(city.id);
        }
        savePinned();
        buildCompTable();
        renderTimeline();
      });
      const cityInfo = document.createElement('div');
      cityInfo.innerHTML = `<div class="th-city">${city.label}</div><div class="th-utc">${getUTCOffset(city.tz)}</div>`;
      cell.appendChild(pinBtn);
      cell.appendChild(cityInfo);
      tdCity.appendChild(cell);
      tr.appendChild(tdCity);

      // 24 time cells
      for (let h = 0; h < 24; h++) {
        const diff   = offsetMap.get(city.id) - refOffset;
        const raw    = h + diff;
        const dayOff = Math.floor(raw / 24);
        const localH = ((raw % 24) + 24) % 24;
        const [r, g, b] = compBgRGB(localH);
        const textColor = compTextColor(localH);
        const hh = String(Math.floor(localH)).padStart(2, '0');
        const mm = String(Math.round((localH - Math.floor(localH)) * 60)).padStart(2, '0');
        const td = document.createElement('td');
        td.dataset.h = String(h);
        td.style.background = `rgb(${r},${g},${b})`;
        td.style.color = textColor;
        let html = `<span class="ct-time">${hh}:${mm}</span>`;
        if (dayOff !== 0) {
          const cls = dayOff > 0 ? 'ct-badge-plus' : 'ct-badge-minus';
          html += `<sup class="ct-badge ${cls}">${dayOff > 0 ? '+1' : '−1'}</sup>`;
        }
        td.innerHTML = html;
        tr.appendChild(td);
      }
      return tr;
    };

    pinnedCities.forEach(c => tbody.appendChild(buildRow(c, true)));
    if (pinnedCities.length > 0 && unpinnedCities.length > 0) {
      const sep = document.createElement('tr');
      sep.className = 'ct-sep-row';
      const sepTd = document.createElement('td');
      sepTd.colSpan = 25;
      sep.appendChild(sepTd);
      tbody.appendChild(sep);
    }
    unpinnedCities.forEach(c => tbody.appendChild(buildRow(c, false)));

    // Table width: city col + 24 hour cols
    const colW  = window.innerWidth <= 600 ? 44 : 52;
    const cityW = window.innerWidth <= 600 ? 80 : 100;
    table.style.width = (cityW + 24 * colW) + 'px';

    updateCompTable();
  } catch(e) { console.warn('buildCompTable error:', e); }
}

function updateCompTable() {
  const allCities = ALL_CITIES.filter(c => state.selection.selected.includes(c.id));
  if (!allCities.length) return;
  const offsetMap = new Map(allCities.map(c => [c.id, getUTCOffsetHours(c.tz)]));
  const pinnedCities   = allCities.filter(c =>  state.selection.pinned.includes(c.id));
  const unpinnedCities = allCities.filter(c => !state.selection.pinned.includes(c.id));
  const refCity = pinnedCities[0] || unpinnedCities.sort((a,b) => offsetMap.get(b.id)-offsetMap.get(a.id))[0];
  if (!refCity) return;
  const refOffset = offsetMap.get(refCity.id);
  const now = new Date();
  const nowColH = Math.floor(((now.getUTCHours() + now.getUTCMinutes()/60 + refOffset) % 24 + 24) % 24);
  document.querySelectorAll('#compPanel [data-h]').forEach(el => el.classList.remove('ct-now-col'));
  document.querySelectorAll(`#compPanel [data-h="${nowColH}"]`).forEach(el => el.classList.add('ct-now-col'));
}

// ── Local clock ───────────────────────────────────────────────────────
function updateLocalClock() {
  const now = new Date();
  const y  = now.getFullYear();
  const m  = now.getMonth() + 1;
  const d  = now.getDate();
  const wd = WEEK_DAYS[now.getDay()];
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const lunar = getLunarStr(now);
  const term  = getSolarTerm(now);
  const extra = [lunar, term].filter(Boolean).join(' ');
  document.getElementById(DOM.localClock).textContent =
    `${y}/${m}/${d}${extra ? ' ' + extra : ''} ${wd} ${hh}:${mm}`;
  // Wallpaper overlay clock
  const wt = document.getElementById(DOM.wpclockTime);
  const wdEl = document.getElementById(DOM.wpclockDate);
  if (wt) wt.textContent = `${hh}:${mm}`;
  if (wdEl) wdEl.textContent = `${y}/${m}/${d}${extra ? '  ' + extra : ''}  ${wd}`;
}

// ── Update cycle ──────────────────────────────────────────────────────
function tick() {
  updateMapTimes();
  if (!WALLPAPER_MODE) renderTimeline();
  updateLocalClock();
  updateDateLine(projection, geoPath);
  updateMidnightLine(projection, geoPath);
  if (!WALLPAPER_MODE) updateCompTable();
}

// ── Map double-click → rotate to clicked longitude ────────────────────
document.getElementById(DOM.mapSvg).addEventListener('dblclick', e => {
  if (state.map.isRotating || state.map.isTransitioning) return;
  const svgEl = document.getElementById(DOM.mapSvg);
  const rect  = svgEl.getBoundingClientRect();
  const svgX  = (e.clientX - rect.left) * (VW / rect.width);
  const svgY  = (e.clientY - rect.top)  * (VH / rect.height);
  const geo   = projection.invert([svgX, svgY]);
  if (geo) rotateMapTo(geo[0]);
});

// ── Wallpaper 模式：轮询 localStorage 同步浏览器端状态 ────────────────
// storage 事件只在同一浏览器内跨标签触发，无法跨进程（浏览器→Plash WebView）
// 改用轮询：每 60 秒主动读取一次，检测差异后立即应用
if (WALLPAPER_MODE) {
  function _applyStoredState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE.map) || '{}');
      let needRedraw = false;

      if (typeof s.rotation === 'number' &&
          Math.abs(s.rotation - state.map.rotation) > 0.01 &&
          !state.map.isRotating && !state.map.isTransitioning) {
        state.map.rotation = s.rotation;
        needRedraw  = true;
      }
      if (s.proj && s.proj !== state.map.proj && !state.map.isTransitioning) {
        state.map.proj = s.proj;
        needRedraw  = true;
      }
      if (s.term && s.term !== state.map.term && !state.map.isTermTransitioning) {
        state.map.term        = s.term;
        state.map.termSimpleOpacity  = s.term === 'simple'  ? 1 : 0;
        state.map.termNaturalOpacity = s.term === 'natural' ? 1 : 0;
        svg.select('.term-simple-grp').attr('opacity', state.map.termSimpleOpacity);
        svg.select('.term-natural-grp').attr('opacity', state.map.termNaturalOpacity);
      }
      if (needRedraw) {
        projection = buildProjection();
        geoPath    = d3.geoPath(projection);
        applyProjectionToPaths(projection, geoPath);
        drawNight();
        redrawCities();
      }
    } catch(err) {}

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.selected) || 'null');
      if (Array.isArray(saved) &&
          saved.every(id => ALL_CITIES.some(c => c.id === id)) &&
          JSON.stringify(saved) !== JSON.stringify(state.selection.selected)) {
        state.selection.selected = saved;
        redrawCities();
      }
    } catch(err) {}

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.pinned) || 'null');
      if (Array.isArray(saved) &&
          JSON.stringify(saved) !== JSON.stringify(state.selection.pinned)) {
        state.selection.pinned = saved.filter(id => ALL_CITIES.some(c => c.id === id));
      }
    } catch(err) {}
  }

  // 同一浏览器内的标签页同步（storage 事件）
  window.addEventListener('storage', _applyStoredState);
  // 跨进程同步（Plash WebView ↔ 浏览器）
  setInterval(_applyStoredState, 60000);
}

// ── Boot ──────────────────────────────────────────────────────────────
loadTzBoundaries().then(() => initMap()).then(() => {
  if (!WALLPAPER_MODE) renderTimeline();
  updateLocalClock();
  if (!WALLPAPER_MODE) buildCompTable();
  setInterval(tick, WALLPAPER_MODE ? 30000 : 60000);
});

window.addEventListener('resize', () => {
  initMap();
  renderTimeline();
  clearTimeout(state.comp.resizeTimer);
  state.comp.resizeTimer = setTimeout(buildCompTable, 120);
});

// ── Clock Panel Integration (24HourClock) ──────────────────────────────────
const clockCanvas = document.getElementById(DOM.worldClock);
const clockCtx    = clockCanvas ? clockCanvas.getContext('2d') : null;
const CX = 310, CY = 310;

// Constants from 24HourClock
const R_OUTER  = 304;
const R_SHARED = 258;
const R_H_TK_REG  = R_SHARED + 14;
const R_H_TK_KEY  = R_SHARED + 20;
const R_H_TK_HALF = R_SHARED + 11;
const R_H_TK_10   = R_SHARED + 7;
const R_H_LBL     = R_SHARED + 27;
const R_M_TK_MIN = R_SHARED - 9;
const R_M_TK_MAJ = R_SHARED - 21;
const R_M_LBL    = R_SHARED - 36;
const R_IND = R_SHARED - 65;

// Clock theme function
function clockTheme(dark) {
  const hColor = dark ? 'rgba(195,200,230,0.92)' : '#4466bb';
  const mColor = '#ffffff';
  return {
    outerBg:     dark ? '#1a1b2a' : '#f0f1f5',
    outerBorder: dark ? '#42435a' : '#72728a',
    sharedLine:  dark ? '#3c3d52' : '#8a8aa2',
    hHand:       hColor,
    hTick:       hColor,
    hLabel:      hColor,
    hLabelKey:   hColor,
    mHand:            mColor,
    mTick:            mColor,
    mTickMinor:       mColor,
    mLabel:      mColor,
    mShadow:     'rgba(0,0,0,0.75)',
    infoColor:   dark ? '#888' : '#666',
  };
}

function clockIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── Clock TAB 坐标系约定 ──────────────────────────────────────────────
//
//   24 小时表盘布局：
//     12 点 (正午) 在表盘顶部
//      0 点 (午夜) 在表盘底部
//     18 点      在表盘右侧 (3 o'clock 位置)
//      6 点      在表盘左侧 (9 o'clock 位置)
//
//   下面三个函数把"时间"转换成 Canvas 弧度供 cos/sin 使用：
//     Canvas 角度系：0 = 右(+X)，π/2 = 下(+Y)，π = 左，-π/2 = 上
//     公式 (h-12)/24 × 2π - π/2 把 h=12 映射到 -π/2 (顶部) ✓
//
//   关键陷阱：城市标注旋转用的 a = h/24 × 360° (新坐标系，0=顶部)
//             与 hAng 相差 180°，混用会导致文字方向反向 (Phase 1 之前的 bug)。
// ─────────────────────────────────────────────────────────────────────

/** 时(h)→Canvas 弧度。h ∈ [0,24)，可含小数 */
function hAng(h) { return (h - 12) / 24 * Math.PI * 2 - Math.PI / 2; }
/** 分(m)→Canvas 弧度。m ∈ [0,60) */
function mAng(m) { return m / 60 * Math.PI * 2 - Math.PI / 2; }
/** 秒(s)→Canvas 弧度。s ∈ [0,60) */
function sAng(s) { return s / 60 * Math.PI * 2 - Math.PI / 2; }
// Draw moon body (from 24HourClock)
function drawMoonBody(r, phase) {
  const LIT  = '#ccdff5';
  const DARK = 'rgba(10, 12, 26, 0.94)';

  const waxing    = phase <= 0.5;
  const normPhase = waxing ? phase * 2 : 2 * (1 - phase);
  const xr        = r * Math.cos(Math.PI * normPhase);

  clockCtx.save();
  clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
  clockCtx.fillStyle = DARK; clockCtx.fill();

  clockCtx.save();
  if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
  clockCtx.closePath(); clockCtx.clip();
  clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
  clockCtx.fillStyle = LIT; clockCtx.fill();
  clockCtx.restore();

  if (Math.abs(xr) > 0.5) {
    clockCtx.save();
    if (xr > 0) {
      clockCtx.beginPath();
      if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
      clockCtx.closePath(); clockCtx.clip();
      clockCtx.save();
      clockCtx.scale(xr / r, 1);
      clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
      clockCtx.fillStyle = DARK; clockCtx.fill();
      clockCtx.restore();
    } else {
      clockCtx.beginPath();
      if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
      else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      clockCtx.closePath(); clockCtx.clip();
      clockCtx.save();
      clockCtx.scale(-xr / r, 1);
      clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
      clockCtx.fillStyle = LIT; clockCtx.fill();
      clockCtx.restore();
    }
    clockCtx.restore();
  }

  clockCtx.restore();
}

// Draw face (sun/moon area)
function drawClockFace(sunrise, sunset) {
  const R   = R_SHARED;
  const srA = hAng(sunrise);
  const ssA = hAng(sunset);

  const p1x = CX + Math.cos(srA) * R, p1y = CY + Math.sin(srA) * R;
  const p2x = CX + Math.cos(ssA) * R, p2y = CY + Math.sin(ssA) * R;
  const cmX = (p1x + p2x) / 2,        cmY = (p1y + p2y) / 2;

  clockCtx.save();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, 0, Math.PI * 2);
  clockCtx.clip();

  const nGrd = clockCtx.createRadialGradient(CX, CY + R * 0.28, 0, CX, CY, R);
  nGrd.addColorStop(0,   'rgb(32, 28, 24)');
  nGrd.addColorStop(0.5, 'rgb(14, 11,  9)');
  nGrd.addColorStop(1,   'rgb( 5,  4,  7)');
  clockCtx.fillStyle = nGrd;
  clockCtx.fillRect(CX - R, CY - R, R * 2, R * 2);

  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, srA, ssA, false);
  clockCtx.closePath();
  const dGrd = clockCtx.createLinearGradient(CX, CY - R, cmX, cmY);
  dGrd.addColorStop(0,    'rgb(228, 244, 255)');
  dGrd.addColorStop(0.18, 'rgb(188, 226, 255)');
  dGrd.addColorStop(0.44, 'rgb(140, 205, 252)');
  dGrd.addColorStop(0.82, 'rgb(215, 192, 128)');
  dGrd.addColorStop(0.90, 'rgb(255, 158,  38)');
  dGrd.addColorStop(0.96, 'rgb(255, 108,   8)');
  dGrd.addColorStop(1.0,  'rgb(225,  72,   2)');
  clockCtx.fillStyle = dGrd;
  clockCtx.fill();

  clockCtx.save();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, ssA, srA, false);
  clockCtx.closePath();
  clockCtx.clip();
  const midX = CX + Math.cos(hAng(0)) * R * 0.32;
  const midY = CY + Math.sin(hAng(0)) * R * 0.32;
  const gGrd = clockCtx.createLinearGradient(cmX, cmY, midX, midY);
  gGrd.addColorStop(0,    'rgba(205, 75,  8, 0.55)');
  gGrd.addColorStop(0.035,'rgba(165, 55,  5, 0.30)');
  gGrd.addColorStop(0.075,'rgba( 95, 30,  3, 0.12)');
  gGrd.addColorStop(0.12, 'rgba(  0,  0,  0, 0.00)');
  clockCtx.fillStyle = gGrd;
  clockCtx.fillRect(CX - R, CY - R, R * 2, R * 2);
  clockCtx.restore();

  clockCtx.restore();
}

// Draw outer ring
function drawClockOuterRing(t) {
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_OUTER,  0, Math.PI * 2, false);
  clockCtx.arc(CX, CY, R_SHARED, 0, Math.PI * 2, true);
  clockCtx.fillStyle = t.outerBg;
  clockCtx.fill();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_OUTER, 0, Math.PI * 2);
  clockCtx.strokeStyle = t.outerBorder;
  clockCtx.lineWidth = 1.5;
  clockCtx.stroke();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_SHARED, 0, Math.PI * 2);
  clockCtx.strokeStyle = t.sharedLine;
  clockCtx.lineWidth = 1;
  clockCtx.stroke();
}

// Draw hour scale
function drawClockHourScale(t) {
  for (let h = 0; h < 24; h++) {
    for (const min of [10, 20, 30, 40, 50]) {
      const a    = hAng(h + min / 60);
      const rOut = min === 30 ? R_H_TK_HALF : R_H_TK_10;
      clockCtx.beginPath();
      clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
      clockCtx.lineTo(CX + Math.cos(a) * rOut,     CY + Math.sin(a) * rOut);
      clockCtx.strokeStyle = t.hTick;
      clockCtx.lineWidth   = min === 30 ? 1.0 : 0.7;
      clockCtx.stroke();
    }
  }

  for (let h = 0; h < 24; h++) {
    const a     = hAng(h);
    const isKey = h === 0 || h === 6 || h === 12 || h === 18;
    const rOut  = isKey ? R_H_TK_KEY : R_H_TK_REG;

    clockCtx.beginPath();
    clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
    clockCtx.lineTo(CX + Math.cos(a) * rOut,     CY + Math.sin(a) * rOut);
    clockCtx.strokeStyle = t.hTick;
    clockCtx.lineWidth   = isKey ? 2.2 : 1.2;
    clockCtx.stroke();

    const lx = CX + Math.cos(a) * R_H_LBL;
    const ly = CY + Math.sin(a) * R_H_LBL;
    clockCtx.save();
    clockCtx.translate(lx, ly);
    clockCtx.fillStyle = isKey ? t.hLabelKey : t.hLabel;
    clockCtx.font      = isKey ? 'bold 12px Arial' : '11px Arial';
    clockCtx.textAlign = 'center';
    clockCtx.textBaseline = 'middle';
    clockCtx.fillText(String(h), 0, 0);
    clockCtx.restore();
  }
}

// Draw minute scale
function drawClockMinuteScale(t) {
  for (let m = 0; m < 60; m++) {
    const a   = mAng(m);
    const maj = m % 5 === 0;
    const rIn = maj ? R_M_TK_MAJ : R_M_TK_MIN;

    clockCtx.beginPath();
    clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
    clockCtx.lineTo(CX + Math.cos(a) * rIn,      CY + Math.sin(a) * rIn);
    clockCtx.strokeStyle = maj ? t.mTick : t.mTickMinor;
    clockCtx.lineWidth   = maj ? 1.8 : 1.4;
    clockCtx.stroke();

    if (maj) {
      const lx = CX + Math.cos(a) * R_M_LBL;
      const ly = CY + Math.sin(a) * R_M_LBL;
      clockCtx.save();
      clockCtx.translate(lx, ly);
      clockCtx.fillStyle    = t.mLabel;
      clockCtx.shadowColor  = t.mShadow;
      clockCtx.shadowBlur   = 4;
      clockCtx.font         = 'bold 11px Arial';
      clockCtx.textAlign    = 'center';
      clockCtx.textBaseline = 'middle';
      clockCtx.fillText(String(m), 0, 0);
      clockCtx.restore();
    }
  }
}

// Draw sun/moon indicator
function drawClockSunMoon(now, sunrise, sunset) {
  const h     = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const isDay = h >= sunrise && h <= sunset;
  const a     = hAng(h);
  const sx    = CX + Math.cos(a) * R_IND;
  const sy    = CY + Math.sin(a) * R_IND;
  const r     = 10;

  clockCtx.save();
  clockCtx.translate(sx, sy);

  if (isDay) {
    const g = clockCtx.createRadialGradient(0, 0, 4, 0, 0, 24);
    g.addColorStop(0, 'rgba(255,235,55,0.55)');
    g.addColorStop(1, 'rgba(255,188, 0,  0)');
    clockCtx.beginPath(); clockCtx.arc(0, 0, 24, 0, Math.PI * 2);
    clockCtx.fillStyle = g; clockCtx.fill();

    clockCtx.beginPath(); clockCtx.arc(0, 0, r - 2, 0, Math.PI * 2);
    clockCtx.fillStyle   = '#FFE040';
    clockCtx.shadowColor = '#FFD000'; clockCtx.shadowBlur = 14;
    clockCtx.fill();
    clockCtx.shadowBlur = 0;
    for (let i = 0; i < 8; i++) {
      const ri = i / 8 * Math.PI * 2;
      clockCtx.beginPath();
      clockCtx.moveTo(Math.cos(ri) * (r + 1), Math.sin(ri) * (r + 1));
      clockCtx.lineTo(Math.cos(ri) * (r + 6), Math.sin(ri) * (r + 6));
      clockCtx.strokeStyle = 'rgba(255,228,55,0.85)';
      clockCtx.lineWidth = 1.6; clockCtx.stroke();
    }
  } else {
    const phase = getMoonPhase(now);

    const glow = clockCtx.createRadialGradient(0, 0, r * 0.85, 0, 0, r + 22);
    glow.addColorStop(0,   'rgba(200, 220, 255, 0.28)');
    glow.addColorStop(0.5, 'rgba(175, 205, 255, 0.10)');
    glow.addColorStop(1,   'rgba(150, 185, 255, 0.00)');
    clockCtx.beginPath(); clockCtx.arc(0, 0, r + 22, 0, Math.PI * 2);
    clockCtx.fillStyle = glow; clockCtx.fill();

    drawMoonBody(r, phase);
  }

  clockCtx.restore();
}

/**
 * 在表盘上画一根指针（时针/分针/秒针/城市针的通用底层函数）。
 * 指针从中心向 a 方向延伸长度 len，反向延伸 len*back（尾段）。
 * @param {number} a     - Canvas 角度（弧度）。见 hAng/mAng/sAng 文档
 * @param {number} len   - 主长度（像素）
 * @param {number} width - 线宽
 * @param {string} color - 描边色（CSS color）
 * @param {number} back  - 尾段相对长度系数 (0~1)
 */
function drawClockHand(a, len, width, color, back) {
  clockCtx.beginPath();
  clockCtx.moveTo(CX - Math.cos(a) * len * back, CY - Math.sin(a) * len * back);
  clockCtx.lineTo(CX + Math.cos(a) * len,         CY + Math.sin(a) * len);
  clockCtx.strokeStyle = color; clockCtx.lineWidth = width; clockCtx.lineCap = 'round';
  clockCtx.stroke();
}

// Draw hour/minute/second hands
function drawClockHands(now, showSecond, t) {
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const m = now.getMinutes() + now.getSeconds() / 60;
  const s = now.getSeconds();

  clockCtx.save(); clockCtx.shadowColor='rgba(0,0,0,0.55)'; clockCtx.shadowBlur=6;
  drawClockHand(hAng(h), 143, 5.5, t.hHand, 0.18);
  clockCtx.restore();

  clockCtx.save(); clockCtx.shadowColor='rgba(0,0,0,0.45)'; clockCtx.shadowBlur=4;
  drawClockHand(mAng(m), 195, 3.0, t.mHand, 0.15);
  clockCtx.restore();

  if (showSecond) {
    clockCtx.save(); clockCtx.shadowColor='rgba(255,70,70,0.55)'; clockCtx.shadowBlur=7;
    drawClockHand(sAng(s), 211, 1.5, '#FF5050', 0.22);
    clockCtx.restore();
  }

  clockCtx.save();
  if (showSecond) {
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 6.5, 0, Math.PI * 2);
    clockCtx.fillStyle = '#FF5050'; clockCtx.shadowColor = '#FF3030'; clockCtx.shadowBlur = 10;
    clockCtx.fill();
    clockCtx.shadowBlur = 0;
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 3, 0, Math.PI * 2);
    clockCtx.fillStyle = '#fff'; clockCtx.fill();
  } else {
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 4, 0, Math.PI * 2);
    clockCtx.fillStyle = 'rgba(220,235,255,0.85)';
    clockCtx.shadowColor = 'rgba(0,0,0,0.5)'; clockCtx.shadowBlur = 5;
    clockCtx.fill();
  }
  clockCtx.restore();
}

// Draw city time hands (pinned cities)
function drawCityHands() {
  // 直接读全局 state.selection.pinned（单一数据源）；ALL_CITIES 已在脚本顶部声明
  if (!state.selection.pinned || state.selection.pinned.length === 0 || typeof ALL_CITIES === 'undefined') return;

  // Blue color palette - same family, progressively lighter
  const colors = ['#4466bb', '#5588dd', '#77aaee', '#99bff5', '#bbcffa'];
  const now = new Date();

  state.selection.pinned.forEach((cityId, idx) => {
    const city = ALL_CITIES.find(c => c.id === cityId);
    if (!city || !city.label) return;

    const offsetHour = typeof getUTCOffsetHours === 'function' ? getUTCOffsetHours(city.tz) : 0;
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const h = (utcHours + offsetHour) % 24;

    // 绘制时针（用本城市的时间）
    const a_hand = hAng(h);
    clockCtx.save();
    clockCtx.shadowColor = 'rgba(0,0,0,0.4)';
    clockCtx.shadowBlur = 4;
    drawClockHand(a_hand, 155, 4, colors[idx % colors.length], 0.15);
    clockCtx.restore();

    // 标注位置和方向（独立计算）
    const labelDist = 101;
    const labelX = CX + Math.cos(a_hand) * labelDist;
    const labelY = CY + Math.sin(a_hand) * labelDist;

    clockCtx.save();
    clockCtx.translate(labelX, labelY);

    // Y轴规则：a = h/24 × 360°（新坐标系，0°=12点钟方向）
    // 如果 a > 180：Y = a（保持原方向）
    // 如果 a <= 180：Y = a + 180°（翻转，使文字朝向一致）
    const a_user = (h / 24) * 360;
    let rotationAngle = a_hand;
    if (a_user <= 180) {
      rotationAngle += Math.PI;  // 翻转180°
    }
    clockCtx.rotate(rotationAngle);

    clockCtx.font = 'bold 11px Arial';
    clockCtx.textAlign = 'center';
    clockCtx.textBaseline = 'middle';

    // Draw gray stroke first for outline effect
    clockCtx.strokeStyle = 'rgba(80,80,80,0.8)';
    clockCtx.lineWidth = 2;
    clockCtx.lineCap = 'round';
    clockCtx.lineJoin = 'round';
    clockCtx.strokeText(city.label, 0, 0);

    // Draw white fill text on top
    clockCtx.fillStyle = 'rgba(255,255,255,0.9)';
    clockCtx.fillText(city.label, 0, 0);

    clockCtx.restore();
  });
}

// Main clock draw frame
function drawClockFrame() {
  if (!clockCtx) return;

  const now = new Date();
  const { sunrise, sunset } = getSunTimes(now);
  const t = clockTheme(clockIsDark());

  clockCtx.clearRect(0, 0, clockCanvas.width, clockCanvas.height);
  clockCtx.save();
  clockCtx.beginPath(); clockCtx.arc(CX, CY, R_OUTER, 0, Math.PI * 2); clockCtx.clip();

  drawClockFace(sunrise, sunset);
  drawClockOuterRing(t);
  drawClockHourScale(t);
  drawClockMinuteScale(t);
  drawClockSunMoon(now, sunrise, sunset);
  drawClockHands(now, state.clock.showSecond, t);
  drawCityHands();

  clockCtx.restore();
}

// Clock update interval and second hand control (state in state.clock)
const CLOCK_AUTO_HIDE_MS = 5 * 60 * 1000;  // 5 minutes

function stopClockSecondMode() {
  if (state.clock.secondTimer) { clearInterval(state.clock.secondTimer); state.clock.secondTimer = null; }
  if (state.clock.autoHideTimeout) { clearTimeout(state.clock.autoHideTimeout); state.clock.autoHideTimeout = null; }
  state.clock.showSecond = false;

  // Align to next full minute
  const now = new Date();
  const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    drawClockFrame();
    state.clock.updateInterval = setInterval(drawClockFrame, 60000);
  }, delay);
  drawClockFrame();
}

function startClockSecondMode() {
  if (state.clock.updateInterval) { clearInterval(state.clock.updateInterval); state.clock.updateInterval = null; }
  if (state.clock.secondTimer) { clearInterval(state.clock.secondTimer); }
  state.clock.showSecond = true;
  state.clock.secondTimer = setInterval(drawClockFrame, 1000);
  drawClockFrame();

  // Auto-hide after 5 minutes
  if (state.clock.autoHideTimeout) clearTimeout(state.clock.autoHideTimeout);
  state.clock.autoHideTimeout = setTimeout(stopClockSecondMode, CLOCK_AUTO_HIDE_MS);
}

function initClockCanvas() {
  if (!clockCtx) return;

  // Add double-click listener for second hand toggle
  if (!clockCanvas._secondToggleAdded) {
    clockCanvas.addEventListener('dblclick', e => {
      const rect = clockCanvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - CX;
      const dy = e.clientY - rect.top - CY;
      if (dx * dx + dy * dy > 60 * 60) return;  // Only within center circle

      if (state.clock.showSecond) {
        stopClockSecondMode();
      } else {
        startClockSecondMode();
      }
    });
    clockCanvas._secondToggleAdded = true;
  }

  // Start with second hand shown
  startClockSecondMode();

  // Redraw on theme change
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawClockFrame);
}

function updateClockPanel() {
  drawClockFrame();
}

// Initialize clock when first needed (initialized flag in state.clock)
function ensureClockInit() {
  if (!state.clock.initialized && clockCtx) {
    initClockCanvas();
    state.clock.initialized = true;
  }
}

// ── end of module ────────────────────────────────────────────────────
