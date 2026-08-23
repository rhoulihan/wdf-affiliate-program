// PR E — bag-label store address + operator-login CSP cleanup.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

describe('bag label store address', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/label-print-utils.js'), 'utf8');

  it('defines the Austin store address', () => {
    expect(src).toContain('825 E Rundberg Ln, Suite F1');
    expect(src).toContain('Austin, TX 78753');
  });

  it('renders the address in both label render paths (drawStoreAddress used twice)', () => {
    const calls = (src.match(/drawStoreAddress\(pdf,/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe('operator-login CSP', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/operator-login-embed.html'), 'utf8');

  it('has no inline onclick handler (the help text is now a span)', () => {
    expect(html).not.toMatch(/onclick=/i);
    expect(html).toContain('data-i18n="operator.login.needHelp"');
  });
});
