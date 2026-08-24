#!/usr/bin/env node
/**
 * Asset minifier — produces `.min.css` / `.min.js` siblings for the static
 * assets that load on the indexable franchise pages, so Lighthouse's
 * "Minify CSS/JavaScript" audits pass without us hand-editing minified code.
 *
 * The readable source files stay authoritative — edit those, then re-run
 * `npm run build:assets` and commit both. The generated outputs carry a
 * "GENERATED" banner; never edit them by hand.
 *
 * Scope note: only the assets on the embedded-app critical path are listed.
 * Add more pairs here as other pages get the same treatment — references must
 * be switched to the `.min` filename in the page(s) that load them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { minify: terserMinify } = require('terser');
const csso = require('csso');

const ROOT = path.resolve(__dirname, '..');

// [type, source (relative to repo root), output]
const ASSETS = [
  ['css', 'public/assets/css/wavemax-components.css',       'public/assets/css/wavemax-components.min.css'],
  ['js',  'public/assets/js/iframe-bridge-v2.js',           'public/assets/js/iframe-bridge-v2.min.js'],
  ['js',  'public/assets/js/parent-iframe-bridge-v3.js',    'public/assets/js/parent-iframe-bridge-v3.min.js'],
  ['js',  'public/assets/js/embed-app-v2.js',               'public/assets/js/embed-app-v2.min.js'],
];

function banner(src) {
  return `/* GENERATED from ${src} by scripts/build-assets.js — do not edit; run "npm run build:assets" */\n`;
}

async function build() {
  let totalIn = 0, totalOut = 0;
  for (const [type, srcRel, outRel] of ASSETS) {
    const srcAbs = path.join(ROOT, srcRel);
    const outAbs = path.join(ROOT, outRel);
    const code = fs.readFileSync(srcAbs, 'utf8');
    let out;
    if (type === 'css') {
      out = csso.minify(code, { restructure: true }).css;
    } else {
      const res = await terserMinify(code, {
        compress: true,
        mangle: true,
        format: { comments: false },
      });
      if (res.error) throw res.error;
      out = res.code;
    }
    out = banner(path.basename(srcRel)) + out + '\n';
    fs.writeFileSync(outAbs, out);
    const inKb = (Buffer.byteLength(code) / 1024).toFixed(1);
    const outKb = (Buffer.byteLength(out) / 1024).toFixed(1);
    totalIn += Buffer.byteLength(code);
    totalOut += Buffer.byteLength(out);
    console.log(`  ${path.basename(srcRel).padEnd(30)} ${inKb} KB -> ${outKb} KB`);
  }
  console.log(`  total: ${(totalIn / 1024).toFixed(1)} KB -> ${(totalOut / 1024).toFixed(1)} KB`);
}

build().catch((err) => { console.error(err); process.exit(1); });
