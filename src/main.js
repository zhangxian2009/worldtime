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
import { DOM, STORAGE } from './core/dom-keys.js';
import { loadCities } from './core/cities.js';
import { createState } from './core/state.js';
// (saveSelection/savePinned/saveMapState 通过别名导入并包装为闭包，见下)
import { initModal } from './ui/modal.js';
import { updateLocalClock } from './ui/local-clock.js';
import { configureCompTable, buildCompTable, updateCompTable } from './tabs/comp-table.js';
import { configureClock, drawClockFrame, ensureClockInit, updateClockPanel } from './tabs/clock.js';
import { configureTimeline, renderTimeline } from './tabs/timeline.js';
import {
  configureMap, mapInstance, loadTzBoundaries,
  initMap, redrawCities, updateMapTimes,
  transitionToTerm, transitionToProjection, rotateMapTo,
  updateDateLine, updateMidnightLine,
  rebuildAndRedraw, applyTermOpacity,
} from './tabs/map.js';

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

// ── 加载城市数据 + 初始化状态 ────────────────────────────────────────
const { catalog: CITY_CATALOG, all: ALL_CITIES } = await loadCities();
window.ALL_CITIES = ALL_CITIES;  // 兼容旧代码（壁纸跨窗同步等）

const WALLPAPER_MODE = new URLSearchParams(location.search).get('wallpaper') === '1';
if (WALLPAPER_MODE) document.body.classList.add('wallpaper');

const state = createState(ALL_CITIES);
// 同步初始按钮选中状态
document.querySelectorAll('.proj-btn:not(.term-btn)').forEach(b =>
  b.classList.toggle('active', b.dataset.proj === state.map.proj));
document.querySelectorAll('.term-btn').forEach(b =>
  b.classList.toggle('active', b.dataset.term === state.map.term));

// loadTzBoundaries 已移到 src/tabs/map.js

// 状态变更持久化的本地包装：避免每个调用点都传 state 参数
import { saveSelection as _saveSel, savePinned as _savePin, saveMapState as _saveMap } from './core/storage.js';
const persistSelection = () => _saveSel(state.selection.selected);
const persistPinned    = () => _savePin(state.selection.pinned);
const persistMap       = () => _saveMap(state.map);

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

// ── 各 TAB 模块依赖注入 ───────────────────────────────────────────────
configureMap({ allCities: ALL_CITIES, state, persistMap });
configureCompTable({
  allCities: ALL_CITIES,
  state,
  persistPinned,
  onPinChange: () => renderTimeline(),
});
configureClock({ allCities: ALL_CITIES, state });
configureTimeline({
  allCities: ALL_CITIES,
  state,
  persistPinned,
  onPinChange: () => buildCompTable(),
});

// ── Settings modal (extracted to ui/modal.js) ─────────────────────────
initModal({
  allCities: ALL_CITIES,
  catalog:   CITY_CATALOG,
  state,
  persistSelection,
  onSelectionChange: () => {
    renderTimeline();
    redrawCities();
    setTimeout(buildCompTable, 0);
  },
});

// ── Update cycle ──────────────────────────────────────────────────────
function tick() {
  updateMapTimes();
  if (!WALLPAPER_MODE) renderTimeline();
  updateLocalClock();
  updateDateLine(mapInstance.projection, mapInstance.geoPath);
  updateMidnightLine(mapInstance.projection, mapInstance.geoPath);
  if (!WALLPAPER_MODE) updateCompTable();
}

// ── Map double-click → rotate to clicked longitude ────────────────────
const VW = 960, VH = 540;
document.getElementById(DOM.mapSvg).addEventListener('dblclick', e => {
  if (state.map.isRotating || state.map.isTransitioning) return;
  const svgEl = document.getElementById(DOM.mapSvg);
  const rect  = svgEl.getBoundingClientRect();
  const svgX  = (e.clientX - rect.left) * (VW / rect.width);
  const svgY  = (e.clientY - rect.top)  * (VH / rect.height);
  const geo   = mapInstance.projection.invert([svgX, svgY]);
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
        applyTermOpacity();
      }
      if (needRedraw) {
        rebuildAndRedraw();
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


// ── end of module ────────────────────────────────────────────────────
