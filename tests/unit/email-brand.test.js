'use strict';
// PR B10 seam tests. server/services/email/{transport,template-manager}.js are
// WRAPPERS over @crhs/web-core's shared email primitives — they exist only to bind
// THIS app's brand and THIS app's template root, so the 17 two-arg loadTemplate
// call sites and every three-arg sendEmail call site in the six dispatchers keep
// their signature (zero dispatcher edits is PR B10's acceptance).
//
// What is pinned here is exactly what a wrapper can get wrong:
//   - the brand it binds (and that it binds it LAZILY — server/config/brand.js used
//     to snapshot process.env at import and sent mail as "Laundromat" from any
//     script that loaded before dotenv; memory brand_config_lazy_resolve_2026-08-24);
//   - the template root it binds (the app's own tree, not web-core's — web-core
//     ships no templates at all, so a mis-bound root renders FALLBACK_TEMPLATE for
//     every email and nothing throws);
//   - the argument shape it forwards (a string 4th argument is a From header; an
//     object 4th argument is an options bag — spec §7.2.4);
//   - the 2026-08-23 HARD RULE, EMAIL_USER must own EMAIL_FROM. All app mail was
//     dead for a day because EMAIL_FROM was @crhsent.com while EMAIL_USER was still
//     @wavemax.promo → 553 rejected, masked because the welcome-email path only
//     logger.warn'ed. A send under a mismatched pair must FAIL, loudly.

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const core = require('@crhs/web-core').email.transport;
const coreTemplateManager = require('@crhs/web-core').email.templateManager;
const brand = require('../../server/config/brand');
const transport = require('../../server/services/email/transport');
const { fillTemplate } = require('../../server/services/email/template-manager');
const templateManager = require('../../server/services/email/template-manager');

const APP_TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'server', 'templates', 'emails');

// Save/restore every env var these tests touch. Leaking one poisons later suites.
const ENV_KEYS = [
  'EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_USER', 'EMAIL_HOST', 'EMAIL_TLS_SERVERNAME',
  'EMAIL_TEMPLATE_ROOT', 'EMAIL_FROM_NAME', 'BRAND_DISPLAY_NAME', 'BASE_URL'
];
const saved = {};
const restoreEnv = () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
};

beforeAll(() => { for (const k of ENV_KEYS) saved[k] = process.env[k]; });
afterEach(restoreEnv);

