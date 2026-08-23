'use strict';
describe('brand config', () => {
  const KEYS = ['BRAND_DISPLAY_NAME', 'BRAND_SHORT_NAME', 'BRAND_LEGAL_NAME', 'BRAND_INSTANCE_NAME'];
  let saved;
  beforeEach(() => { saved = {}; KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); jest.resetModules(); });
  afterEach(() => { KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('defaults are generic (no "WaveMAX" in code)', () => {
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Laundromat');
    expect(brand.shortName).toBe('Laundromat');
    expect(brand.legalName).toBe('CRHS Enterprises, LLC');
    expect(brand.instanceName).toBe('laundromat');
  });

  test('env overrides the display value', () => {
    process.env.BRAND_DISPLAY_NAME = 'WaveMAX Austin';
    jest.resetModules();
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('WaveMAX Austin');
  });
});
