// @ts-check
import { describe, it, expect } from 'vitest';
import {
  lerp2, lerp3, lightLevel, getColorRGB,
  compBgRGB, compTextColor,
} from '../core/color-utils.js';

describe('lerp2', () => {
  it('returns rounded integer arrays', () => {
    const r = lerp2([0, 0, 0], [255, 255, 255], 0.5);
    expect(r).toEqual([128, 128, 128]);
  });

  it('t=0 returns first color', () => {
    expect(lerp2([1, 2, 3], [10, 20, 30], 0)).toEqual([1, 2, 3]);
  });

  it('t=1 returns second color', () => {
    expect(lerp2([1, 2, 3], [10, 20, 30], 1)).toEqual([10, 20, 30]);
  });
});

describe('lerp3', () => {
  it('t=0 returns first', () => {
    expect(lerp3([0,0,0], [128,128,128], [255,255,255], 0)).toEqual([0,0,0]);
  });
  it('t=0.5 returns mid', () => {
    expect(lerp3([0,0,0], [128,128,128], [255,255,255], 0.5)).toEqual([128,128,128]);
  });
  it('t=1 returns last', () => {
    expect(lerp3([0,0,0], [128,128,128], [255,255,255], 1)).toEqual([255,255,255]);
  });
});

describe('lightLevel', () => {
  it('深夜 (3 AM) = 0', () => {
    expect(lightLevel(3)).toBe(0);
  });

  it('正午 (12) = 1', () => {
    expect(lightLevel(12)).toBe(1);
  });

  it('傍晚边缘有过渡', () => {
    const v = lightLevel(19);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe('getColorRGB', () => {
  it('深夜 = NIGHT [90,95,110]', () => {
    expect(getColorRGB(2)).toEqual([90, 95, 110]);
  });
  it('正午 = DAY [255,255,245]', () => {
    expect(getColorRGB(12)).toEqual([255, 255, 245]);
  });
});

describe('compBgRGB', () => {
  it('深夜返回灰色', () => {
    expect(compBgRGB(2)).toEqual([200, 206, 216]);
  });
  it('白天返回近白色', () => {
    expect(compBgRGB(13)).toEqual([250, 250, 248]);
  });
});

describe('compTextColor', () => {
  it('白天 (9-19) 是绿色', () => {
    expect(compTextColor(10)).toBe('#1a9a32');
    expect(compTextColor(19)).toBe('#1a9a32');
  });
  it('黄昏 (20-21) 是琥珀色', () => {
    expect(compTextColor(20)).toBe('#c87800');
    expect(compTextColor(7)).toBe('#c87800');
  });
  it('深夜是红色', () => {
    expect(compTextColor(2)).toBe('#cc2020');
    expect(compTextColor(23)).toBe('#cc2020');
  });
});
