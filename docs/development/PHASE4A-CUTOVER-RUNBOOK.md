# Phase 4a — Production Cutover Runbook (`wavemax.promo` → `portal.atxwashdryfold.com`)

> **What this is:** the deploy-time execution record for the Phase 4a domain migration. The
> code changes (canonical 301, cookie/JWT/log renames, CSP self-origins, `BASE_URL`/`EMAIL_FROM`
> plumbing) already landed on `main` — see spec
> [`2026-08-23-phase4a-domain-migration-design.md`](../superpowers/specs/2026-08-23-phase4a-domain-migration-design.md)
> §4. This runbook is the **ops half of §4.9 + §8**: provision the new host, deploy, flip the old
> host to a 301, verify, and roll back if needed. Every command is copy-pasteable.

**Cutover owner:** Rick. **Windows:** schedule **off-peak** — the cutover ends every active
session exactly once (cookies are host-bound; see §6). **Blast radius:** the affiliate/customer/
operator app only. Marketing hosts (`rundberglaundry.com`, `atxwashdryfold.com` apex,
`atxwashateria.com`) are untouched.

---

## Environment (canonical facts)

| Thing | Value |
|:---|:---|
| Web box 1 (oci1) | `wavemax-phx-1` · `161.153.71.201` · PHX-AD-2 |
| Web box 2 (oci2) | `wavemax-oci2-ad1` · `144.24.4.202` · PHX-AD-1 |
| SSH | `ssh -i ~/.ssh/oci_wavemax ubuntu@<ip>` |
| Repo path (both boxes) | `/var/www/wavemax/wavemax-affiliate-program` |
| App listen | `localhost:3000` (behind nginx) |
| Process manager | PM2 process **`wavemax`** (name kept via `PM2_APP_NAME=wavemax`) |
| Env load | app reads `.env` via dotenv at boot; `pm2 reload wavemax --update-env` respawns workers and re-reads env |
| Edge | Cloudflare (proxied) fronts the domains with an origin cert |

**Both boxes stay lockstep on the same commit and the same `.env` values.** Do each step on
oci1 **and** oci2 before moving to the next.

---

## 0. Pre-flight (before the window)

- [ ] W1 code merged to `main` and pushed. Confirm the 301 + cookie rename are in the tree:
  ```bash
  git -C /var/www/wavemax/wavemax-affiliate-program grep -n 'portal.atxwashdryfold.com' server.js | head
  # expect: allowedHosts entry (~L180), RETIRED_HOSTS 301 (~L210-214), CSP origins
  ```
- [ ] You can SSH into both boxes and `sudo` works.
- [ ] Note the current deploy SHA on each box for rollback reference:
  ```bash
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD'
  ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD'
  ```
- [ ] Back up the current prod `.env` on each box:
  ```bash
  sudo cp /var/www/wavemax/wavemax-affiliate-program/.env \
          /var/www/wavemax/wavemax-affiliate-program/.env.bak-pre-phase4a
  ```

---

## 1. Provision `portal.atxwashdryfold.com` (MUST be live before the code cutover)

> Rationale (§8): if DNS/TLS/nginx for the subdomain is not live before the app starts emitting
> the 301, the portal host 502s and there is nowhere for the redirect to land. Provision and
> verify the host **first**, then deploy.

### 1a. Cloudflare DNS + TLS
1. In the `atxwashdryfold.com` zone, add a **proxied** (orange-cloud) record for
   `portal` pointing at the app origin/LB — **mirror the existing `atxwashdryfold.com` record**
   (same origin target, same proxy status).
2. Confirm the Cloudflare **origin certificate** installed on the boxes covers
   `*.atxwashdryfold.com` (wildcard) — if the cert is hostname-pinned, add `portal.atxwashdryfold.com`
   to the cert / issue a new origin cert and install it on both boxes before continuing.

### 1b. nginx server block (BOTH boxes)
Add a server block that mirrors the existing `wavemax.promo` block — same `proxy_pass` and proxy
headers, only the `server_name` changes:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name portal.atxwashdryfold.com;

    # (reuse the same ssl_certificate / ssl_certificate_key the other atxwashdryfold.com
    #  blocks use — the CF origin cert covering *.atxwashdryfold.com)

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Fastest path: copy the live `wavemax.promo` block and change only `server_name`.

