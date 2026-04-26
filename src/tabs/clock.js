// @ts-check
// Clock TAB：24 小时表盘 + 太阳/月亮 + 时分秒针 + 置顶城市的时针。
// 表盘坐标系约定见 hAng/mAng/sAng 文档。

import { DOM } from '../core/dom-keys.js';
import { getSunTimes, getMoonPhase } from '../core/astro.js';
import { getUTCOffsetHours } from '../core/time-utils.js';

/**
 * @typedef {{
 *   allCities: { id: string, label: string, tz: string }[],
 *   state: import('../core/state.js').AppState,
 * }} ClockDeps
 */

let _deps = /** @type {ClockDeps | null} */ (null);

const clockCanvas = /** @type {HTMLCanvasElement | null} */
  (document.getElementById(DOM.worldClock));
const clockCtx    = clockCanvas ? clockCanvas.getContext('2d') : null;
const CX = 310, CY = 310;
const R_OUTER  = 304;
const R_SHARED = 258;
const R_H_TK_REG  = R_SHARED + 14;
const R_H_TK_KEY  = R_SHARED + 20;
const R_H_TK_HALF = R_SHARED + 11;
const R_H_TK_10   = R_SHARED + 7;
const R_H_LBL     = R_SHARED + 27;
const R_M_TK_MIN = R_SHARED - 9;
const R_M_TK_MAJ = R_SHARED - 21;
const R_M_LBL    = R_SHARED - 36;
const R_IND = R_SHARED - 65;
const CLOCK_AUTO_HIDE_MS = 5 * 60 * 1000;

function clockTheme(dark) {
  const hColor = dark ? 'rgba(195,200,230,0.92)' : '#4466bb';
  const mColor = '#ffffff';
  return {
    outerBg:     dark ? '#1a1b2a' : '#f0f1f5',
    outerBorder: dark ? '#42435a' : '#72728a',
    sharedLine:  dark ? '#3c3d52' : '#8a8aa2',
    hHand: hColor, hTick: hColor, hLabel: hColor, hLabelKey: hColor,
    mHand: mColor, mTick:  mColor, mTickMinor: mColor, mLabel: mColor,
    mShadow: 'rgba(0,0,0,0.75)',
    infoColor: dark ? '#888' : '#666',
  };
}

function clockIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── Clock TAB 坐标系约定 ──────────────────────────────────────────────
//   24 小时表盘：12 (正午) 在顶部，0 (午夜) 在底部
//   公式 (h-12)/24 × 2π - π/2 把 h=12 映射到 -π/2 (Canvas 顶部)
//   关键陷阱：城市标注旋转用 a = h/24 × 360°（新坐标系，0=顶部），
//             与 hAng 相差 180°，混用会导致文字方向反向。

/** 时(h)→Canvas 弧度。 */
function hAng(h) { return (h - 12) / 24 * Math.PI * 2 - Math.PI / 2; }
/** 分(m)→Canvas 弧度。 */
function mAng(m) { return m / 60 * Math.PI * 2 - Math.PI / 2; }
/** 秒(s)→Canvas 弧度。 */
function sAng(s) { return s / 60 * Math.PI * 2 - Math.PI / 2; }

function drawMoonBody(r, phase) {
  const LIT  = '#ccdff5';
  const DARK = 'rgba(10, 12, 26, 0.94)';
  const waxing    = phase <= 0.5;
  const normPhase = waxing ? phase * 2 : 2 * (1 - phase);
  const xr        = r * Math.cos(Math.PI * normPhase);

  clockCtx.save();
  clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
  clockCtx.fillStyle = DARK; clockCtx.fill();

  clockCtx.save();
  if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
  clockCtx.closePath(); clockCtx.clip();
  clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
  clockCtx.fillStyle = LIT; clockCtx.fill();
  clockCtx.restore();

  if (Math.abs(xr) > 0.5) {
    clockCtx.save();
    if (xr > 0) {
      clockCtx.beginPath();
      if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
      clockCtx.closePath(); clockCtx.clip();
      clockCtx.save();
      clockCtx.scale(xr / r, 1);
      clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
      clockCtx.fillStyle = DARK; clockCtx.fill();
      clockCtx.restore();
    } else {
      clockCtx.beginPath();
      if (waxing) clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
      else        clockCtx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      clockCtx.closePath(); clockCtx.clip();
      clockCtx.save();
      clockCtx.scale(-xr / r, 1);
      clockCtx.beginPath(); clockCtx.arc(0, 0, r, 0, Math.PI * 2);
      clockCtx.fillStyle = LIT; clockCtx.fill();
      clockCtx.restore();
    }
    clockCtx.restore();
  }
  clockCtx.restore();
}

