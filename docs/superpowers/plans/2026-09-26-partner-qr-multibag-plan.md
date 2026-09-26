# Implementation plan — partner QR, customer codes, multi-bag

**Spec:** [`docs/superpowers/specs/2026-09-26-partner-qr-multibag-design.md`](../specs/2026-09-26-partner-qr-multibag-design.md)
(decisions D1–D15) · **Date:** 2026-09-26

## How to execute this

- **Strict TDD.** Failing test first, confirmed failing *for the right reason*, then implementation.
- **Every persistence assertion re-reads from the database.** A mocked model accepts a discarded write and
  passes vacuously — that is how three silent-discard bugs reached production in this repo already.
- **One concern per commit, ≤500-line diffs.** Deploy only on the owner's say-so.
- **Clean slate.** No live affiliates, customers or orders, so destructive changes are allowed and no
  migration is needed. This is the cheapest this work will ever be.
- Phases are ordered so nothing is built against a name or a path that a later phase deletes.

---

## Phase 0 — prerequisites (blocking)

Small, independent, and all three are live defects. Land before anything else touches the scan path.

| # | Task | Verify |
|---|---|---|
| 0.1 | **`orderTotal` is silently dropped on every kiosk send-out.** `operator-scan-init.js:257` sets `opts.orderTotal`; `scan-session.js` `apply()` never copies it into the payload. The UI requires it before enabling Confirm, the server would record it, and `Order.orderTotal` feeds the admin revenue view. **Phase 6 makes this worse** — send-out then captures the total *and* the net-new bag count | integration test: kiosk-shaped apply with `orderTotal` persists it; falsify by removing the line |
| 0.2 | **`operator-scan-init.js:229-230` claims the server hard-rejects a send-out without payment confirmation. It does not.** Make it true (server-side gate) — Phase 6 turns this into a money gate | test: send-out without `paymentConfirmed` → 400, and the old path no longer succeeds |
| 0.3 | Delete the vestigial `numberOfBags` cluster — `operatorShiftStatsService.js:154` reads a field absent from `Customer`, so it always computes 1. Also `fieldFilter.js:54,57,62` and the admin label loops | grep returns zero `numberOfBags` outside tests; label printing still works |

**Gate G0:** all three merged, full affiliate suite green, `lint:server` clean.

---

## Phase 1 — retire minting, then rename

Deletion first: it removes most of what would otherwise need renaming.

### 1a. Retire minting (D4)

Delete `mintBatch`, `issueBatch`, `Bag.claim()`, `bagClaimService`, and the routes `POST /bags/mint`,
`/print-run`, `/batch/:id/issue`, `/batch/:id/labels`. Drop `bag_mint_max_batch`, the admin mint UI, and
`tests/integration/bagPrintRun.test.js`. `Bag.status` loses `minted` and `issued`; `batchId`, `mintedBy`,
`mintedAt`, `issuedAt` go with them.

**Verify:** no code path can create a bag in `minted` or `issued`; no mint/issue route resolves; the
registration path still works end to end (it breaks in 1c and is rebuilt in Phase 2 — sequence 1a→1c→2
in one working session, or keep 1a behind the rename until 2 lands).

### 1b. Rename `Bag` → `CustomerCode` (D12)

| From | To |
|---|---|
| `server/modules/bags/Bag.js` | `server/modules/customerCodes/CustomerCode.js` |
| `bagService.js` | `customerCodeService.js` |
| `Bag.bagId` | `CustomerCode.codeId` (`CODE-<uuid>`) |
| `Order.bagId` / `bagToken` | `Order.codeId` / `codeToken` |
| `extractBagToken.js` / `bag-token-parser.js` | `extractCodeToken.js` / `code-token-parser.js` |
| `?bag=` | `?code=` |

`bagCount` **keeps its name** — it counts real bags. One code, many bags.

⚠ **The `?bag=` → `?code=` change must be atomic.** It touches the 32-hex guard in four independent files
(`scanbag.js:29`, the client parser, the server extractor, plus `bag_token_bytes`), `labelSheetService`
and the welcome email. Miss one and scanners silently stop resolving — no error, just nothing found.

**Verify:** a guard test asserting no `?bag=` and no `bagToken` identifier survives outside migration
comments; a scan round trip through each of the three parsers.

### 1c. `createForCustomer()`

A `CustomerCode` born `status: 'active'` with `customerId` set. `Bag.claim()` was hard-guarded to
`{status:'issued', customerId:null}` and is gone. The save-then-claim compensating-delete path in
registration is deleted with it — there is no competing claimer now.

**Gate G1:** rename complete, suite green, no `Bag` identifier outside history.

