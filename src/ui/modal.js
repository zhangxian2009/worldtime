// @ts-check
// 城市选择模态框。包含 chips、按大洲/国家分组的城市列表，及增删事件。

import { DOM } from '../core/dom-keys.js';
import { getUTCOffset, getUTCOffsetHours } from '../core/time-utils.js';

/**
 * 初始化模态框。返回 {open} 触发器。
 *
 * 因为模态框需要在选中变化时让其它 TAB 重渲染，把"变更回调"作为依赖注入，
 * 避免对 timeline/map/comp 模块产生循环导入。
 *
 * @param {{
 *   allCities: { id: string, label: string, tz: string }[],
 *   catalog: any[],
 *   state: import('../core/state.js').AppState,
 *   persistSelection: () => void,
 *   onSelectionChange: () => void,
 * }} deps
 */
export function initModal(deps) {
  const { allCities, catalog, state, persistSelection, onSelectionChange } = deps;
  const modalBg = /** @type {HTMLElement} */ (document.getElementById(DOM.modalBg));

  function renderChips() {
    const chips = /** @type {HTMLElement} */ (document.getElementById(DOM.selectedChips));
    const sorted = allCities
      .filter(c => state.selection.selected.includes(c.id))
      .sort((a, b) => getUTCOffsetHours(a.tz) - getUTCOffsetHours(b.tz));
    chips.innerHTML = sorted.map(c =>
      `<span class="city-chip" data-id="${c.id}">${c.label} <span style="opacity:.6">×</span></span>`
    ).join('');
    chips.querySelectorAll('.city-chip').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        state.selection.selected = state.selection.selected.filter(x => x !== id);
        persistSelection();
        renderChips(); renderList();
        onSelectionChange();
      });
    });
  }

  function renderList() {
    const list = /** @type {HTMLElement} */ (document.getElementById(DOM.cityList));
    let html = '';
    for (const cont of catalog) {
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
        if (!id) return;
        if (state.selection.selected.includes(id)) {
          state.selection.selected = state.selection.selected.filter(x => x !== id);
        } else {
          state.selection.selected.push(id);
        }
        persistSelection();
        renderChips(); renderList();
        onSelectionChange();
      });
    });
  }

  function open() {
    renderChips(); renderList();
    modalBg.classList.add('open');
  }

  document.getElementById(DOM.settingsBtn).addEventListener('click', open);
  document.getElementById(DOM.wpCityBtn).addEventListener('click', open);
  document.getElementById(DOM.modalDone).addEventListener('click', () => modalBg.classList.remove('open'));
  modalBg.addEventListener('click', e => { if (e.target === modalBg) modalBg.classList.remove('open'); });

  return { open };
}
