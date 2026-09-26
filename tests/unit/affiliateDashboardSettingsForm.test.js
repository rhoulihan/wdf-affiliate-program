/**
 * The settings form and the server's allowlist must not drift apart.
 *
 * The dashboard shipped a form that sent `email` while the controller's allowlist
 * omitted it: the API answered 200 "updated successfully", dropped the value, and
 * the form then repopulated the old one. Nothing failed, so nothing noticed.
 *
 * This test derives the expected field set from the controller source itself, so a
 * field added to one side and forgotten on the other fails here instead of failing
 * silently in production.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'public/affiliate-dashboard-embed.html'), 'utf8');
const CONTROLLER = fs.readFileSync(path.join(ROOT, 'server/controllers/affiliateController.js'), 'utf8');

/** Parse a string-array literal out of the controller source. */
function arrayLiteral(name) {
  const m = CONTROLLER.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found — the controller was restructured`);
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** Fields copied straight onto the document. */
function serverEditableFields() {
  return arrayLiteral('updatableFields');
}

/**
 * Fields the controller accepts but handles specially — the payment handles, which
 * are encrypted and written only for the matching paymentMethod, and the password
 * pair. The form may submit these even though they are not in updatableFields.
 */
function serverIndirectFields() {
  return arrayLiteral('indirectFields');
}

/** Field names the settings form submits, from name="..." inside #settingsForm. */
function formFieldNames() {
  const start = HTML.indexOf('<form id="settingsForm"');
  const end = HTML.indexOf('</form>', start);
  expect(start).toBeGreaterThan(-1);
  const form = HTML.slice(start, end);
  return [...form.matchAll(/name="([^"]+)"/g)].map(m => m[1]).filter(n => n !== '_csrf');
}

describe('affiliate settings form matches the server allowlist', () => {
  const serverFields = serverEditableFields();
  const formFields = formFieldNames();

  it('finds both sides (guards against a vacuous pass)', () => {
    expect(serverFields.length).toBeGreaterThan(10);
    expect(formFields.length).toBeGreaterThan(10);
  });

  it.each(serverEditableFields())('the form offers a control for %s', (field) => {
    expect(formFields).toContain(field);
  });

  it('submits nothing the server would reject', () => {
    // The server now 400s on unknown keys, so a stray name= here is a live failure.
    const accepted = [...serverFields, ...serverIndirectFields()];
    const unknown = formFields.filter(f => !accepted.includes(f));
    expect(unknown).toEqual([]);
  });

  it('offers a control for the payment handles the server accepts', () => {
    // These are not in updatableFields because they are encrypted and written only
    // for the matching paymentMethod — but the affiliate must still be able to set
    // them, and only paypalEmail used to be readable back.
    expect(formFields).toContain('paypalEmail');
    expect(formFields).toContain('venmoHandle');
  });

  it('shows partner type but never submits it', () => {
    // affiliateType is an admin decision: visible, and deliberately without a
    // name attribute so it cannot be posted.
    expect(HTML).toContain('id="settingsAffiliateType"');
    expect(formFields).not.toContain('affiliateType');
  });

  it('never offers isActive', () => {
    expect(formFields).not.toContain('isActive');
  });

  it('no longer renders the removed V1 fee fields', () => {
    expect(HTML).not.toContain('minimumDeliveryFee');
    expect(HTML).not.toContain('perBagDeliveryFee');
  });

  it('every label points at a control that exists', () => {
    const start = HTML.indexOf('<form id="settingsForm"');
    const form = HTML.slice(start, HTML.indexOf('</form>', start));
    const forAttrs = [...form.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map(m => m[1]);
    expect(forAttrs.length).toBeGreaterThan(8);
    const orphans = forAttrs.filter(id => !form.includes(`id="${id}"`));
    expect(orphans).toEqual([]);
  });
});