```bash
# On EACH box — find the existing promo block, copy it, edit server_name, then:
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] `nginx -t` passes on oci1, reloaded.
- [ ] `nginx -t` passes on oci2, reloaded.

### 1c. Verify the host is live (before deploying code)
```bash
# DNS + TLS handshake from anywhere:
curl -sSI https://portal.atxwashdryfold.com/api/health
# expect: HTTP/2 200 (nginx → :3000 → app). A 502 here means nginx/DNS/TLS is not ready — STOP.
```

**Do not proceed to §2 until `portal.atxwashdryfold.com` returns 200.**

---

## 2. Deploy code (BOTH boxes)

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201   # then oci2: 144.24.4.202
cd /var/www/wavemax/wavemax-affiliate-program
git pull --ff-only            # main, after the W1 merge
```

Set the prod `.env` values (edit in place — **change these two, keep the rest**):

```bash
# BASE_URL  → new canonical host (drives email links + absolute/canonical URLs)
# EMAIL_FROM → crhsent.com sender (SPF/DKIM already validate on mail.crhsent.com)
BASE_URL=https://portal.atxwashdryfold.com
EMAIL_FROM=no-reply@crhsent.com

# KEEP unchanged:
PM2_APP_NAME=wavemax                 # live process name stays "wavemax"
BRAND_DISPLAY_NAME="WaveMAX Austin"  # display brand unchanged (this is a host move, not a rebrand)
# EMAIL_HOST / transport servername stays mail.crhsent.com
```

Respawn workers so they pick up the new env:

```bash
pm2 reload wavemax --update-env
pm2 status                    # wavemax online on both boxes
```

- [ ] oci1: pulled, `.env` set, reloaded.
- [ ] oci2: pulled, `.env` set, reloaded.

---

## 3. Flip `wavemax.promo` → 301

No separate action — the **app-level canonical-301 (spec §4.2 / Task 2)** fires the moment the new
code is live. `server.js` holds `RETIRED_HOSTS = {wavemax.promo, www.wavemax.promo,
affiliate.wavemax.promo}` and issues `301 https://portal.atxwashdryfold.com${req.originalUrl}`
(path + query preserved).

**Leave the `wavemax.promo` nginx block in place and proxying to `:3000`** — the app must still
*receive* the request to emit the redirect. Do **not** delete or 301 it at nginx; the app owns the
redirect. Keep `wavemax.promo` DNS + nginx alive indefinitely (it is the permanent alias).

---

## 4. Verify

Run every check. The `-H "X-Forwarded-Proto: https"` header lets you hit `localhost:3000` directly
on a box, bypassing the app's http→https redirect so you test the app logic itself.

**a. Portal host serves the app (200, brand resolves):**
```bash
curl -sSI https://portal.atxwashdryfold.com/api/health          # HTTP/2 200
curl -s  https://portal.atxwashdryfold.com/ | grep -o 'WaveMAX Austin' | head -1   # brand renders
```

**b. `wavemax.promo/<path>` → 301 to portal, path + query preserved:**
```bash
curl -sSI 'https://wavemax.promo/embed-app-v2.html?route=/affiliate-login&x=1'
# expect: HTTP/2 301
#         location: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/affiliate-login&x=1

# Same assertion straight against the app on a box (bypass edge/HTTPS redirect):
curl -sSI -H 'Host: wavemax.promo' -H 'X-Forwarded-Proto: https' \
     'http://localhost:3000/some/path?q=1'
# expect: 301 → https://portal.atxwashdryfold.com/some/path?q=1
```

**c. Fresh login issues the `portal.sid` cookie (never `wavemax.sid`):**
```bash
# Hit an endpoint that sets the session cookie and inspect Set-Cookie.
curl -sSI -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' \
     http://localhost:3000/ | grep -i 'set-cookie'
# expect the name  __Host-portal.sid  (prod) — NOT wavemax.sid
```
Then do a **real UI login** on `https://portal.atxwashdryfold.com` and confirm in DevTools →
Application → Cookies that the session cookie is `__Host-portal.sid`.

**d. Test email renders the new From + portal links:**
Trigger one real email (e.g. an affiliate password-reset or invite) to a mailbox you control, then
confirm:
- Header `From:` renders `"WaveMAX Austin" <no-reply@crhsent.com>`.
- Every link in the body points at `https://portal.atxwashdryfold.com/...` (no `wavemax.promo`).

