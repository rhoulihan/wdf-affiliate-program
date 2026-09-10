// Shared allowlist guard for "WaveMAX" mentions on the public partner-program
// page (public/partner-program.html).
//
// Background: earlier de-branding work asserted the page carried ZERO
// WaveMAX branding. The owner reversed that specific rule on 2026-09-08 —
// the page must now name WaveMAX Austin as the exclusive fulfillment
// partner for the atxwashdryfold program, and ONLY in that capacity. So a
// blanket ban is permanently obsolete, but any unsanctioned WaveMAX mention
// (a stray marketing tagline, a re-introduced franchise reference, etc.)
// must still fail the guard.
//
// This is an ALLOWLIST, not a ban: every case-insensitive occurrence of
// "wavemax" in the served HTML must fall within one of the sanctioned
// substrings below (matched by exact character range, not just "the line
// looks ok"), or the check fails and names the offending context.

// The exact, sanctioned fulfillment-partner references. Each may legitimately
// repeat (the href appears multiple times on the page).
const SANCTIONED_SUBSTRINGS = [
  'https://www.wavemaxlaundry.com/austin-tx',   // the fulfillment-partner store link (href, repeats)
  '>WaveMAX Austin<',                            // the visible link text naming the partner
  'aria-label="WaveMAX Austin store"',           // the accessible name for the store link
];

function sanctionedRanges(html) {
  const ranges = [];
  for (const pat of SANCTIONED_SUBSTRINGS) {
    let idx = html.indexOf(pat);
    while (idx !== -1) {
      ranges.push([idx, idx + pat.length]);
      idx = html.indexOf(pat, idx + 1);
    }
  }
  return ranges;
}

function isWithinSanctionedRange(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Checks every case-insensitive "wavemax" occurrence in `html` against the
 * sanctioned fulfillment-partner references.
 * @param {string} html
 * @returns {{ unsanctioned: Array<{ index: number, context: string }> }}
 *   `unsanctioned` is empty when every occurrence is sanctioned; otherwise it
 *   lists each offending occurrence with a snippet of surrounding markup.
 */
function allWavemaxOccurrencesAreSanctioned(html) {
  const ranges = sanctionedRanges(html);
  const re = /wavemax/gi;
  const unsanctioned = [];
  let m;
  while ((m = re.exec(html))) {
    if (!isWithinSanctionedRange(m.index, ranges)) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(html.length, m.index + 40);
      unsanctioned.push({ index: m.index, context: html.slice(start, end) });
    }
  }
  return { unsanctioned };
}

module.exports = { allWavemaxOccurrencesAreSanctioned, SANCTIONED_SUBSTRINGS };