function drawClockFace(sunrise, sunset) {
  const R   = R_SHARED;
  const srA = hAng(sunrise);
  const ssA = hAng(sunset);
  const p1x = CX + Math.cos(srA) * R, p1y = CY + Math.sin(srA) * R;
  const p2x = CX + Math.cos(ssA) * R, p2y = CY + Math.sin(ssA) * R;
  const cmX = (p1x + p2x) / 2,        cmY = (p1y + p2y) / 2;

  clockCtx.save();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, 0, Math.PI * 2);
  clockCtx.clip();

  const nGrd = clockCtx.createRadialGradient(CX, CY + R * 0.28, 0, CX, CY, R);
  nGrd.addColorStop(0,   'rgb(32, 28, 24)');
  nGrd.addColorStop(0.5, 'rgb(14, 11,  9)');
  nGrd.addColorStop(1,   'rgb( 5,  4,  7)');
  clockCtx.fillStyle = nGrd;
  clockCtx.fillRect(CX - R, CY - R, R * 2, R * 2);

  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, srA, ssA, false);
  clockCtx.closePath();
  const dGrd = clockCtx.createLinearGradient(CX, CY - R, cmX, cmY);
  dGrd.addColorStop(0,    'rgb(228, 244, 255)');
  dGrd.addColorStop(0.18, 'rgb(188, 226, 255)');
  dGrd.addColorStop(0.44, 'rgb(140, 205, 252)');
  dGrd.addColorStop(0.82, 'rgb(215, 192, 128)');
  dGrd.addColorStop(0.90, 'rgb(255, 158,  38)');
  dGrd.addColorStop(0.96, 'rgb(255, 108,   8)');
  dGrd.addColorStop(1.0,  'rgb(225,  72,   2)');
  clockCtx.fillStyle = dGrd;
  clockCtx.fill();

  clockCtx.save();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R, ssA, srA, false);
  clockCtx.closePath();
  clockCtx.clip();
  const midX = CX + Math.cos(hAng(0)) * R * 0.32;
  const midY = CY + Math.sin(hAng(0)) * R * 0.32;
  const gGrd = clockCtx.createLinearGradient(cmX, cmY, midX, midY);
  gGrd.addColorStop(0,    'rgba(205, 75,  8, 0.55)');
  gGrd.addColorStop(0.035,'rgba(165, 55,  5, 0.30)');
  gGrd.addColorStop(0.075,'rgba( 95, 30,  3, 0.12)');
  gGrd.addColorStop(0.12, 'rgba(  0,  0,  0, 0.00)');
  clockCtx.fillStyle = gGrd;
  clockCtx.fillRect(CX - R, CY - R, R * 2, R * 2);
  clockCtx.restore();

  clockCtx.restore();
}

function drawClockOuterRing(t) {
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_OUTER,  0, Math.PI * 2, false);
  clockCtx.arc(CX, CY, R_SHARED, 0, Math.PI * 2, true);
  clockCtx.fillStyle = t.outerBg;
  clockCtx.fill();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_OUTER, 0, Math.PI * 2);
  clockCtx.strokeStyle = t.outerBorder;
  clockCtx.lineWidth = 1.5;
  clockCtx.stroke();
  clockCtx.beginPath();
  clockCtx.arc(CX, CY, R_SHARED, 0, Math.PI * 2);
  clockCtx.strokeStyle = t.sharedLine;
  clockCtx.lineWidth = 1;
  clockCtx.stroke();
}

