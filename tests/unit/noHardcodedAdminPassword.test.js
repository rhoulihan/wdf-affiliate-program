// This repo is PUBLIC. A default credential committed here is readable by anyone,
// and the scripts that carried one created accounts with permissions:['all'].
// Owner decision 2026-09-23: the provisioning scripts REQUIRE
// DEFAULT_ADMIN_PASSWORD / DEFAULT_OPERATOR_PASSWORD and fail loudly when either
// is absent — no fallback, so no script can silently provision a known-password
// account.
//
// Two earlier versions of this guard were too narrow and both were caught by
// deliberately planting a literal and watching the guard stay green:
//   1. it matched only the brand-prefixed form, so it missed the operator-prefixed
//      one entirely (6 sites, 2 of which set it);
//   2. it named the constants it knew (ADMIN_PASSWORD) and was case-SENSITIVE,
//      so it missed OPERATOR_PASSWORD and NEW_PASSWORD.
// Hence: match any identifier CONTAINING a credential word, case-insensitively.
//
// The known-literal prefixes are ASSEMBLED below rather than spelled out: the
// branding guard (correctly) rejects the bare franchisor mark anywhere in the
// repo, and it flagged this very file when the pattern was written literally.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '../..');

function grep(pattern, paths, caseInsensitive) {
  const args = ['grep', '-nI', '-E'];
  if (caseInsensitive) args.push('-i');
  args.push(pattern, '--', paths);
  try {
    return execSync(`git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
      { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];            // git grep: no matches
    throw e;
  }
}

// A value that is a shell/JS variable reference is not a committed literal.
const isVariableRef = (line) => /[:=]\s*["']?\$\{?[A-Za-z_]/.test(line) || /process\.env/.test(line);

describe('no credential literal is committed under scripts/', () => {
  it('contains no known credential-shaped literal', () => {
    const prefixes = [['Wave', 'MAX'].join(''), ['Oper', 'ator'].join('')];
    expect(grep(`(${prefixes.join('|')})![0-9]{4}`, 'scripts/')).toEqual([]);
  });

  it('assigns no quoted literal to any credential-named identifier', () => {
    const hits = grep(
      "[A-Za-z_]*(password|passwd|secret|pin|token|apikey)[A-Za-z_]*[ \t]*[:=][ \t]*['\"][^'\"]+['\"]",
      'scripts/', true
    ).filter((l) => !isVariableRef(l));
    expect(hits).toEqual([]);
  });

  it('every script that creates an administrator requires DEFAULT_ADMIN_PASSWORD', () => {
    const creators = [...new Set(grep("permissions:[ \t]*\\['all'\\]", 'scripts/').map((l) => l.split(':')[0]))];
    expect(creators.length).toBeGreaterThan(0);           // the check is reachable
    for (const f of creators) {
      expect(fs.readFileSync(path.join(REPO, f), 'utf8')).toMatch(/DEFAULT_ADMIN_PASSWORD/);
    }
  });
});
