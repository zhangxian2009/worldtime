// @ts-check
// 天文计算模块（纯函数，无 DOM 依赖，可在 Node 中测试）

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {Object} SunTimes
 * @property {number} sunrise - hour-of-day fraction
 * @property {number} sunset  - hour-of-day fraction
 */

/**
 * 当前时刻的子日点（太阳直射地表的位置）经纬度。
 * @returns {GeoPoint} lat/lon in degrees
 */
export function solarPosition() {
  const now = new Date();
  const jd  = now.getTime()/86400000 + 2440587.5;
  const n   = jd - 2451545.0;
  const L   = (280.460 + 0.9856474*n) % 360;
  const g   = (357.528 + 0.9856003*n) * Math.PI/180;
  const λ   = (L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g)) * Math.PI/180;
  const ε   = 23.4397 * Math.PI/180;
  const dec = Math.asin(Math.sin(ε)*Math.sin(λ)) * 180/Math.PI;
  const utcH = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
  let lon = ((180 - utcH * 15) % 360 + 360) % 360;
  if (lon > 180) lon -= 360;
  return { lat: dec, lon };
}

/**
 * 当前月相 ∈ [0, 1)：0=新月，0.25=上弦，0.5=满月，0.75=下弦。
 * @returns {number}
 */
export function moonPhase() {
  const jd = new Date().getTime() / 86400000 + 2440587.5;
  const KNOWN_NEW = 2451549.26; // Jan 6, 2000 new moon
  return ((jd - KNOWN_NEW) % 29.53059 + 29.53059) % 29.53059 / 29.53059;
}

/**
 * 任意时刻的子月点（月亮直射地表）经纬度。
 * @param {number} ms - Unix 时间戳（毫秒）
 * @returns {GeoPoint}
 */
export function moonPositionAt(ms) {
  const jd = ms / 86400000 + 2440587.5;
  const d  = jd - 2451545.0;
  const L  = ((218.316 + 13.176396*d) % 360 + 360) % 360;
  const M  = ((134.963 + 13.064993*d) % 360 + 360) % 360;
  const F  = ((93.272  + 13.229350*d) % 360 + 360) % 360;
  const D  = ((297.850 + 12.190749*d) % 360 + 360) % 360;
  const Mr = M*Math.PI/180, Dr = D*Math.PI/180, Fr = F*Math.PI/180;
  const lonEcl = (L + 6.289*Math.sin(Mr) - 1.274*Math.sin(2*Dr-Mr) + 0.658*Math.sin(2*Dr)) * Math.PI/180;
  const latEcl = 5.128 * Math.sin(Fr) * Math.PI/180;
  const eps = 23.4397 * Math.PI/180;
  const dec = Math.asin(Math.sin(latEcl)*Math.cos(eps) + Math.cos(latEcl)*Math.sin(eps)*Math.sin(lonEcl));
  const ra  = Math.atan2(Math.sin(lonEcl)*Math.cos(eps) - Math.tan(latEcl)*Math.sin(eps), Math.cos(lonEcl));
  const T    = d / 36525;
  const gmst = ((280.46061837 + 360.98564736629*d + 0.000387933*T*T) % 360 + 360) % 360;
  let lon    = (ra*180/Math.PI - gmst + 360) % 360;
  if (lon > 180) lon -= 360;
  return { lat: dec*180/Math.PI, lon };
}

/** 当前时刻的子月点（语法糖）。 @returns {GeoPoint} */
export function moonPosition() {
  return moonPositionAt(Date.now());
}

/**
 * Clock TAB 用：参考纬度 35°N 的日出/日落小时数（hour-of-day fraction）。
 * @param {Date} date
 * @returns {SunTimes}
 */
export function getSunTimes(date) {
  const doy  = Math.round((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const B    = 2 * Math.PI / 365 * (doy - 81);
  const decl = Math.asin(Math.sin(23.45 * Math.PI / 180) * Math.sin(B));
  const lat  = 35 * Math.PI / 180;
  const cosH = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const half = Math.acos(cosH) * 12 / Math.PI;
  return { sunrise: 12 - half, sunset: 12 + half };
}

/** 月相（Date 形式输入）∈ [0, 1)。 @param {Date} date @returns {number} */
export function getMoonPhase(date) {
  const base   = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const period = 29.530588853;
  const days   = (date.getTime() - base.getTime()) / 86400000;
  return (((days % period) + period) % period) / period;
}

// ── 农历/节气 ─────────────────────────────────────────────────────────

export const WEEK_DAYS = /** @type {const} */ (['周日','周一','周二','周三','周四','周五','周六']);

const _lunarFmt = (() => {
  try { return new Intl.DateTimeFormat('en-u-ca-chinese', { month:'numeric', day:'numeric' }); }
  catch(e) { return null; }
})();

/** 农历日期字符串（如 "农历 3/9"）。 @param {Date} date @returns {string} */
export function getLunarStr(date) {
  if (!_lunarFmt) return '';
  try {
    const parts = _lunarFmt.formatToParts(date);
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    return (m && d) ? `农历 ${m}/${d}` : '';
  } catch(e) { return ''; }
}

// 节气：index = floor(sunLon / 15)，从 春分 (0°) 起
export const SOLAR_TERMS = /** @type {const} */ ([
  '春分','清明','谷雨','立夏','小满','芒种',
  '夏至','小暑','大暑','立秋','处暑','白露',
  '秋分','寒露','霜降','立冬','小雪','大雪',
  '冬至','小寒','大寒','立春','雨水','惊蛰',
]);

function _sunLon(date) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.528 + 0.9856003 * n) * Math.PI / 180;
  return ((280.460 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360 + 360) % 360;
}

/** 当天是否进入新节气；返回节气名或 ''。 @param {Date} date @returns {string} */
export function getSolarTerm(date) {
  const i0 = Math.floor(_sunLon(date) / 15);
  const i1 = Math.floor(_sunLon(new Date(date.getTime() - 86400000)) / 15);
  return i0 !== i1 ? SOLAR_TERMS[i0] : '';
}
