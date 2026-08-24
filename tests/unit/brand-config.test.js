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

  // Regression: scripts/ops/resend-welcome-email.js required the email stack
  // before calling dotenv.config(), so brand froze to the 'Laundromat' fallback
  // and every script-sent email was mis-branded in BOTH the From display name
  // (transport.js) and the subject (dispatcher/affiliate.js). The values must
  // resolve when read, not when the module is first imported.
  test('resolves at access time, so an env load after import still applies', () => {
    jest.resetModules();
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Laundromat'); // nothing set at import time
    process.env.BRAND_DISPLAY_NAME = 'Acme Wash'; // a late dotenv.config()
    process.env.BRAND_LOGO_PATH = '/custom/late.png';
    expect(brand.displayName).toBe('Acme Wash');
    expect(brand.logoPath).toBe('/custom/late.png');
  });
});