describe('email transport wrapper — delegation, brand and argument shape', () => {
  let sendMail;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';
    process.env.EMAIL_USER = 'no-reply@crhsent.com';
    delete process.env.EMAIL_FROM_NAME;
  });

  it('delegates to web-core and binds this app brand as the From display name', async () => {
    const spy = jest.spyOn(core, 'sendEmail').mockResolvedValue({ messageId: 'spied' });

    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>');

    expect(spy).toHaveBeenCalledTimes(1);
    const [to, subject, html, fromOverride, options] = spy.mock.calls[0];
    expect([to, subject, html]).toEqual(['to@example.com', 'Subj', '<p>hi</p>']);
    expect(fromOverride).toBeUndefined();
    expect(options.fromName).toBe(brand.displayName);
  });

  it('passes a string 4th argument through to web-core verbatim', async () => {
    const override = '"Monitoring" <admin@crhsent.com>';
    const spy = jest.spyOn(core, 'sendEmail').mockResolvedValue({ messageId: 'spied' });

    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>', override);

    expect(spy.mock.calls[0][3]).toBe(override);
  });

  it('renders the default From as "<brand>" <EMAIL_FROM>', async () => {
    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].from).toBe(`"${brand.displayName}" <no-reply@crhsent.com>`);
  });

  it('honours a string From override end to end', async () => {
    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>', '"Ops" <admin@crhsent.com>');

    expect(sendMail.mock.calls[0][0].from).toBe('"Ops" <admin@crhsent.com>');
  });

  // REGRESSION. dispatcher/admin.js:205 calls sendEmail(adminEmail, subject, fullHtml, headers)
  // where `headers` is {} (normal priority) or { 'X-Priority': '1', Importance: 'high' }.
  // Both are truthy objects, so the pre-wrapper transport used them AS the From header
  // and nodemailer emitted a message with NO From header at all (measured with a
  // streamTransport: only To: and Message-ID: survived) — every admin notification.
  // The wrapper treats a non-string 4th argument as the options bag (spec §7.2.4), so
  // the From falls back to the configured sender. Fixed WITHOUT touching the dispatcher.
  it('treats an object 4th argument as options, not as a From header', async () => {
    await transport.sendEmail('admin@crhsent.com', 'Subj', '<p>hi</p>', {});

    const mail = sendMail.mock.calls[0][0];
    expect(typeof mail.from).toBe('string');
    expect(mail.from).toBe(`"${brand.displayName}" <no-reply@crhsent.com>`);
  });

  it('forwards replyTo from either the 4th-argument bag or the 5th argument', async () => {
    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>', { replyTo: 'lead@crhsent.com' });
    expect(sendMail.mock.calls[0][0].replyTo).toBe('lead@crhsent.com');

    sendMail.mockClear();
    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>', undefined, { replyTo: 'other@crhsent.com' });
    expect(sendMail.mock.calls[0][0].replyTo).toBe('other@crhsent.com');
  });

  it('lets a caller-supplied fromName win over the bound brand', async () => {
    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>', { fromName: 'Monitoring' });

    expect(sendMail.mock.calls[0][0].from).toBe('"Monitoring" <no-reply@crhsent.com>');
  });

  // brand.displayName is a GETTER. A wrapper that destructured it — or read it at
  // module scope — would freeze whatever the env held when the module was required.
  it('reads brand through its getters at call time, never snapshotted at require', async () => {
    process.env.BRAND_DISPLAY_NAME = 'Late Bound Brand';

    await transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>');

    expect(sendMail.mock.calls[0][0].from).toBe('"Late Bound Brand" <no-reply@crhsent.com>');
  });

  it('propagates a transport failure instead of swallowing it in a warn', async () => {
    sendMail.mockRejectedValue(new Error('553 5.7.1 Sender address rejected: not owned by user'));

    await expect(transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>'))
      .rejects.toThrow(/553/);
  });

  it('still rejects a send with no recipient', async () => {
    await expect(transport.sendEmail('', 'Subj', '<p>hi</p>'))
      .rejects.toThrow(/recipient/i);
  });

  // The Ultahost mail box is reached BY IP, so TLS has no hostname to validate the
  // cert against; the servername must stay mail.crhsent.com or every send fails the
  // handshake (memory email_smtp_tls_servername). Pinned through the wrapper because
  // tests/unit/emailTransport.test.js (which pinned it on the pre-wrapper module) is
  // deleted by this PR as a duplicate of web-core's own suite.
  it('keeps the by-IP TLS servername default through the wrapper', () => {
    process.env.EMAIL_HOST = '158.62.198.7';
    delete process.env.EMAIL_TLS_SERVERNAME;

    transport.createTransport();

    expect(nodemailer.createTransport.mock.calls[0][0].tls.servername).toBe('mail.crhsent.com');
  });
});

