// @ts-check
import { describe, it, expect } from 'vitest';
import {
  getUTCOffset, getUTCOffsetHours, localTimeStr,
  fmtHHMM, getHourMinute, localDateLabel,
} from '../core/time-utils.js';

describe('getUTCOffsetHours', () => {
  it('Asia/Shanghai is UTC+8', () => {
    expect(getUTCOffsetHours('Asia/Shanghai')).toBeCloseTo(8, 5);
  });

  it('UTC is 0', () => {
    expect(getUTCOffsetHours('UTC')).toBeCloseTo(0, 5);
  });

  it('Asia/Kolkata is UTC+5.5 (half-hour offset)', () => {
    expect(getUTCOffsetHours('Asia/Kolkata')).toBeCloseTo(5.5, 5);
  });
});

describe('getUTCOffset', () => {
  it('Asia/Shanghai is "UTC+8"', () => {
    expect(getUTCOffset('Asia/Shanghai')).toBe('UTC+8');
  });

  it('Asia/Kolkata is "UTC+5:30"', () => {
    expect(getUTCOffset('Asia/Kolkata')).toBe('UTC+5:30');
  });
});

describe('localTimeStr', () => {
  it('returns HH:MM format', () => {
    const s = localTimeStr('Asia/Shanghai');
    expect(s).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('fmtHHMM', () => {
  it('formats UTC ms in target timezone', () => {
    // Jan 1, 2024 00:00 UTC = 08:00 in Shanghai
    const ms = Date.UTC(2024, 0, 1, 0, 0);
    expect(fmtHHMM('Asia/Shanghai', ms)).toBe('08:00');
  });

  it('Beijing 12:00 vs Tokyo 13:00 (1h offset)', () => {
    // Pick a UTC time
    const ms = Date.UTC(2024, 5, 1, 4, 0); // 04:00 UTC
    expect(fmtHHMM('Asia/Shanghai', ms)).toBe('12:00');
    expect(fmtHHMM('Asia/Tokyo',    ms)).toBe('13:00');
  });
});

describe('getHourMinute', () => {
  it('returns hour-of-day as decimal (h + m/60)', () => {
    const ms = Date.UTC(2024, 5, 1, 4, 30); // 04:30 UTC = 12:30 Shanghai
    expect(getHourMinute('Asia/Shanghai', ms)).toBeCloseTo(12.5, 5);
  });
});

describe('localDateLabel', () => {
  it('returns "M/D" format', () => {
    const label = localDateLabel('Asia/Shanghai', Date.UTC(2024, 5, 15));
    expect(label).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });
});