function drawClockHourScale(t) {
  for (let h = 0; h < 24; h++) {
    for (const min of [10, 20, 30, 40, 50]) {
      const a    = hAng(h + min / 60);
      const rOut = min === 30 ? R_H_TK_HALF : R_H_TK_10;
      clockCtx.beginPath();
      clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
      clockCtx.lineTo(CX + Math.cos(a) * rOut,     CY + Math.sin(a) * rOut);
      clockCtx.strokeStyle = t.hTick;
      clockCtx.lineWidth   = min === 30 ? 1.0 : 0.7;
      clockCtx.stroke();
    }
  }
  for (let h = 0; h < 24; h++) {
    const a     = hAng(h);
    const isKey = h === 0 || h === 6 || h === 12 || h === 18;
    const rOut  = isKey ? R_H_TK_KEY : R_H_TK_REG;
    clockCtx.beginPath();
    clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
    clockCtx.lineTo(CX + Math.cos(a) * rOut,     CY + Math.sin(a) * rOut);
    clockCtx.strokeStyle = t.hTick;
    clockCtx.lineWidth   = isKey ? 2.2 : 1.2;
    clockCtx.stroke();
    const lx = CX + Math.cos(a) * R_H_LBL;
    const ly = CY + Math.sin(a) * R_H_LBL;
    clockCtx.save();
    clockCtx.translate(lx, ly);
    clockCtx.fillStyle = isKey ? t.hLabelKey : t.hLabel;
    clockCtx.font      = isKey ? 'bold 12px Arial' : '11px Arial';
    clockCtx.textAlign = 'center';
    clockCtx.textBaseline = 'middle';
    clockCtx.fillText(String(h), 0, 0);
    clockCtx.restore();
  }
}

function drawClockMinuteScale(t) {
  for (let m = 0; m < 60; m++) {
    const a   = mAng(m);
    const maj = m % 5 === 0;
    const rIn = maj ? R_M_TK_MAJ : R_M_TK_MIN;
    clockCtx.beginPath();
    clockCtx.moveTo(CX + Math.cos(a) * R_SHARED, CY + Math.sin(a) * R_SHARED);
    clockCtx.lineTo(CX + Math.cos(a) * rIn,      CY + Math.sin(a) * rIn);
    clockCtx.strokeStyle = maj ? t.mTick : t.mTickMinor;
    clockCtx.lineWidth   = maj ? 1.8 : 1.4;
    clockCtx.stroke();
    if (maj) {
      const lx = CX + Math.cos(a) * R_M_LBL;
      const ly = CY + Math.sin(a) * R_M_LBL;
      clockCtx.save();
      clockCtx.translate(lx, ly);
      clockCtx.fillStyle    = t.mLabel;
      clockCtx.shadowColor  = t.mShadow;
      clockCtx.shadowBlur   = 4;
      clockCtx.font         = 'bold 11px Arial';
      clockCtx.textAlign    = 'center';
      clockCtx.textBaseline = 'middle';
      clockCtx.fillText(String(m), 0, 0);
      clockCtx.restore();
    }
  }
}

function drawClockSunMoon(now, sunrise, sunset) {
  const h     = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const isDay = h >= sunrise && h <= sunset;
  const a     = hAng(h);
  const sx    = CX + Math.cos(a) * R_IND;
  const sy    = CY + Math.sin(a) * R_IND;
  const r     = 10;

  clockCtx.save();
  clockCtx.translate(sx, sy);
  if (isDay) {
    const g = clockCtx.createRadialGradient(0, 0, 4, 0, 0, 24);
    g.addColorStop(0, 'rgba(255,235,55,0.55)');
    g.addColorStop(1, 'rgba(255,188, 0,  0)');
    clockCtx.beginPath(); clockCtx.arc(0, 0, 24, 0, Math.PI * 2);
    clockCtx.fillStyle = g; clockCtx.fill();
    clockCtx.beginPath(); clockCtx.arc(0, 0, r - 2, 0, Math.PI * 2);
    clockCtx.fillStyle   = '#FFE040';
    clockCtx.shadowColor = '#FFD000'; clockCtx.shadowBlur = 14;
    clockCtx.fill();
    clockCtx.shadowBlur = 0;
    for (let i = 0; i < 8; i++) {
      const ri = i / 8 * Math.PI * 2;
      clockCtx.beginPath();
      clockCtx.moveTo(Math.cos(ri) * (r + 1), Math.sin(ri) * (r + 1));
      clockCtx.lineTo(Math.cos(ri) * (r + 6), Math.sin(ri) * (r + 6));
      clockCtx.strokeStyle = 'rgba(255,228,55,0.85)';
      clockCtx.lineWidth = 1.6; clockCtx.stroke();
    }
  } else {
    const phase = getMoonPhase(now);
    const glow = clockCtx.createRadialGradient(0, 0, r * 0.85, 0, 0, r + 22);
    glow.addColorStop(0,   'rgba(200, 220, 255, 0.28)');
    glow.addColorStop(0.5, 'rgba(175, 205, 255, 0.10)');
    glow.addColorStop(1,   'rgba(150, 185, 255, 0.00)');
    clockCtx.beginPath(); clockCtx.arc(0, 0, r + 22, 0, Math.PI * 2);
    clockCtx.fillStyle = glow; clockCtx.fill();
    drawMoonBody(r, phase);
  }
  clockCtx.restore();
}

