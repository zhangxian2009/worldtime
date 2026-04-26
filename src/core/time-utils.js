// @ts-check
// 时区/时间工具模块（纯函数，无 DOM 依赖）

/** 返回时区的 UTC 偏移字符串。形如 "UTC+8" / "UTC-5:30"。 */
export function getUTCOffset(/** @type {string} */ tz) {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone:'UTC' });
  const tzStr  = now.toLocaleString('en-US', { timeZone: tz });
  const diffMin = Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000);
  const h = Math.floor(Math.abs(diffMin) / 60);
  const m = Math.abs(diffMin) % 60;
  const sign = diffMin >= 0 ? '+' : '-';
  return `UTC${sign}${h}${m ? ':'+String(m).padStart(2,'0') : ''}`;
}

/** 返回时区相对 UTC 的偏移小时数（含小数，例如印度返回 5.5）。 */
export function getUTCOffsetHours(/** @type {string} */ tz) {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone:'UTC' });
  const tzStr  = now.toLocaleString('en-US', { timeZone: tz });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
}

/** 当前时刻在指定时区的 HH:MM 字符串。 */
export function localTimeStr(/** @type {string} */ tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:false
  }).format(new Date());
}

const _fmtCache = /** @type {Record<string, Intl.DateTimeFormat>} */ ({});

/** 返回时区在 ms 时刻的"小时 + 分钟/60"小数。 */
export function getHourMinute(/** @type {string} */ tz, /** @type {number} */ ms) {
  if (!_fmtCache[tz]) {
    _fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:false
    });
  }
  const parts = _fmtCache[tz].formatToParts(new Date(ms));
  const h = parseInt(parts.find(p=>p.type==='hour').value);
  const m = parseInt(parts.find(p=>p.type==='minute').value);
  return h + m/60;
}

/** 返回 UTC 时间戳：指定时区今天（+offsetDays 天）的本地午夜对应的 UTC ms。 */
export function localDayStartMs(/** @type {string} */ tz, /** @type {number} */ offsetDays) {
  const now = new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now); // "2026-03-28"
  const [y, m, d] = localDate.split('-').map(Number);
  const approxMs = Date.UTC(y, m - 1, d + offsetDays);
  const probe = new Date(approxMs);
  const offsetMs = new Date(probe.toLocaleString('en-US', { timeZone: tz })).getTime()
                 - new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return approxMs - offsetMs;
}

/** 把 UTC 时间戳格式化为指定时区的 "M/D" 字符串。 */
export function localDateLabel(/** @type {string} */ tz, /** @type {number} */ utcDayMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month:'numeric', day:'numeric'
  }).formatToParts(new Date(utcDayMs + 12*3600000));
  const M = parts.find(p=>p.type==='month').value;
  const D = parts.find(p=>p.type==='day').value;
  return `${M}/${D}`;
}

/** 把 UTC 时间戳格式化为指定时区的 "HH:MM" 字符串。 */
export function fmtHHMM(/** @type {string} */ tz, /** @type {number} */ ms) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:false
  }).format(new Date(ms));
}
