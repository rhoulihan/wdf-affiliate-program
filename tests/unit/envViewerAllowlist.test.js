// Plan 3 task 29. The admin env viewer has TWO lists that must agree:
// server-side ALLOWED_ENV_VARS (what the API returns) and the client-side
// `categories` map in administrator-dashboard-init.js (how it is grouped for
// display). They drifted: the client advertised DocuSign, AWS, Stripe and two
// retired rate-limit knobs long after the server stopped returning them, so
// admins saw named rows that could only ever render empty.
const fs = require('fs');
const path = require('path');

const SERVER_SRC = fs.readFileSync(
  path.join(__dirname, '../../server/services/systemHealthService.js'), 'utf8');
const CLIENT_SRC = fs.readFileSync(
  path.join(__dirname, '../../public/assets/js/administrator-dashboard-init.js'), 'utf8');

const allowlist = () => {
  const m = SERVER_SRC.match(/const ALLOWED_ENV_VARS = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('ALLOWED_ENV_VARS not found');
  return [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]);
};

const clientCategoryKeys = () => {
  const m = CLIENT_SRC.match(/const categories = \{([\s\S]*?)\n {4}\};/);
  if (!m) throw new Error('client categories map not found');
  return [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]);
};

// Keys retired by this plan's earlier tasks. None may come back into either list
// without a deliberate edit to this array.
const RETIRED = [
  'DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_ACCOUNT_ID',
  'DOCUSIGN_BASE_URL', 'DOCUSIGN_OAUTH_BASE_URL', 'DOCUSIGN_CLIENT_SECRET',
  'DOCUSIGN_REDIRECT_URI', 'DOCUSIGN_PRIVATE_KEY', 'DOCUSIGN_WEBHOOK_SECRET',
  'STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY',
  'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION',
  'RATE_LIMIT_WINDOW_MS', 'AUTH_RATE_LIMIT_MAX', 'FRONTEND_URL'
];

describe('task 29: the admin env viewer advertises only keys that exist', () => {
  it('ALLOWED_ENV_VARS names no retired key', () => {
    expect(allowlist().filter((k) => RETIRED.includes(k))).toEqual([]);
  });

  it('ALLOWED_ENV_VARS has no duplicates', () => {
    const l = allowlist();
    expect(l.length).toBe(new Set(l).size);
  });

  it('the client grouping names no retired key', () => {
    expect(clientCategoryKeys().filter((k) => RETIRED.includes(k))).toEqual([]);
  });

  it('every key the client groups is one the server actually returns', () => {
    const allowed = new Set(allowlist());
    expect(clientCategoryKeys().filter((k) => !allowed.has(k))).toEqual([]);
  });

  it('RATE_LIMIT_MAX_REQUESTS survives — it is the live apiLimiter max', () => {
    expect(allowlist()).toContain('RATE_LIMIT_MAX_REQUESTS');
  });
});