/** 通用指针：从中心向 a 方向延伸 len，反向延伸 len*back。 */
function drawClockHand(a, len, width, color, back) {
  clockCtx.beginPath();
  clockCtx.moveTo(CX - Math.cos(a) * len * back, CY - Math.sin(a) * len * back);
  clockCtx.lineTo(CX + Math.cos(a) * len,         CY + Math.sin(a) * len);
  clockCtx.strokeStyle = color; clockCtx.lineWidth = width; clockCtx.lineCap = 'round';
  clockCtx.stroke();
}

function drawClockHands(now, showSecond, t) {
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const m = now.getMinutes() + now.getSeconds() / 60;
  const s = now.getSeconds();

  clockCtx.save(); clockCtx.shadowColor='rgba(0,0,0,0.55)'; clockCtx.shadowBlur=6;
  drawClockHand(hAng(h), 143, 5.5, t.hHand, 0.18);
  clockCtx.restore();

  clockCtx.save(); clockCtx.shadowColor='rgba(0,0,0,0.45)'; clockCtx.shadowBlur=4;
  drawClockHand(mAng(m), 195, 3.0, t.mHand, 0.15);
  clockCtx.restore();

  if (showSecond) {
    clockCtx.save(); clockCtx.shadowColor='rgba(255,70,70,0.55)'; clockCtx.shadowBlur=7;
    drawClockHand(sAng(s), 211, 1.5, '#FF5050', 0.22);
    clockCtx.restore();
  }

  clockCtx.save();
  if (showSecond) {
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 6.5, 0, Math.PI * 2);
    clockCtx.fillStyle = '#FF5050'; clockCtx.shadowColor = '#FF3030'; clockCtx.shadowBlur = 10;
    clockCtx.fill();
    clockCtx.shadowBlur = 0;
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 3, 0, Math.PI * 2);
    clockCtx.fillStyle = '#fff'; clockCtx.fill();
  } else {
    clockCtx.beginPath(); clockCtx.arc(CX, CY, 4, 0, Math.PI * 2);
    clockCtx.fillStyle = 'rgba(220,235,255,0.85)';
    clockCtx.shadowColor = 'rgba(0,0,0,0.5)'; clockCtx.shadowBlur = 5;
    clockCtx.fill();
  }
  clockCtx.restore();
}

/** 绘制置顶城市的时针 + 标注。 */
function drawCityHands() {
  if (!_deps) return;
  const { allCities, state } = _deps;
  if (!state.selection.pinned || state.selection.pinned.length === 0) return;

  // 蓝色色板：同色系，由深到浅
  const colors = ['#4466bb', '#5588dd', '#77aaee', '#99bff5', '#bbcffa'];
  const now = new Date();

  state.selection.pinned.forEach((cityId, idx) => {
    const city = allCities.find(c => c.id === cityId);
    if (!city || !city.label) return;

    const offsetHour = getUTCOffsetHours(city.tz);
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const h = (utcHours + offsetHour) % 24;

    // 时针
    const a_hand = hAng(h);
    clockCtx.save();
    clockCtx.shadowColor = 'rgba(0,0,0,0.4)';
    clockCtx.shadowBlur = 4;
    drawClockHand(a_hand, 155, 4, colors[idx % colors.length], 0.15);
    clockCtx.restore();

    // 标注（沿时针方向，应用 Y 轴规则）
    const labelDist = 101;
    const labelX = CX + Math.cos(a_hand) * labelDist;
    const labelY = CY + Math.sin(a_hand) * labelDist;

    clockCtx.save();
    clockCtx.translate(labelX, labelY);
    // a > 180：Y = a；a <= 180：Y = a + 180°（翻转使文字朝向一致）
    const a_user = (h / 24) * 360;
    let rotationAngle = a_hand;
    if (a_user <= 180) rotationAngle += Math.PI;
    clockCtx.rotate(rotationAngle);

    clockCtx.font = 'bold 11px Arial';
    clockCtx.textAlign = 'center';
    clockCtx.textBaseline = 'middle';
    clockCtx.strokeStyle = 'rgba(80,80,80,0.8)';
    clockCtx.lineWidth = 2;
    clockCtx.lineCap = 'round';
    clockCtx.lineJoin = 'round';
    clockCtx.strokeText(city.label, 0, 0);
    clockCtx.fillStyle = 'rgba(255,255,255,0.9)';
    clockCtx.fillText(city.label, 0, 0);
    clockCtx.restore();
  });
}