describe('the 2026-08-23 rule: EMAIL_USER must own EMAIL_FROM', () => {
  let sendMail;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    process.env.EMAIL_PROVIDER = 'smtp';
  });

  it('validateMailConfig rejects a mismatched pair, naming both domains', () => {
    process.env.EMAIL_USER = 'no-reply@wavemax.promo';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';

    expect(() => transport.validateMailConfig())
      .toThrow('EMAIL_FROM domain "crhsent.com" does not match EMAIL_USER domain "wavemax.promo"');
  });

  it('validateMailConfig accepts a matched pair and resolves the app own template root', () => {
    process.env.EMAIL_USER = 'admin@crhsent.com';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';

    const resolved = transport.validateMailConfig();

    expect(resolved.templateRoot).toBe(templateManager.TEMPLATE_ROOT);
    expect(resolved.templateRoot).not.toMatch(/node_modules/);
    expect(fs.existsSync(path.join(resolved.templateRoot, 'base-template.html'))).toBe(true);
  });

  // Spec cross-link 17b: the pre-wrapper transport addressed
  // 'noreply@rundberglaundry.com' when neither var was set — a mailbox that does not
  // exist on Mailcow, so the mail was already lost; it just looked sent.
  it('refuses to invent a sender when neither EMAIL_FROM nor EMAIL_USER is set', async () => {
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_USER;

    await expect(transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>'))
      .rejects.toThrow('No sender address configured: set EMAIL_FROM or EMAIL_USER');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('names the app own template root, so the boot gate cannot validate web-core empty tree', () => {
    process.env.EMAIL_USER = 'no-reply@crhsent.com';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';

    expect(transport.validateMailConfig().templateRoot).toBe(templateManager.TEMPLATE_ROOT);
    expect(() => transport.validateMailConfig({ templateRoot: '/nonexistent' }))
      .toThrow(/base-template\.html not found/);
  });

  // The gate is a BOOT check, deliberately not a per-send one. Every dispatcher wraps
  // its send in try/catch and logs (affiliate.js, customer.js, admin.js, operator.js,
  // onboarding.js), so a per-send throw would be swallowed by exactly the pattern that
  // hid the 2026-08-23 outage for a day — and on a box whose pair merely drifted it
  // would convert "mail with a wrong From" into no mail at all, unattended. Pinning the
  // choice here so a future reader does not "fix" it by moving the check into the send.
  it('does not gate an individual send on the pair — that is boot work', async () => {
    process.env.EMAIL_USER = 'no-reply@wavemax.promo';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';

    await expect(transport.sendEmail('to@example.com', 'Subj', '<p>hi</p>')).resolves.toBeDefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    // ... while the boot gate rejects that very pair.
    expect(() => transport.validateMailConfig()).toThrow(/does not match EMAIL_USER domain/);
  });
});

describe('template-manager wrapper — TEMPLATE_ROOT binds this app own tree', () => {
  const marker = `__b10-probe-${process.pid}-${Date.now()}`;
  const markerPath = path.join(APP_TEMPLATE_ROOT, `${marker}.html`);
  const markerBody = `<p>APP TREE MARKER ${marker}</p>`;

  beforeAll(() => { fs.writeFileSync(markerPath, markerBody, 'utf8'); });
  afterAll(() => { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); });

  it('exposes the app templates directory, not one inside node_modules', () => {
    expect(templateManager.TEMPLATE_ROOT).toBe(APP_TEMPLATE_ROOT);
    expect(templateManager.TEMPLATE_ROOT).not.toMatch(/node_modules/);
  });

  // A per-run marker, not an existsSync on a directory: the bytes prove which tree
  // was read. EMAIL_TEMPLATE_ROOT is pointed somewhere useless to prove the wrapper
  // passes its OWN root rather than deferring to the environment.
  it('loads a template that exists only in the app tree, even with EMAIL_TEMPLATE_ROOT set elsewhere', async () => {
    process.env.EMAIL_TEMPLATE_ROOT = path.join(__dirname, 'no-such-template-root');

    const html = await templateManager.loadTemplate(marker);

    expect(html).toContain(markerBody);
  });

  it('web-core alone cannot find that template — the wrapper is what binds the root', async () => {
    delete process.env.EMAIL_TEMPLATE_ROOT;

    const html = await coreTemplateManager.loadTemplate(marker);

    expect(html).not.toContain(marker);
    expect(html).toContain('[EMAIL_CONTENT]');
  });

  it('falls back from a missing language directory to the root copy', async () => {
    const html = await templateManager.loadTemplate(marker, 'de');

    expect(html).toContain(markerBody);
  });

  it('keeps the display formatters the dispatchers import', () => {
    expect(templateManager.formatTimeSlot('morning')).toBe('Morning (8am - 12pm)');
    expect(templateManager.formatSize('large')).toBe('Large (31+ lbs)');
    expect(templateManager.formatSize(42)).toBe(42);
  });
});

describe('email brand injection', () => {
  test('fillTemplate auto-injects [BRAND_NAME] and [BRAND_LEGAL]', () => {
    const out = fillTemplate('<h1>[BRAND_NAME]</h1><footer>[BRAND_LEGAL]</footer>', {});
    expect(out).toContain(`<h1>${brand.displayName}</h1>`);
    expect(out).toContain(`<footer>${brand.legalName}</footer>`);
  });

  test('caller-supplied BRAND_NAME / BRAND_LEGAL win over the defaults', () => {
    const out = fillTemplate('[BRAND_NAME]|[BRAND_LEGAL]', {
      BRAND_NAME: 'Override Co',
      BRAND_LEGAL: 'Override Legal, LLC'
    });
    expect(out).toBe('Override Co|Override Legal, LLC');
  });

  test('fillTemplate reads brand through its getters after require, not a snapshot', () => {
    process.env.BRAND_DISPLAY_NAME = 'Late Bound Brand';

    expect(fillTemplate('[BRAND_NAME]', {})).toBe('Late Bound Brand');
  });

  test('[BASE_URL] defaults to the portal origin and [BRAND_LOGO] is absolute', () => {
    delete process.env.BASE_URL;

    const out = fillTemplate('[BASE_URL]|[BRAND_LOGO]', {});

    expect(out).toBe(`https://portal.atxwashdryfold.com|https://portal.atxwashdryfold.com${brand.logoPath}`);
  });

  test('[BASE_URL] follows the configured origin when BASE_URL is set', () => {
    process.env.BASE_URL = 'https://portal.example.test';

    expect(fillTemplate('[BASE_URL]', {})).toBe('https://portal.example.test');
  });
});
