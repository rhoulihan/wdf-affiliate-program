# Decision record — the Cloudflare failover gap (Plan 3 Task 15, brief item 20)

**Status:** CLOSED 2026-09-23. Closed by decision + partial mitigation, not by the fix originally
proposed — one half of which turned out to be impossible on this Cloudflare plan.

## The gap

A single-box `:3001` outage produces **~1–2 minutes of intermittent public 502s** while the CF load
balancer propagates the health change across PoPs. Measured during the 2026-09-20 P-16 drill: 2 of 6
public probes returned 502 with **188 of 302 PoPs** having marked the box unhealthy and 114 still
routing to it. The origin's own `/health/origin` returned 503 correctly throughout — this is
propagation latency, not a broken monitor.

## What was REJECTED, and why — the peer-box fallback

The brief proposed nginx falling back to the peer box's `:3001`. Rejected on measurement:

- **There is no network path between the boxes on any port.** Both sit on `10.0.1.0/24`
  (oci1 `10.0.1.54`, oci2 `10.0.1.19`), yet ICMP is 100% loss and TCP `:22`, `:443`, `:3001` are all
  closed, privately and publicly. Enabling it requires an OCI VCN security-list ingress rule **plus**
  a persisted `iptables` rule on both boxes — three changes across two control planes, none of them
  nginx.
- **What it would buy:** the content app reachable over plaintext HTTP, unauthenticated, bypassing
  Cloudflare, the WAF and rate limiting — to cover ~1–2 min per incident.
- **Against:** measured real human traffic on `/` across the three flipped hosts is 39 + 23 + 26 =
  **88 hits/day**.
- **And it does not address the worse case.** A full box reboot (~10–20 s of public 502) takes that
  box's nginx down too, so an nginx-level fallback is inert exactly when it would matter most.
- It also fights `/health/origin` by design: that endpoint is composite (`server.js:445`) and returns
  503 when the content app is down, deliberately pulling the whole box out of rotation.

## What was ADOPTED

**(a) A graceful 503 in the content-app snippet — shipped in Task 8, PROVEN in Task 15.**
`error_page 502 504 = @content_unavailable` turns nginx's own upstream errors into `503` +
`Retry-After: 30` + `Cache-Control: no-store`, with an unbranded "Temporarily unavailable" page.
`proxy_intercept_errors off` keeps a 502 the app itself returns passing through untouched.

Measured 2026-09-23 with `crhs-corporate` deliberately stopped on oci1 (under `trap … EXIT`):

| host | before | after |
|:--|:--|:--|
| atxwashateria.com | bare nginx 502 | `503` · `Retry-After: 30` · `no-store` |
| rundberglaundry.com | bare nginx 502 | same |
| atxwashdryfold.com | bare nginx 502 | same |

Page title `Temporarily unavailable`; **0** franchisor/brand references. The portal (`:3000`) was
unaffected. Everything restored by the trap.

**(b) Monitor retries 2 → 1.** Detection ~70 s → ~65 s.

## ⛔ The plan's headline proposal is IMPOSSIBLE on this account

Task 15 specified `interval=30, retries=1`, claiming detection would fall from ~70 s to ~35 s.
**Cloudflare rejects it:**

```
PATCH .../load_balancers/monitors/<id>  {"interval":30,"retries":1}
→ 1002: interval is not in range [60, 3600]: validation failed
```

`interval` has a hard floor of **60 s** on this plan, so the ~35 s figure was never achievable and the
load arithmetic behind it (13/s → 26/s probe volume) is moot. `retries` alone was accepted.

**Final monitor shape:** `path=/health/origin host=portal.atxwashdryfold.com interval=60 timeout=5
retries=1 codes=200 body=""` — every other field verified byte-unchanged, because this monitor is
shared by all five load balancers.

**Residual exposure, stated plainly:** detection is ~65 s, not ~35 s, and PoP propagation still adds
its own time on top. The graceful 503 is therefore the *primary* mitigation — users see a styled
"try again in 30 seconds" page rather than a raw gateway error — and faster detection is secondary.

## Explicitly NOT changed

`crhsent.com` keeps a **bare nginx 502**. It is served by its own inline `location /` to `:3001` and
includes neither snippet, so giving it the graceful page means either a duplicate `location /`
(which nginx rejects) or hand-editing the inline block of the **litigation-record host**. Measured
traffic there is 605 req/day, of which 534 are the content app's own health probes. Not worth
editing that vhost.

## If this needs revisiting

The remaining lever is a paid CF plan tier with sub-60 s monitor intervals, or moving health
detection off the LB entirely. Neither is worth 88 hits/day today; revisit if the marketing hosts
start carrying real traffic.
