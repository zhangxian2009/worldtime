// @ts-check
// 颜色与渐变工具（纯函数）
// 用于时间轴/对照表/壁纸的色带生成、晨昏过渡颜色等。

import { getHourMinute } from './time-utils.js';

// 时间轴主色板
const NIGHT = [90,  95, 110];   // medium grey with slight cool tint
const DAY   = [255, 255, 245];
const SR_TW = [192,  64,  16];  // sunrise: matches map glow #c04010
const SS_TW = [192,  64,  16];  // sunset:  same warm orange-red as map

// 对照表的浅背景色板（更柔和）
const _BG_DAY   = [250, 250, 248]; // near-white
const _BG_NIGHT = [200, 206, 216]; // cool light grey

/** 二点线性插值；返回 [r,g,b] (0-255 整数)。 */
export function lerp2(a, b, t) {
  return a.map((v,i) => Math.round(v + (b[i]-v)*t));
}

/** 三点 (a → mid → b) 分段线性插值；t∈[0,1]。 */
export function lerp3(a, mid, b, t) {
  return t<0.5 ? lerp2(a,mid,t*2) : lerp2(mid,b,(t-0.5)*2);
}

/**
 * 根据本地小时数返回时间轴色带的 [r,g,b]。
 * 整合了夜晚 / 晨曦 / 白天 / 黄昏的过渡。
 * @param {number} localHour - 0-24 的小时数（含小数）
 */
export function getColorRGB(localHour) {
  const RISE = 6, SET = 18, HALF = 2.0;
  const lo = RISE-HALF, hi = SET+HALF;
  if (localHour <= lo || localHour >= hi) return NIGHT;
  if (localHour >= RISE+HALF && localHour <= SET-HALF) return DAY;
  if (localHour < RISE+HALF) return lerp3(NIGHT, SR_TW, DAY, (localHour-lo)/(2*HALF));
  return lerp3(DAY, SS_TW, NIGHT, (localHour-(SET-HALF))/(2*HALF));
}

/** 同 getColorRGB 但返回 "rgba(r,g,b,0.7)" 字符串。 */
export function getColorStr(localHour) {
  const [r,g,b] = getColorRGB(localHour);
  return `rgba(${r},${g},${b},0.7)`;
}

/** 0..1 标量"光照强度"（0=深夜，1=白天），含晨昏过渡。 */
export function lightLevel(localHour) {
  const RISE = 6, SET = 18, HALF = 1.5;
  const lo = RISE-HALF, hi = SET+HALF;
  if (localHour <= lo || localHour >= hi) return 0;
  if (localHour >= RISE+HALF && localHour <= SET-HALF) return 1;
  if (localHour < RISE+HALF) return (localHour-lo)/(2*HALF);
  return 1-(localHour-(SET-HALF))/(2*HALF);
}

/**
 * 构造一个从 nowMs-halfMs 到 nowMs+halfMs 的水平 CSS 线性渐变（96 色阶）。
 * 用于时间轴、壁纸的"当前时刻居中"色带。
 */
export function buildGradientCentered(tz, nowMs, halfMs) {
  const N = 96, start = nowMs - halfMs, total = 2 * halfMs, stops = [];
  for (let i = 0; i <= N; i++) {
    stops.push(`${getColorStr(getHourMinute(tz, start+(i/N)*total))} ${(i/N*100).toFixed(1)}%`);
  }
  return `linear-gradient(to right,${stops.join(',')})`;
}

// ── 对照表用的浅色背景色板 ───────────────────────────────────────────

/** 对照表单元格背景色 [r,g,b]，含夜→晨→日→暮过渡。 */
export function compBgRGB(h) {
  if (h <  7) return _BG_NIGHT;
  if (h <  9) return lerp2(_BG_NIGHT, _BG_DAY, (h - 7) / 2);   // dawn 2h
  if (h < 20) return _BG_DAY;
  if (h < 22) return lerp2(_BG_DAY, _BG_NIGHT, (h - 20) / 2);  // dusk 2h
  return _BG_NIGHT;
}

/** 对照表单元格文字色：白天绿 / 边缘琥珀 / 夜晚红。 */
export function compTextColor(h) {
  const hi = Math.floor(h);
  if (hi >= 9 && hi <= 19) return '#1a9a32';   // green
  if (hi === 7 || hi === 8 || hi === 20 || hi === 21) return '#c87800'; // amber
  return '#cc2020';                              // red
}
