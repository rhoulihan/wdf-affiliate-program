// /forgot-password page wiring + the shared-validator dependency guard.
//
// Regression: forgot-password-init.js delegates to window.FormValidation, but
// form-validation.js was never added to either loader (the HTML script tags or
// the pageScripts map). `validateEmail` fails CLOSED — with the helper absent
// it returns false for every address — so the form rejected every user with
// "Please enter a valid email address". Reported 2026-09-17 for a real
// affiliate whose address is perfectly valid.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const routerSrc = fs.readFileSync(path.join(PUBLIC, 'assets/js/embed-app-v2.js'), 'utf8');

const scriptsFor = (route) => {
  const m = routerSrc.match(new RegExp(`'${route}':\\s*\\[([^\\]]+)\\]`));
  return m ? m[1] : null;
};

describe('/forgot-password page wiring', () => {
  it('is registered in EMBED_PAGES', () => {
    expect(routerSrc).toMatch(/'\/forgot-password':\s*'\/forgot-password-embed\.html'/);
  });

  it('loads form-validation.js before forgot-password-init.js in pageScripts', () => {
    const list = scriptsFor('/forgot-password');
    expect(list).not.toBeNull();
    expect(list).toContain('/assets/js/form-validation.js');
    expect(list.indexOf('/assets/js/form-validation.js'))
      .toBeLessThan(list.indexOf('/assets/js/forgot-password-init.js'));
  });

  it('forgot-password-embed.html loads form-validation.js before forgot-password-init.js', () => {
    const html = fs.readFileSync(path.join(PUBLIC, 'forgot-password-embed.html'), 'utf8');
    expect(html).toContain('/assets/js/form-validation.js');
    expect(html.indexOf('/assets/js/form-validation.js'))
      .toBeLessThan(html.indexOf('/assets/js/forgot-password-init.js'));
  });
});

// The generic guard: whatever page uses the shared validator must load it, via
// BOTH access paths (PITFALLS #3 — the SPA router and a direct page load).
describe('shared validator dependency is loaded wherever it is used', () => {
  const DEP = '/assets/js/form-validation.js';
  const usesValidator = (rel) => {
    const abs = path.join(PUBLIC, rel.split('?')[0].replace(/^\//, ''));
    if (!fs.existsSync(abs)) return false;
    return fs.readFileSync(abs, 'utf8').includes('window.FormValidation.');
  };

  const routes = [...routerSrc.matchAll(/'(\/[a-z0-9-]*)':\s*\[([^\]]+)\]/g)]
    .map(([, route, list]) => ({ route, list }));

  it('finds routes to check (guards against the regex silently matching nothing)', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes.map((r) => r.route))('pageScripts[%s] loads the validator if it uses it', (route) => {
    const { list } = routes.find((r) => r.route === route);
    const consumers = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter(usesValidator);
    if (!consumers.length) return;
    expect(list).toContain(DEP);
    for (const c of consumers) {
      expect(list.indexOf(DEP)).toBeLessThan(list.indexOf(c));
    }
  });

  const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('-embed.html'));

  it.each(htmlFiles)('%s loads the validator if it uses it', (file) => {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
    const srcs = [...html.matchAll(/src="(\/assets\/js\/[^"]+)"/g)].map((m) => m[1]);
    const consumers = srcs.filter(usesValidator);
    if (!consumers.length) return;
    expect(html).toContain(DEP);
    for (const c of consumers) {
      expect(html.indexOf(DEP)).toBeLessThan(html.indexOf(c));
    }
  });
});

describe('the shared validator accepts the reported address', () => {
  it('accepts a local part starting with digits', () => {
    const src = fs.readFileSync(path.join(PUBLIC, 'assets/js/form-validation.js'), 'utf8');
    const pattern = new RegExp(src.match(/pattern:\s*\/(.+?)\/,\s*\n\s*message: 'Please enter a valid email/)[1]);
    expect(pattern.test('20test.user20@example.com')).toBe(true);
  });
});
