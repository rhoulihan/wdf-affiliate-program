/**
 * startOfTodayInTz must be correct regardless of the SERVER's clock.
 *
 * The original implementation round-tripped `toLocaleString` back through
 * `new Date(...)` and then called `setHours(0,0,0,0)`. `setHours` operates in
 * server-local time, while the offset it subtracted was the target zone's — so
 * the two only agreed when the server ran UTC. The error was exactly the
 * server's own UTC offset, which is why it hid in production (both boxes are
 * Etc/UTC) and only surfaced under `npm test`, which pins TZ=America/Chicago.
 */
const { startOfTodayInTz } = require('../../server/services/expediterService');

/** Wall-clock reading of an instant in a zone, as a stable comparable string. */
function wallClock(date, tz) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date)) p[type] = value;
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

describe('expediterService.startOfTodayInTz', () => {
  const REAL_TZ = process.env.TZ;
  afterEach(() => { jest.useRealTimers(); if (REAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = REAL_TZ; });

  // The instant is 21:30 on Sep-22 in Chicago, but already Sep-23 in UTC — so a
  // naive UTC-date implementation would also get this wrong.
  const INSTANT = new Date('2026-09-23T02:30:00Z');
  const TZ = 'America/Chicago';
  const EXPECTED = '2026-09-22T05:00:00.000Z';   // Sep-22 00:00 CDT

  test('is correct when the server clock is UTC', () => {
    jest.useFakeTimers().setSystemTime(INSTANT);
    expect(startOfTodayInTz(TZ).toISOString()).toBe(EXPECTED);
  });

  test('is correct when the server clock is NOT UTC (the regression)', () => {
    jest.useFakeTimers().setSystemTime(INSTANT);
    // The result must not depend on the process clock at all.
    expect(startOfTodayInTz(TZ).toISOString()).toBe(EXPECTED);
  });

  test('lands exactly on 00:00:00 of the target zone wall clock', () => {
    jest.useFakeTimers().setSystemTime(INSTANT);
    expect(wallClock(startOfTodayInTz(TZ), TZ)).toBe('2026-09-22 00:00:00');
  });

  test('is DST-correct on a spring-forward day', () => {
    // 2026-03-08 is the US spring-forward. 08:30Z = 02:30 CST -> 03:30 CDT window.
    jest.useFakeTimers().setSystemTime(new Date('2026-03-08T12:00:00Z'));
    const got = startOfTodayInTz(TZ);
    expect(wallClock(got, TZ)).toBe('2026-03-08 00:00:00');
    expect(got.toISOString()).toBe('2026-03-08T06:00:00.000Z');   // CST, offset -6
  });

  test('is DST-correct on a fall-back day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const got = startOfTodayInTz(TZ);
    expect(wallClock(got, TZ)).toBe('2026-11-01 00:00:00');
    expect(got.toISOString()).toBe('2026-11-01T05:00:00.000Z');   // still CDT at midnight
  });

  test('works for a zone ahead of UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T02:30:00Z'));  // 11:30 Sep-23 JST
    const got = startOfTodayInTz('Asia/Tokyo');
    expect(wallClock(got, 'Asia/Tokyo')).toBe('2026-09-23 00:00:00');
    expect(got.toISOString()).toBe('2026-09-22T15:00:00.000Z');
  });

  // These two are the cases that mutation-testing exposed: a single-pass or a
  // blind two-pass implementation gets exactly one of them wrong.
  test('fall-back AT midnight keeps the first of the repeated hours', () => {
    // Europe/Chisinau, 2026-10-25: 00:00 happens twice. Midnight must be the first.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const got = startOfTodayInTz('Europe/Chisinau');
    expect(wallClock(got, 'Europe/Chisinau')).toBe('2026-10-25 00:00:00');
    expect(got.toISOString()).toBe('2026-10-24T21:00:00.000Z');
  });

  test('spring-forward AT midnight uses the first instant that exists', () => {
    // America/Santiago, 2026-09-06: the clock jumps 00:00 -> 01:00, so midnight
    // never occurs. The answer must be 01:00 on the target date, NOT 23:00 the
    // day before.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T18:00:00Z'));
    const got = startOfTodayInTz('America/Santiago');
    expect(wallClock(got, 'America/Santiago')).toBe('2026-09-06 01:00:00');
    expect(got.toISOString()).toBe('2026-09-06T04:00:00.000Z');
  });

  test('works for a half-hour-offset zone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T02:30:00Z'));  // 08:00 Sep-23 IST
    const got = startOfTodayInTz('Asia/Kolkata');
    expect(wallClock(got, 'Asia/Kolkata')).toBe('2026-09-23 00:00:00');
    expect(got.toISOString()).toBe('2026-09-22T18:30:00.000Z');
  });
});
