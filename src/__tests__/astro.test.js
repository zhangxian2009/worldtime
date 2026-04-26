// @ts-check
import { describe, it, expect } from 'vitest';
import {
  solarPosition, moonPhase, moonPositionAt,
  getSunTimes, getMoonPhase, getSolarTerm,
} from '../core/astro.js';

describe('solarPosition', () => {
  it('returns lat/lon shape with degrees in valid range', () => {
    const p = solarPosition();
    expect(p).toHaveProperty('lat');
    expect(p).toHaveProperty('lon');
    expect(Math.abs(p.lat)).toBeLessThanOrEqual(23.5);
    expect(p.lon).toBeGreaterThanOrEqual(-180);
    expect(p.lon).toBeLessThanOrEqual(180);
  });
});

describe('moonPhase', () => {
  it('returns a number in [0, 1)', () => {
    const p = moonPhase();
    expect(typeof p).toBe('number');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });
});

describe('moonPositionAt', () => {
  it('returns lat in [-90, 90] and lon in [-180, 180]', () => {
    const p = moonPositionAt(Date.UTC(2024, 5, 1, 12));
    expect(p.lat).toBeGreaterThanOrEqual(-90);
    expect(p.lat).toBeLessThanOrEqual(90);
    expect(p.lon).toBeGreaterThanOrEqual(-180);
    expect(p.lon).toBeLessThanOrEqual(180);
  });

  it('moves over time (positions differ for distinct timestamps)', () => {
    const a = moonPositionAt(Date.UTC(2024, 0, 1));
    const b = moonPositionAt(Date.UTC(2024, 0, 8));
    expect(a.lat !== b.lat || a.lon !== b.lon).toBe(true);
  });
});

describe('getSunTimes', () => {
  it('summer day at 35°N: sunrise < 6, sunset > 18', () => {
    const { sunrise, sunset } = getSunTimes(new Date(2024, 5, 21)); // June 21
    expect(sunrise).toBeLessThan(6);
    expect(sunset).toBeGreaterThan(18);
  });

  it('winter day at 35°N: sunrise > 6, sunset < 18', () => {
    const { sunrise, sunset } = getSunTimes(new Date(2024, 11, 21)); // Dec 21
    expect(sunrise).toBeGreaterThan(6);
    expect(sunset).toBeLessThan(18);
  });

  it('symmetric around noon', () => {
    const { sunrise, sunset } = getSunTimes(new Date(2024, 5, 1));
    expect(sunrise + sunset).toBeCloseTo(24, 5);
  });
});

describe('getMoonPhase', () => {
  it('returns a number in [0, 1)', () => {
    const p = getMoonPhase(new Date());
    expect(typeof p).toBe('number');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });

  it('phase advances by ~1 over 29.53 days', () => {
    const t0 = Date.UTC(2024, 0, 1);
    const t1 = t0 + 29.530588853 * 86400000;
    const p0 = getMoonPhase(new Date(t0));
    const p1 = getMoonPhase(new Date(t1));
    // After exactly one synodic period, the phase should match
    expect(Math.abs(p0 - p1)).toBeLessThan(0.01);
  });
});

describe('getSolarTerm', () => {
  it('春分 (vernal equinox) ~ March 20-21', () => {
    // Try a few dates around the expected term boundary
    const dates = [
      new Date(2024, 2, 19),
      new Date(2024, 2, 20),
      new Date(2024, 2, 21),
    ];
    const terms = dates.map(d => getSolarTerm(d));
    expect(terms.includes('春分')).toBe(true);
  });

  it('夏至 (summer solstice) ~ June 20-22', () => {
    const dates = [
      new Date(2024, 5, 20),
      new Date(2024, 5, 21),
      new Date(2024, 5, 22),
    ];
    const terms = dates.map(d => getSolarTerm(d));
    expect(terms.includes('夏至')).toBe(true);
  });

  it('returns empty string on non-term days', () => {
    // Mid-month, between terms
    const t = getSolarTerm(new Date(2024, 5, 15));
    expect(t).toBe('');
  });
});
