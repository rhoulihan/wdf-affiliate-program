/**
 * Email templates may only use the `[PLACEHOLDER]` syntax that the renderer
 * actually understands.
 *
 * web-core's fillTemplate() substitutes /\[([A-Za-z0-9_]+)\]/ and nothing else.
 * Handlebars is not a dependency of this project, so a `{{i18n "key"}}`
 * expression is never evaluated — it is emailed to the user verbatim as a raw
 * slug. Three templates shipped that way (the administrator password-reset
 * title and button, and the operator shift-reminder title), which is how a
 * real administrator received a button labelled
 * `{{i18n "emails.passwordReset.resetButton"}}`.
 *
 * Unlike a missing translation, this fails silently: fillTemplate only warns
 * about unknown *bracket* keys, so non-bracket syntax passes through unnoticed.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE_ROOT = path.join(__dirname, '../../server/templates/emails');

/** Every .html template, including the per-language subdirectories. */
function allTemplates(dir = TEMPLATE_ROOT, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allTemplates(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

describe('email templates use only the renderer\'s placeholder syntax', () => {
  const templates = allTemplates();

  it('finds templates to check (guards against a vacuous pass)', () => {
    expect(templates.length).toBeGreaterThan(10);
  });

  it.each(templates.map(f => [path.relative(TEMPLATE_ROOT, f), f]))(
    '%s contains no unevaluated {{...}} expression',
    (_rel, file) => {
      const offenders = fs.readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter(l => l.text.includes('{{'));
      expect(offenders).toEqual([]);
    }
  );
});
