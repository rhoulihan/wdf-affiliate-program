// scripts/ensure-indexes.js — the MODEL LIST only, asserted as TEXT (Plan 3 task 45 / PR B13).
//
// This suite deliberately never `require`s that script. It is a bare top-level
// IIFE: requiring it calls dotenv.config() and mongoose.connect() against
// whatever MONGODB_URI names, i.e. the PRODUCTION Oracle ADB, and it reads
// process.argv zero times, so there is no --dry-run to hide behind. Every
// assertion below therefore reads the file as a string.
//
// What task 45 changed: MediatorAccess was removed. The four Access* models and
// MediatorAccess are owned and provisioned by crhs-corporate
// (crhs-corporate/scripts/ensure-indexes.js), so this app no longer registers
// them at all. NOTHING was added — extending this script's model list while it
// keeps this shape is a separate, riskier change (createIndexes on a collection
// whose data violates a new unique index fails at provision time), recorded as
// an escalation instead.

const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ensure-indexes.js');
const src = fs.readFileSync(SCRIPT, 'utf8');
const GATE_MODELS = ['AccessClick', 'AccessGate', 'AccessRequest', 'AccessWhitelist', 'MediatorAccess'];

describe('scripts/ensure-indexes.js model list (static assertions only)', () => {
  it('is never required by this suite — the script connects on require', () => {
    const loaded = Object.keys(require.cache)
      .filter((p) => p.replace(/\\/g, '/').endsWith('scripts/ensure-indexes.js'));
    expect(loaded).toEqual([]);
  });

  it('names none of the five gate models crhs-corporate owns', () => {
    for (const m of GATE_MODELS) {
      expect(src).not.toContain(m);
    }
  });

  it('provisions exactly the six models this app owns, in order', () => {
    const m = src.match(/const MODELS = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const members = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    expect(members).toEqual(['Bag', 'Order', 'Operator', 'AffiliateInvite', 'Customer', 'AddOn']);
  });

  it('requires one module per provisioned model and no more', () => {
    const requires = [...src.matchAll(/^const (\w+) = require\('\.\.\/server\/[^']+'\);$/gm)]
      .map((r) => r[1]);
    expect(requires).toEqual(['Bag', 'Order', 'Operator', 'AffiliateInvite', 'Customer', 'AddOn']);
  });

  it('its header comment no longer describes a gate model', () => {
    const header = src.split('\n').filter((l) => l.startsWith('//')).join('\n');
    for (const m of GATE_MODELS) {
      expect(header).not.toContain(m);
    }
  });

  it('is syntactically valid after the edit', () => {
    const { execFileSync } = require('child_process');
    expect(() => execFileSync(process.execPath, ['--check', SCRIPT])).not.toThrow();
  });

  it('still reads process.argv zero times — the recorded defect, not a regression', () => {
    // Evidence for the escalation row, asserted so the claim cannot rot: a
    // --dry-run flag added to this script WOULD be ignored and it WOULD write to
    // production. The fix pattern is corporate's ensure-indexes.js (exported
    // { ensureIndexes, MODELS }, injectable model list, require.main guard).
    expect((src.match(/process\.argv/g) || []).length).toBe(0);
    expect(src).not.toMatch(/require\.main === module/);
  });
});
