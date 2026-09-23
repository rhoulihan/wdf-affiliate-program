'use strict';
const fs = require('fs');
const path = require('path');
const LANGS = ['en', 'es', 'pt', 'de'];
describe('locale brand tokens', () => {
  const load = (l) => fs.readFileSync(path.join(__dirname, `../../public/locales/${l}/common.json`), 'utf8');

  test('no locale value names a bare "WaveMAX"; only "WaveMAX Austin" is permitted', () => {
    // Owner decision 2026-09-08: the app must name WaveMAX Austin as the exclusive
    // fulfillment partner (landing.footer.fulfillmentPartner) and ONLY in that
    // capacity. The blanket ban this test used to assert was reversed that day; the
    // rule is now the one tests/unit/branding-guard.test.js INFRA_ALLOW encodes
    // (/WaveMAX Austin/gi, "the ONE permitted use of the mark"). The strip below is
    // case-SENSITIVE on purpose: a lowercase "wavemax austin" is not the mark.
    for (const l of LANGS) {
      expect(/wavemax/i.test(load(l).replace(/WaveMAX Austin/g, ''))).toBe(false);
    }
  });

  test('the sanctioned-literal strip cannot hide a bare mark (positive control)', () => {
    const strip = (s) => s.replace(/WaveMAX Austin/g, '');
    expect(/wavemax/i.test(strip('WaveMAX Austin is our partner'))).toBe(false);
    expect(/wavemax/i.test(strip('WaveMAX Laundry'))).toBe(true);
    expect(/wavemax/i.test(strip('Powered by WaveMAX'))).toBe(true);
    expect(/wavemax/i.test(strip('wavemax austin'))).toBe(true);
  });

  test('the sanctioned disclaimer is actually present (the rule has a subject)', () => {
    // Without this, deleting landing.footer.fulfillmentPartner from all four locales
    // would make the test above pass vacuously.
    for (const l of LANGS) expect(load(l)).toContain('WaveMAX Austin');
  });

  test('the brand token is present in every language', () => {
    for (const l of LANGS) expect(load(l)).toContain('{{brandName}}');
  });
  test('all four files stay structurally parallel', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
    const en = keys(JSON.parse(load('en'))).sort();
    for (const l of ['es', 'pt', 'de']) expect(keys(JSON.parse(load(l))).sort()).toEqual(en);
  });
});