---

## Phase 2 — partner QR + registration

| # | Task |
|---|---|
| 2.1 | `Affiliate.partnerToken` / `partnerTokenHash` (HMAC-SHA256, unique index) / `partnerTokenSetAt`. Mint with the **CustomerCode pattern** — raw kept for reprint — at **32 hex**, so all three existing parsers accept it unchanged. **Never `affiliateId`**: `AFF-<uuid>` fails every guard and is enumerable |
| 2.2 | `GET /api/v1/partners/:partnerToken` → the public affiliate projection `getPublicAffiliateInfo` already returns |
| 2.3 | `GET\|POST /api/v1/customers/join/:partnerToken`. Reuse `customerRegistrationService` wholesale; only four places change (spec §3). Creates Customer **and** CustomerCode |
| 2.4 | Printable partner-QR page, reachable from the affiliate dashboard and admin |

⚠ **Two traps that fail silently:** the new endpoint needs an entry in `REGISTRATION_ENDPOINTS`
(`csrfTables.js:61`) or it is unreachable unauthenticated; and the page needs `APP_STRICT_CSP_PAGES`
**with the Firebase `frame-src`**, or `signInWithPhoneNumber` is CSP-blocked with no error.
`tests/integration/cspClaimFrameSrc.test.js` is the existing pin to copy.

**Verify:** register through a partner QR → Customer + active CustomerCode, affiliate derived from the
token and never from client input; phone verification still gates; the geo radius gate still fails open.

**Gate G2:** a real end-to-end registration from a scanned partner QR on a phone.

---

## Phase 3 — the customer's printable sheet

| # | Task |
|---|---|
| 3.1 | Extract the label renderer from `labelSheetService` so **one function** serves both the customer's print page and the operator's bag label — identical QR by derivation, which is the whole point of D1b. No stored image, no TTL sweep (spec §1) |
| 3.2 | `GET /print/:codeToken` — the emailed print page. Precedent for link-reachable pages carrying no `Authorization` header: `bagController`'s 15-minute `bag-labels` JWT |
| 3.3 | Welcome email links to it (D3, email only — SMS is a later phase, needs a provider plus A2P 10DLC) |

**Verify:** the QR on the print page and on the bag label encode byte-identical payloads; the page prints
legibly at 4×6 and on letter.

---

## Phase 4 — multi-bag and the actor-aware resolver

The structural heart. **Do not start before Gate G1.**

| # | Task |
|---|---|
| 4.1 | `Order.bagCount` (default 1, min 1) |
| 4.2 | **`resolveScanAction` becomes actor-aware** — spec §4. The same `pending` order means `add-bag` to a customer, `confirm-pickup` to a partner, `intake` to an operator. This is the one place the existing soft convention ("role is not enforced per gate") becomes a real server rule. `scanAuth` already supplies `actorType` on `req.scanActor` |
| 4.3 | `add-bag` action — **atomic `$inc`**, never read-modify-write, or two simultaneous adds lose a bag. `pending` only: once `in_progress` the bags are on the counter and the operator owns the count |
| 4.4 | Double-scan guard: a second scan inside a window (config, default 60s) re-confirms rather than silently incrementing |
| 4.5 | `partnerPickup: {at, by, bagsConfirmed}` — one scan, a declared count, **defaulting to `bagCount`** (D15). Mismatch → escalate, never a fee change |
| 4.6 | Delivery declares a count too (D14), field **blank** (D15). Mismatch → escalate |

**Verify:** the same `pending` order resolves differently per actor and a UI asking for the wrong action
gets a 409 from the existing drift guard, not a wrong mutation; concurrent adds both land.

---

## Phase 5 — escalations (D7, D13)

`Order.escalation` as specced in §4a: five reasons, non-blocking, always notifying — admin queue always,
plus the partner on a pickup or delivery mismatch. Admin-only resolution with a note, audited. Admin
dashboard gains an escalation queue, and the send-out screen must show an unresolved escalation
prominently, since nothing blocks on it.

**Verify:** each of the five triggers raises exactly one escalation with `expected`/`actual` recorded; no
transition is blocked; resolution is audited.

---

## Phase 6 — fees per bag and bag economics

| # | Task |
|---|---|
| 6.1 | `deliveryFeeCharged = perBagFee × bagCount` — one line in `recordSendOutSnapshot:93`, already the sole writer of both money fields |
| 6.2 | Affiliate settings copy: the fee is **per bag**, not per order — all four locales, plus the pricing-preview component and the order-start email, which all currently state a per-order figure |
| 6.3 | `Customer.bagsIssued` (default 0) |
| 6.4 | Send-out captures **net-new** bags; `chargeable = max(0, netNew − max(0, bagCount − bagsIssued))`; `bagsIssued += netNew`. Charged in Cents by a human, confirmed by the operator |
| 6.5 | Intake and send-out confirmation checklists **recorded on the order**, not merely gating a button — otherwise there is no audit trail when a count is disputed |

