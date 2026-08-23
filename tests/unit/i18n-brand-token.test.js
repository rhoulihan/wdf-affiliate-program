'use strict';
const fs = require('fs');
const path = require('path');
const LANGS = ['en', 'es', 'pt', 'de'];
describe('locale brand tokens', () => {
  const load = (l) => fs.readFileSync(path.join(__dirname, `../../public/locales/${l}/common.json`), 'utf8');
  test('no locale value contains a bare "WaveMAX"', () => {
    for (const l of LANGS) expect(/wavemax/i.test(load(l))).toBe(false);
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
