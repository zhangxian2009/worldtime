// @ts-check
// 全局应用状态聚合。所有可变 UI 状态在这里。
//
// 注意：state 是一个共享单例（ES module 自带单例语义）；
// 各 TAB 模块直接 import 这个对象并读写其属性。
// 不要重新赋值 state 本身（用 state.map.proj = 'braun' 而非 state = {...}）。

import { STORAGE } from './dom-keys.js';
import { DEFAULT_IDS } from './cities.js';

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

/**
 * 创建并初始化 state 对象。需要 ALL_CITIES 用于过滤 localStorage 中的失效 ID。
 * @param {{ id: string }[]} allCities
 * @returns {AppState}
 */
export function createState(allCities) {
  /** @type {AppState} */
  const state = {
    selection: {
      selected: (() => {
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE.selected) || 'null');
          if (Array.isArray(saved) && saved.length > 0 &&
              saved.every(id => allCities.some(c => c.id === id))) return saved;
        } catch(e) {}
        return [...DEFAULT_IDS];
      })(),
      pinned: (() => {
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE.pinned) || 'null');
          if (Array.isArray(saved)) return saved.filter(id => allCities.some(c => c.id === id));
        } catch(e) {}
        return [];
      })(),
    },
    map: {
      proj:                'naturalEarth',
      term:                'natural',
      rotation:            -116.39,         // default: Beijing centered (D3: negate lon)
      isTransitioning:     false,
      isTermTransitioning: false,
      termSimpleOpacity:   0,
      termNaturalOpacity:  1,
      isRotating:          false,
      tzBoundaryData:      null,
    },
    comp:  { resizeTimer: null },
    clock: {
      showSecond:      true,
      updateInterval:  null,
      secondTimer:     null,
      autoHideTimeout: null,
      initialized:     false,
    },
  };

  // 从 localStorage 恢复地图状态
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE.map) || '{}');
    if (s.proj === 'braun') state.map.proj = 'braun';
    if (s.term === 'simple') {
      state.map.term               = 'simple';
      state.map.termSimpleOpacity  = 1;
      state.map.termNaturalOpacity = 0;
    }
    if (typeof s.rotation === 'number') state.map.rotation = s.rotation;
  } catch(e) {}

  return state;
}