**Verify:** all four rows of the spec's economics table, especially **row 2** — a routine one-bag order
needs no new bag, so `netNew: 0` charges nothing and leaves `bagsIssued` unchanged.

---

## Phase 7 — token rotation by supersession (D8)

`CustomerCode.status` gains `superseded`, plus `supersededBy` / `supersededAt`. Old token stays
resolvable; scanning it prompts the operator to find the new label and print a replacement. Old token
with **no** new label → escalate. Requested from the customer portal (Phase 8) or by an admin until then.

**Verify:** both rows resolve to the same customer so no order is orphaned; the escalation fires only
when no new label is declared.

---

## Phase 8 — customer portal

**Magic link, no passwords** — the customer already holds a durable credential in their email. There is
no customer auth today (zero password fields, no login route), so this is a new surface: keep it to
reprint the sheet, request rotation, view order history, and edit contact details and instructions.

---

## Phase 9 — Cents webhook consumer ⛔ GATED

Additive and non-breaking. The operator checkboxes **stay** and become pre-filled confirmations; a
webhook is never the authority for money. If Cents disables our endpoint, the store keeps working.

### Entry gates — all four before any code

| Gate | Why it blocks |
|---|---|
| **G9.1** Webhooks enabled on the Cents account (Business Manager → Integrations > Webhooks). Self-serve *after* a one-time enablement request | nothing to receive otherwise |
| **G9.2** A written answer on the REST API — above all **whether we can create an order and receive its id**. That single answer decides whether this is automation or another manual step | the join key does not exist without it |
| **G9.3** A sandbox/test account, **or** the owner's explicit written acceptance that this is developed against real customer orders. Cents provides **no test events** — *"A qualifying real event must occur"* | no safe way to build otherwise |
| **G9.4** A ruling on who owns the delivery fee. Cents carries its own `pickupDeliveryFee`/`returnDeliveryFee`; ours is snapshotted per bag (D2). Both populated = double charge, or commission disagreeing with what the customer paid | silent money bug |

### Tasks, once gated

| # | Task |
|---|---|
| 9.1 | `POST /webhooks/cents?token=…` — validate in **constant time**, never log the query string. A secret in a URL leaks via logs, referrers and proxies, so it authenticates the *sender*, never the *fact* |
| 9.2 | **ACK first, process async.** Persist the raw event, return 200, process on a job. The deadline is **3 seconds**; Oracle ADB behind Cloudflare is not safely inside that inline, and repeated non-2xx **disables delivery** |
| 9.3 | Our own durable event log. Cents retains theirs **7 days**, which is not an audit trail |
| 9.4 | Idempotent processing. Retries are certain; no event id or ordering is documented. Key on `(event, order.id, order.status)` + arrival until G9.2 confirms a real id |
| 9.5 | `Order.centsOrderId` and whatever join mechanism G9.2 permits |
| 9.6 | Map their statuses (`SUBMITTED … COMPLETED`) to our five; consume `balanceDue === 0` → payment, and `services[].quantity` on a `PER_POUND` modifier → weight |
| 9.7 | **Alert on silence** — no events in N hours — not on errors. A disabled endpoint looks exactly like a quiet day |

**Verify:** a replayed duplicate changes nothing; a malformed or wrong-token POST is rejected and logged
without a stack trace to the caller; a forged `balanceDue: 0` cannot by itself mark an order paid.

---

## Sequencing summary

```
Phase 0  prerequisites ......... blocking, 3 live defects
Phase 1  retire mint -> rename . G1
Phase 2  partner QR + join ..... G2 (real phone registration)
Phase 3  printable sheet
Phase 4  multi-bag + resolver ... structural heart
Phase 5  escalations
Phase 6  per-bag fees + economics
Phase 7  rotation
Phase 8  customer portal
Phase 9  Cents webhooks ........ G9.1-G9.4 all required
```

Phases 0–6 deliver the working business. 7–8 harden it. 9 automates three manual confirmations and is
deliberately last, because its gates are commercial rather than technical.

## Still open (spec §10)

1. Bag accumulation has no ceiling. `bagsIssued` now tracks it; nothing caps or reclaims it.
2. Whether a partner may resolve their own pickup-mismatch escalation — they have the knowledge, and also
   the incentive.
