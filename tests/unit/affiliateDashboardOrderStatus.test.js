/**
 * The dashboard's order statuses must be exactly the Order model's enum.
 *
 * The Phase-1 rebuild collapsed the lifecycle to five states. The dashboard was
 * never updated: its filter offered `scheduled`, `picked_up`, `processing`,
 * `ready_for_delivery` and `delivered` — none of which the model accepts — and
 * `scheduled` was the *selected default*. Meanwhile `in_progress` and
 * `out_for_delivery`, two of the five real states, had no filter option and no
 * badge colour, so they fell through to a grey default and rendered as raw
 * lowercase English.
 *
 * Both lists are derived from their real sources here, so a future change to the
 * state machine fails this test instead of silently producing a filter that
 * queries values the enum rejects.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'public/affiliate-dashboard-embed.html'), 'utf8');
const INIT = fs.readFileSync(path.join(ROOT, 'public/assets/js/affiliate-dashboard-init.js'), 'utf8');

/**
 * The same source with comments removed. Assertions about what the code *calls*
 * must not match prose: a comment explaining that a dead route was abandoned
 * mentions that route by name, and would otherwise fail the very test proving it
 * is no longer called.
 */
const INIT_CODE = INIT
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
const ORDER_MODEL = fs.readFileSync(path.join(ROOT, 'server/models/Order.js'), 'utf8');

/** The canonical statuses, straight from the schema. */
function modelStatuses() {
  const m = ORDER_MODEL.match(/status:\s*\{[\s\S]*?enum:\s*\[([^\]]+)\]/);
  if (!m) throw new Error('Order status enum not found — the model was restructured');
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** Values offered by the dashboard's status filter, minus the "all" sentinel. */
function filterStatuses() {
  const start = HTML.indexOf('id="orderStatusFilter"');
  const end = HTML.indexOf('</select>', start);
  expect(start).toBeGreaterThan(-1);
  return [...HTML.slice(start, end).matchAll(/value="([^"]+)"/g)]
    .map(m => m[1]).filter(v => v !== 'all');
}

describe('affiliate dashboard order statuses match the state machine', () => {
  const statuses = modelStatuses();

  it('finds the model enum (guards against a vacuous pass)', () => {
    expect(statuses).toEqual(
      expect.arrayContaining(['pending', 'in_progress', 'out_for_delivery', 'complete', 'cancelled'])
    );
  });

  it('offers a filter option for every real status, and nothing else', () => {
    expect(filterStatuses().sort()).toEqual([...statuses].sort());
  });

  it('gives every real status its own badge class and i18n key', () => {
    // A status missing from the badge map falls through to grey with a raw English
    // label, which is what happened to in_progress and out_for_delivery.
    const m = INIT.match(/const ORDER_STATUS_META = \{([\s\S]*?)\n\};/);
    expect(m).not.toBeNull();
    const mapped = [...m[1].matchAll(/^\s{2}([a-z_]+):/gm)].map(x => x[1]);
    expect(mapped.sort()).toEqual([...statuses].sort());
    // and each entry must carry a translation key, not a bare literal
    for (const status of statuses) {
      expect(m[1]).toMatch(new RegExp(`${status}:[^\\n]*key: 'orders\\.status\\.`));
    }
  });

  it('no longer references any status the model rejects', () => {
    const removed = ['scheduled', 'picked_up', 'ready_for_delivery', 'delivered', 'processed'];
    for (const dead of removed) {
      expect(filterStatuses()).not.toContain(dead);
      // `processing` is excluded from this loop: it is a legitimate substring of
      // other identifiers, so it is asserted against the filter list only.
      expect(HTML).not.toContain(`orders.status.${dead.replace(/_(.)/g, (_, c) => c.toUpperCase())}`);
    }
    expect(filterStatuses()).not.toContain('processing');
  });

  it('translates the status label instead of de-underscoring it', () => {
    // The renderer printed `status.replace(/_/g,' ')`, so every badge showed raw
    // lowercase English regardless of the selected language.
    expect(INIT_CODE).not.toMatch(/status\.replace\(\/_\/g/);
  });
});

describe('the dashboard no longer calls routes that do not exist', () => {
  it('does not call /invoices', () => {
    // GET /api/v1/affiliates/:id/invoices has no server route at all.
    expect(INIT_CODE).not.toContain('/invoices');
  });

  it('does not POST /change-password', () => {
    expect(INIT_CODE).not.toContain('/change-password');
  });
});

describe('the page actually translates itself', () => {
  it('calls translatePage, not just i18n.t at render time', () => {
    // The SPA injects this page after DOMContentLoaded, so the page bootstrap's
    // DOMContentLoaded listener never fires here. Without an explicit translate
    // call every data-i18n label and <option> renders its raw key — which is what
    // shipped when the old setTimeout re-translate was deleted.
    expect(INIT_CODE).toContain('translatePage');
  });

  it('awaits i18n.init before translating, rather than using a timeout', () => {
    expect(INIT_CODE).toMatch(/await window\.i18n\.init\(/);
    expect(INIT_CODE).not.toMatch(/setTimeout\([^)]*[Tt]ranslat/);
  });

  it('invokes the translate helper during initialisation', () => {
    expect(INIT_CODE).toMatch(/applyPageTranslations\(\)/);
  });
});

describe('development-only affordances are gone', () => {
  it('has no delete-all-data danger zone', () => {
    expect(HTML).not.toContain('deleteDataSection');
    expect(HTML).not.toContain('deleteAllDataBtn');
    expect(INIT_CODE).not.toContain('delete-all-data');
  });

  it('does not render phantom fields', () => {
    // order.pickupDate was removed from the model; customer.isActive is not in the
    // customers projection, so the badge always claimed "Active".
    expect(INIT_CODE).not.toContain('order.pickupDate');
    expect(INIT_CODE).not.toContain('customer.isActive');
  });
});
