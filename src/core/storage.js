// @ts-check
// localStorage 持久化包装。

import { STORAGE } from './dom-keys.js';

/**
 * 保存城市选择列表。
 * @param {string[]} selectedIds
 */
export function saveSelection(selectedIds) {
  localStorage.setItem(STORAGE.selected, JSON.stringify(selectedIds));
}

/**
 * 保存置顶城市列表。
 * @param {string[]} pinnedIds
 */
export function savePinned(pinnedIds) {
  localStorage.setItem(STORAGE.pinned, JSON.stringify(pinnedIds));
}

/**
 * 保存地图状态（投影、晨昏过渡、旋转）。
 * @param {{ proj: string, term: string, rotation: number }} mapState
 */
export function saveMapState(mapState) {
  localStorage.setItem(STORAGE.map, JSON.stringify({
    proj:     mapState.proj,
    term:     mapState.term,
    rotation: mapState.rotation,
  }));
}
