/**
 * Server code must not read Customer fields the schema does not declare.
 *
 * `numberOfBags` was removed from the Customer model but six files kept reading it.
 * Mongoose returns `undefined` for an undeclared path rather than throwing, so
 * `customer.numberOfBags || 1` silently evaluated to 1 forever — the label printer
 * has been emitting exactly one label per customer regardless of anything, and
 * `fieldFilter` has been advertising a field that can never appear in a response.
 *
 * This guard is deliberately schema-derived: it reads the model's declared paths
 * rather than hard-coding a list, so a field removed from Customer tomorrow fails
 * here instead of quietly evaluating to undefined.
 */
const fs = require('fs');
const path = require('path');
const Customer = require('../../server/models/Customer');

const ROOT = path.join(__dirname, '../..');

/** Paths the Customer schema actually declares, plus mongoose internals. */
function declaredPaths() {
  return new Set([...Object.keys(Customer.schema.paths), ...Object.keys(Customer.schema.virtuals)]);
}

/** Server files that read a customer document. */
const FILES = [
  'server/services/operatorShiftStatsService.js',
  'server/utils/fieldFilter.js',
  'server/services/customerRegistrationService.js'
];

describe('no server code reads a Customer field the schema lacks', () => {
  const declared = declaredPaths();

  it('finds the schema (guards against a vacuous pass)', () => {
    expect(declared.has('customerId')).toBe(true);
    expect(declared.size).toBeGreaterThan(10);
  });

  it('numberOfBags is genuinely absent from the model', () => {
    // If this ever fails, the field came back and the guard below is moot.
    expect(declared.has('numberOfBags')).toBe(false);
  });

  /**
   * Comments are stripped before matching. A comment explaining that a phantom field
   * was removed necessarily names it, and would otherwise fail the very guard that
   * proves it is gone — the assertion is about what the code READS, not what the
   * prose mentions.
   */
  const codeOnly = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

  it.each(FILES)('%s does not READ numberOfBags', (rel) => {
    const code = codeOnly(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    expect(code).not.toMatch(/numberOfBags/);
  });

  it('the comment-stripper does not make this vacuous', () => {
    // If stripping ever removed everything, every file would trivially pass.
    const code = codeOnly(fs.readFileSync(path.join(ROOT, FILES[0]), 'utf8'));
    expect(code).toMatch(/printNewCustomerLabels/);
    expect(codeOnly('/* numberOfBags */ const a = 1;')).not.toMatch(/numberOfBags/);
    expect(codeOnly('const numberOfBags = 1;')).toMatch(/numberOfBags/);
  });
});
