// @ts-check
// 顶部右侧的本地时间显示（也驱动壁纸模式的悬浮时钟）。

import { DOM } from '../core/dom-keys.js';
import { WEEK_DAYS, getLunarStr, getSolarTerm } from '../core/astro.js';

/** 更新顶栏时间 + 壁纸悬浮时钟。每分钟（或秒模式下每秒）调用一次。 */
export function updateLocalClock() {
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

  const lc = document.getElementById(DOM.localClock);
  if (lc) lc.textContent = `${y}/${m}/${d}${extra ? ' ' + extra : ''} ${wd} ${hh}:${mm}`;

  // 壁纸模式悬浮时钟
  const wt   = document.getElementById(DOM.wpclockTime);
  const wdEl = document.getElementById(DOM.wpclockDate);
  if (wt)   wt.textContent   = `${hh}:${mm}`;
  if (wdEl) wdEl.textContent = `${y}/${m}/${d}${extra ? '  ' + extra : ''}  ${wd}`;
}
