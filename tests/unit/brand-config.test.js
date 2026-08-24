'use strict';
describe('brand config', () => {
  const KEYS = ['BRAND_DISPLAY_NAME', 'BRAND_SHORT_NAME', 'BRAND_LEGAL_NAME', 'BRAND_INSTANCE_NAME',
    'BRAND_LOGO_PATH', 'BRAND_OG_IMAGE_PATH'];
  let saved;
  beforeEach(() => { saved = {}; KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); jest.resetModules(); });
  afterEach(() => { KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('defaults are generic (no franchisor mark in code)', () => {
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Laundromat');
    expect(brand.shortName).toBe('Laundromat');
    expect(brand.legalName).toBe('CRHS Enterprises, LLC');
    expect(brand.instanceName).toBe('laundromat');
  });

  test('env overrides the display value', () => {
    process.env.BRAND_DISPLAY_NAME = 'Acme Wash';
    jest.resetModules();
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Acme Wash');
  });

  test('image paths default to neutral asset locations', () => {
    const brand = require('../../server/config/brand');
    expect(brand.logoPath).toBe('/assets/images/brand/logo.png');
    expect(brand.ogImagePath).toBe('/assets/images/affiliate-ad-og.png');
  });

  test('BRAND_LOGO_PATH / BRAND_OG_IMAGE_PATH env override the image paths', () => {
    process.env.BRAND_LOGO_PATH = '/custom/logo.svg';
    process.env.BRAND_OG_IMAGE_PATH = '/custom/og.png';
    jest.resetModules();
    const brand = require('../../server/config/brand');
    expect(brand.logoPath).toBe('/custom/logo.svg');
    expect(brand.ogImagePath).toBe('/custom/og.png');
  });
});
