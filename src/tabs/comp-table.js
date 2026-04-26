// @ts-check
// 对照表 TAB：城市 × 24 小时矩阵，按"参考城市"对齐时间。

import { getUTCOffset, getUTCOffsetHours } from '../core/time-utils.js';
import { compBgRGB, compTextColor } from '../core/color-utils.js';

/**
 * @typedef {{
 *   allCities: { id: string, label: string, tz: string }[],
 *   state: import('../core/state.js').AppState,
 *   persistPinned: () => void,
 *   onPinChange: () => void,
 * }} CompDeps
 */

let _deps = /** @type {CompDeps | null} */ (null);

/** 注入依赖。供 main.js 在启动时调用一次。 */
export function configureCompTable(/** @type {CompDeps} */ deps) {
  _deps = deps;
}

/** 完整重建对照表。城市列表 / 置顶变化时调用。 */
export function buildCompTable() {
  if (!_deps) return;
  const { allCities: ALL_CITIES, state, persistPinned, onPinChange } = _deps;
  try {
    const table = /** @type {HTMLElement} */ (document.querySelector('#compPanel .comp-table'));
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    const allCities = ALL_CITIES.filter(c => state.selection.selected.includes(c.id));
    const offsetMap = new Map(allCities.map(c => [c.id, getUTCOffsetHours(c.tz)]));
    const byUtcDesc = (a, b) => offsetMap.get(b.id) - offsetMap.get(a.id);

    if (!allCities.length) { thead.innerHTML = ''; tbody.innerHTML = ''; return; }

    const pinnedCities   = allCities.filter(c =>  state.selection.pinned.includes(c.id)).sort(byUtcDesc);
    const unpinnedCities = allCities.filter(c => !state.selection.pinned.includes(c.id)).sort(byUtcDesc);
    const refOffset = offsetMap.get((pinnedCities[0] || unpinnedCities[0]).id);

    // Header
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

    // Body
    tbody.innerHTML = '';
    const buildRow = (city, isPinned) => {
      const tr = document.createElement('tr');
      if (isPinned) tr.classList.add('ct-pinned');

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
        persistPinned();
        buildCompTable();
        onPinChange();
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

    const colW  = window.innerWidth <= 600 ? 44 : 52;
    const cityW = window.innerWidth <= 600 ? 80 : 100;
    table.style.width = (cityW + 24 * colW) + 'px';

    updateCompTable();
  } catch(e) { console.warn('buildCompTable error:', e); }
}

/** 仅更新"当前小时"列高亮。每分钟 tick 调用。 */
export function updateCompTable() {
  if (!_deps) return;
  const { allCities: ALL_CITIES, state } = _deps;
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