/** 完整重绘表盘一帧。 */
export function drawClockFrame() {
  if (!clockCtx || !_deps || !clockCanvas) return;
  const { state } = _deps;
  const now = new Date();
  const { sunrise, sunset } = getSunTimes(now);
  const t = clockTheme(clockIsDark());

  clockCtx.clearRect(0, 0, clockCanvas.width, clockCanvas.height);
  clockCtx.save();
  clockCtx.beginPath(); clockCtx.arc(CX, CY, R_OUTER, 0, Math.PI * 2); clockCtx.clip();

  drawClockFace(sunrise, sunset);
  drawClockOuterRing(t);
  drawClockHourScale(t);
  drawClockMinuteScale(t);
  drawClockSunMoon(now, sunrise, sunset);
  drawClockHands(now, state.clock.showSecond, t);
  drawCityHands();

  clockCtx.restore();
}

/** 停秒针模式：清秒级定时器，对齐到下一整分钟开始分钟级刷新。 */
function stopClockSecondMode() {
  if (!_deps) return;
  const { state } = _deps;
  if (state.clock.secondTimer) { clearInterval(state.clock.secondTimer); state.clock.secondTimer = null; }
  if (state.clock.autoHideTimeout) { clearTimeout(state.clock.autoHideTimeout); state.clock.autoHideTimeout = null; }
  state.clock.showSecond = false;

  const now = new Date();
  const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    drawClockFrame();
    state.clock.updateInterval = setInterval(drawClockFrame, 60000);
  }, delay);
  drawClockFrame();
}

/** 启秒针模式：1Hz 刷新，5 分钟后自动降级。 */
function startClockSecondMode() {
  if (!_deps) return;
  const { state } = _deps;
  if (state.clock.updateInterval) { clearInterval(state.clock.updateInterval); state.clock.updateInterval = null; }
  if (state.clock.secondTimer) { clearInterval(state.clock.secondTimer); }
  state.clock.showSecond = true;
  state.clock.secondTimer = setInterval(drawClockFrame, 1000);
  drawClockFrame();
  if (state.clock.autoHideTimeout) clearTimeout(state.clock.autoHideTimeout);
  state.clock.autoHideTimeout = setTimeout(stopClockSecondMode, CLOCK_AUTO_HIDE_MS);
}

function initClockCanvas() {
  if (!clockCtx || !clockCanvas) return;
  if (!clockCanvas._secondToggleAdded) {
    clockCanvas.addEventListener('dblclick', e => {
      const rect = clockCanvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - CX;
      const dy = e.clientY - rect.top - CY;
      if (dx * dx + dy * dy > 60 * 60) return;  // Only within center circle
      if (_deps?.state.clock.showSecond) stopClockSecondMode();
      else                               startClockSecondMode();
    });
    clockCanvas._secondToggleAdded = true;
  }
  startClockSecondMode();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawClockFrame);
}

/** 注入依赖。在主入口处调用一次。 */
export function configureClock(/** @type {ClockDeps} */ deps) {
  _deps = deps;
}

/** 切到 Clock TAB 时调用：首次会初始化 canvas + 事件 + 启动定时器。 */
export function ensureClockInit() {
  if (!_deps) return;
  if (!_deps.state.clock.initialized && clockCtx) {
    initClockCanvas();
    _deps.state.clock.initialized = true;
  }
}

/** 切到 Clock TAB 时强制重绘一次。 */
export function updateClockPanel() {
  drawClockFrame();
}