**e. Browser render on the portal origin — no console/CSP errors:**
Open `https://portal.atxwashdryfold.com` in a browser, DevTools → Console. Expect **zero** CSP
violations and zero blocked resources. A blocked resource means a missed CSP self-origin — fix
`server.js` CSP directives and redeploy (spec §4.3 / §8).

- [ ] a — portal serves 200, brand resolves
- [ ] b — promo 301s, path+query preserved
- [ ] c — fresh login issues `__Host-portal.sid`
- [ ] d — email From + links correct
- [ ] e — browser render clean (no console/CSP errors)

---

## 5. Cloudflare cache purge

Purge any changed static assets so the edge stops serving stale copies bound to the old host:

- Cloudflare dashboard → `atxwashdryfold.com` zone → **Caching → Configuration → Purge Cache**.
- Purge **Everything** for the app assets, or purge by URL for the specific changed files.
- Re-run §4a/§4e after the purge to confirm the origin output is what users receive.

---

## 6. One-time re-login note (communicate, don't mitigate)

The session cookie is **host-bound** (`__Host-` prefix ⇒ Secure, `Path=/`, no `Domain`), so moving
off `wavemax.promo` drops the old cookie by construction and the cookie rename to `portal.sid` is
free. **Consequence:** every active affiliate / customer / operator session ends at cutover and
each user logs in **once** on the new host. This is inherent to a domain change — there is nothing
to migrate; just:

- Schedule the window **off-peak**.
- Give operators a heads-up that they'll re-enter their PIN/login once after cutover.
- JWT refresh tokens are opaque DB records (not host-bound); they are unaffected, but the dropped
  cookie forces the re-login regardless.

---

## 7. Rollback

The code is backward-compatible while both host sets are allowed (`wavemax.promo` stays in
`allowedHosts`), so rollback is an **env revert**, not a code revert.

1. On **both** boxes, restore the pre-cutover env values (or the backup file from §0):
   ```bash
   cd /var/www/wavemax/wavemax-affiliate-program
   # revert the two changed values:
   #   BASE_URL   → https://wavemax.promo   (old canonical)
   #   EMAIL_FROM → <previous sender>
   # or: sudo cp .env.bak-pre-phase4a .env
   pm2 reload wavemax --update-env
   ```
2. **Keep `wavemax.promo` serving the app** instead of redirecting. If you need to stop the 301
   during rollback, that requires reverting the W1 code (the `RETIRED_HOSTS` 301 in `server.js`);
   for an env-only rollback, `wavemax.promo` will still 301 while the code is deployed — so a full
   rollback means `git checkout <pre-cutover-SHA>` + `pm2 reload` on both boxes.
3. **Leave `portal.atxwashdryfold.com` DNS/nginx alive** — no harm in keeping it provisioned.
4. Keep `wavemax.promo` **DNS + nginx alive throughout** the entire migration (it is the permanent
   alias regardless of direction).

**Cost of rollback:** a **second one-time re-login** (host/cookie flips back), but **no data loss** —
all state is server-side in MongoDB; only the client session cookie resets. Refresh tokens and DB
records are untouched.

---

## 8. Post-cutover close-out

- [ ] Both boxes on the same SHA; `pm2 status` shows `wavemax` online on both.
- [ ] `wavemax.promo/<path>` 301s verified from an external network (not just localhost).
- [ ] A real user (affiliate + operator) confirmed a successful fresh login on the portal host.
- [ ] One real email received and confirmed (From + links).
- [ ] Record the deploy SHA + timestamp here or in the deploy log:

  ```
  Cutover date/time:  __________
  Deploy SHA:         __________
  Verified by:        __________
  ```

---

*Spec: [`docs/superpowers/specs/2026-08-23-phase4a-domain-migration-design.md`](../superpowers/specs/2026-08-23-phase4a-domain-migration-design.md)
§4.9 (ops) + §8 (risks & rollback). Deploy fundamentals:
[`LIGHTHOUSE-QUALITY-BAR.md`](LIGHTHOUSE-QUALITY-BAR.md) §"Deploy procedure" and the
"Deployment procedure" memory.*
