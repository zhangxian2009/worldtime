// @ts-check
// 时间轴 TAB：6 个城市的水平 24h × 5 天色带 + 协作窗口标记。

import { DOM } from '../core/dom-keys.js';
import {
  getUTCOffset, getUTCOffsetHours,
  getHourMinute, localDayStartMs, localDateLabel, localTimeStr, fmtHHMM,
} from '../core/time-utils.js';
import { buildGradientCentered } from '../core/color-utils.js';

const HALF_WINDOW_MS = 2.5 * 86400000; // ±2.5 days, 5 days total, NOW at center

/**
 * @typedef {{
 *   allCities: { id: string, label: string, tz: string, lon: number }[],
 *   state: import('../core/state.js').AppState,
 *   persistPinned: () => void,
 *   onPinChange: () => void,
 * }} TimelineDeps
 */

let _deps = /** @type {TimelineDeps | null} */ (null);

/** 注入依赖。 */
export function configureTimeline(/** @type {TimelineDeps} */ deps) {
  _deps = deps;
}

// 协作窗口色带：绿色=全员 in 09-18, 琥珀=部分, 灰=无重叠
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

// 找连续的协作窗口（按 stepMs 采样）
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

/** 完整重渲染时间轴。城市列表/置顶变化或 tick 都会调用。 */
export function renderTimeline() {
  if (!_deps) return;
  const { allCities: ALL_CITIES, state, persistPinned, onPinChange } = _deps;
  const panel = /** @type {HTMLElement} */ (document.getElementById(DOM.timelinePanel));
  panel.innerHTML = '';

  const cities = ALL_CITIES
    .filter(c => state.selection.selected.includes(c.id))
    .sort((a,b) => getUTCOffsetHours(b.tz) - getUTCOffsetHours(a.tz));

  const nowMs   = Date.now();
  const startMs = nowMs - HALF_WINDOW_MS;
  const totalMs = 2 * HALF_WINDOW_MS;

  // ── 协作窗口 bar ─────────────────────────────────────────────────────
  const collabCities = cities.filter(c => state.selection.pinned.includes(c.id));
  const collabSrc    = collabCities.length >= 2 ? collabCities : cities;

  if (collabSrc.length >= 2) {
    const tzList = collabSrc.map(c => c.tz);
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

    // Summary card
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

    const legend = document.createElement('div');
    legend.className = 'collab-legend';
    legend.innerHTML = `
      <span><span class="collab-ld" style="background:#7ec87e"></span>全员在线</span>
      <span><span class="collab-ld" style="background:#f5dfa0"></span>部分重叠</span>
      <span><span class="collab-ld" style="background:#e4e6e9"></span>无重叠</span>`;
    card.appendChild(legend);
    panel.appendChild(card);
  }

  // ── 每个城市一行 ─────────────────────────────────────────────────────
  const pinnedCities   = cities.filter(c =>  state.selection.pinned.includes(c.id));
  const unpinnedCities = cities.filter(c => !state.selection.pinned.includes(c.id));
  const sortedCities   = [...pinnedCities, ...unpinnedCities];
  let sepInserted = false;

  sortedCities.forEach((city) => {
    if (!sepInserted && pinnedCities.length > 0 && !state.selection.pinned.includes(city.id)) {
      const sep = document.createElement('div');
      sep.className = 'tl-sep';
      sep.dataset.label = '其他城市';
      panel.appendChild(sep);
      sepInserted = true;
    }

    const row = document.createElement('div');
    row.className = 'tl-row' + (state.selection.pinned.includes(city.id) ? ' tl-pinned' : '');

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
      persistPinned();
      renderTimeline();
      onPinChange();
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

    const bg = document.createElement('div');
    bg.className = 'tl-track-bg';
    bg.style.background = buildGradientCentered(city.tz, nowMs, HALF_WINDOW_MS);
    track.appendChild(bg);

    const mids = [];
    for (let d = -4; d <= 4; d++) {
      const ms = localDayStartMs(city.tz, d);
      if (ms > startMs && ms < startMs + totalMs) mids.push(ms);
    }
    mids.sort((a,b) => a - b);

    mids.forEach(ms => {
      const sep = document.createElement('div');
      sep.className = 'tl-day-sep';
      sep.style.left = `${(ms - startMs) / totalMs * 100}%`;
      track.appendChild(sep);
    });

    const bounds = [startMs, ...mids, startMs + totalMs];
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = bounds[i], e = bounds[i+1];
      const centerMs = (s + e) / 2;
      const isNow    = nowMs >= s && nowMs < e;
      const pct      = isNow ? 50 : (centerMs - startMs) / totalMs * 100;

      const lbl = document.createElement('div');
      lbl.className = 'tl-day-label';
      lbl.style.left = `${pct}%`;
      const dateStr = localDateLabel(city.tz, s);
      lbl.textContent = isNow ? `${dateStr} ${localTimeStr(city.tz)}` : dateStr;
      lbl.style.color = '#111';
      lbl.style.textShadow = '0 0 4px rgba(255,255,255,0.8)';
      track.appendChild(lbl);
    }

    const nowLine = document.createElement('div');
    nowLine.className = 'tl-now-line';
    track.appendChild(nowLine);

    row.dataset.lon = String(city.lon);
    row.appendChild(track);
    panel.appendChild(row);
  });
}
