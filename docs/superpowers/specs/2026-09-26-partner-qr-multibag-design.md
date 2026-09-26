# Partner QR + customer-owned bags + multi-bag orders

**Status:** draft for review · **Date:** 2026-09-26 · **Supersedes:** the durable pre-issued-bag half of
`2026-06-15-phase1-bag-registration-design.md`

## Why

Today a customer cannot exist without an admin first minting and issuing a physical bag to them. That
forces bag logistics ahead of every signup. Instead:

1. Each partner gets **one permanent QR** to put on flyers, doors and storefronts.
2. A customer scans the partner QR, registers, and is **emailed a link to a printable QR sheet**.
3. They leave that sheet with laundry **in their own container**, per the partner's pickup instructions.
4. The partner collects it; the store processes it, prints a label, and returns the laundry **in a
   WaveMAX bag whose label carries the same QR**.

From then on the customer's bags and their printed sheet are interchangeable — same token.

**Clean slate.** There are no live affiliates, customers or orders, so there is no migration. Every
change below may be made destructively.

## Decisions locked

| # | Decision | Owner |
|---|---|---|
| D1 | **Count model.** One durable token per customer; `Order.bagCount` is an integer. Bags are interchangeable and **not** individually tracked | Rick 2026-09-26 |
| D1a | **Add-only.** There is no "start a new order" choice. If an order is open, a scan adds a bag to it — the actor is prompted to confirm, and confirming is the only path forward. A new order can begin only when nothing is open | Rick 2026-09-26 |
| D1b | **Every customer bag carries the same QR.** A customer can add a bag at any time by printing another copy of their sheet; each return hands them another WaveMAX bag with the same label attached | Rick 2026-09-26 |
| D2 | **Fee is straight per-bag**, no minimum: `perBagFee × bagCount` | Rick 2026-09-26 |
| D3 | **Email delivers the QR.** Outbound SMS is a later phase (needs a provider + US A2P 10DLC registration) | Rick 2026-09-26 |
| D4 | **Retire minting.** No pre-issued bags, no batches | Rick 2026-09-26 |
| D5 | Pickup scan is **encouraged, not required** — a partner's instructions may skip it | Rick 2026-09-26 |
| D6 | Reprint is the customer's problem; they keep the email. Bag management moves into a customer portal | Rick 2026-09-26 |
| D7 | **No discrepancy pay.** A missing bag is never a quiet fee adjustment — it is an exception that **escalates** | Rick 2026-09-26 |
| D8 | **Token rotation by supersession.** The customer prints the new token and attaches it to the bag. Scanning the OLD token notifies the operator to find the new token in the bag and print the new label. An old token on a bag with **no** new token attached escalates | Rick 2026-09-26 |
| D9 | **Partner pickup is a declared count, not a tally.** On scanning, the partner confirms how many bags they collected; a mismatch against `bagCount` escalates | Rick 2026-09-26 |
| D10 | **The partner returns the customer's own containers** | Rick 2026-09-26 |
| D11 | **Bags are free only when the customer sends more than their bags can hold.** `Customer.bagsIssued` tracks the count; net-new bags beyond entitlement are charged in Cents and confirmed by the operator | Rick 2026-09-26 |
| D12 | **Rename `Bag` → `CustomerCode`.** The entity is a credential, not an object. Done now, while there is no data to migrate | Rick 2026-09-26 |
| D13 | **Escalations never block a transition** — but they always notify | Rick 2026-09-26 |
| D14 | **The delivery scan also declares a count**, symmetric with pickup; a mismatch escalates | Rick 2026-09-26 |
| D15 | **The pickup count field defaults to `bagCount`**; the delivery count field is **blank** | Rick 2026-09-26 (see ⚠ below) |

⚠ **D15 needs confirming.** The instruction said both "leave the field blank" and "pickup field should
default to order bagCount" about the same control. Specced as: **pickup defaults** (the partner is at the
door with the expected count on screen) and **delivery is blank** (forces an honest count at handover,
where an undetected shortfall is the more expensive error). Correct this if it is not what you meant —
it decides whether D9's escalation has teeth.

**D1's accepted cost:** because every bag carries the same token, the system **cannot detect a missing
bag**. If a partner scans 3 and 2 arrive, only a human notices. The operator therefore owns the
definitive count (§4).

## 0. The rename (D12)

`Bag` describes a physical object. After D4 the entity is a **credential**: one row per customer, never
minted, never issued, never reassigned, with `batchId` / `mintedBy` / `mintedAt` / `issuedAt` all
vestigial. It is renamed now because there is no data to migrate and the cost only grows.

| Today | New |
|---|---|
| `server/modules/bags/Bag.js` | `server/modules/customerCodes/CustomerCode.js` |
| `bagService.js` | `customerCodeService.js` |
| `bagClaimService.js` | **deleted** (claim path is gone) |
| `Bag.bagId` | `CustomerCode.codeId` (`CODE-<uuid>`) |
| `Bag.token` / `tokenHash` | unchanged names |
| `Order.bagId` / `bagToken` | `Order.codeId` / `codeToken` |
| `extractBagToken.js`, `bag-token-parser.js` | `extractCodeToken.js`, `code-token-parser.js` |
| `?bag=` in URLs | `?code=` |

**`bagCount` keeps its name** — it counts real physical bags, which still exist. That is the distinction
the rename is drawing: one *code*, many *bags*.

Dropped entirely with the rename: `batchId`, `mintedBy`, `mintedAt`, `issuedAt`, and the `minted` /
`issued` statuses. `status` becomes `active | superseded | retired`.

⚠ The `?bag=` → `?code=` change touches the 32-hex guard in four files (§2) plus `labelSheetService` and
the welcome email. All of them must move together or the scanners silently stop resolving.

## 1. The model change

The customer's durable token *is* a `Bag` row — created at registration instead of at mint.

| | Today | New |
|---|---|---|
| Created by | `mintBatch()`, `status: minted` | registration, `status: active` |
| `affiliateId` | set at mint | from the partner token |
| `customerId` | `null` until claimed | set at creation |
| raw `token` | stored for label regen | unchanged |
| Rows per customer | 1 physical bag | 1 credential |

**Why this shape wins:** `Order.bagId` stays required and satisfied, all four scan events keep routing
`bagToken → Bag → bagId → Order`, and `Bag.orderCount` / `lastIntakeAt` already model many orders over
one token's life. The `{customerId, status}` index is already non-unique and its comment already says
"bag(s)".

`Bag.claim()` **cannot** do this — it is hard-guarded to `{status:'issued', customerId:null}`. A new
`bagService.createForCustomer()` is required. One simplification falls out: registration's
save-then-claim with a compensating delete exists only to survive losing a claim race; when we create
the row ourselves there is no competing claimer, so that path is deleted.

### Order changes

```
bagCount: { type: Number, default: 1, min: 1 }   // NEW
```
`bagId` / `bagToken` keep their current meaning (the customer's one credential).

### No storage of label images

`Bag.token` already persists the raw 32-hex **specifically** so labels can be re-rendered
(`Bag.js:5-6`). `labelSheetService` regenerates deterministically, so the customer's printout and the
bag label are identical by derivation. **No label store, no serving route, no TTL sweep** — which also
sidesteps the fact that neither box has shared storage and the LB is round-robin.

## 2. The partner QR

New on `Affiliate`:
```
partnerToken      String   // raw, kept so the partner's QR can be reprinted
partnerTokenHash  String   // HMAC-SHA256 keyed by ENCRYPTION_KEY, unique index — the only query key
partnerTokenSetAt Date
```
Minted with the **Bag pattern** (raw kept + HMAC lookup), **32 hex characters**. That shape matters: the
`^[a-f0-9]{32}$` guard is load-bearing in four independent places (`scanbag.js:29`,
`bag-token-parser.js:16`, `extractBagToken.js:5`, and the `bag_token_bytes: 16` default), so a 32-hex
partner token flows through every existing scanner unchanged.

**Do not use `affiliateId`** — `AFF-<uuid>` is 36 characters with dashes, fails every guard, and is
enumerable.

Surfaces: printable partner-QR page (affiliate dashboard + admin), and a resolver
`GET /api/v1/partners/:partnerToken` returning the same public projection the existing
`getPublicAffiliateInfo` already returns.

## 3. Registration via partner QR

`GET|POST /api/v1/customers/join/:partnerToken`

`customerRegistrationService` is ~90% reusable. Exactly four places are bag-coupled and change:

| Line today | Change |
|---|---|
| `:121-127` resolve bag → affiliate | resolve **partner token** → affiliate |
| `:178` `affiliateId` from bag | from partner token |
| `:198-208` save-then-claim + compensating delete | `createForCustomer()`, race path deleted |
| `:211` `bagToken` in welcome email | link to the **print page** |

Reused untouched: field validators, the geo radius gate (fails open), email dedupe + verify-token mint,
Firebase phone verification, the Customer document build, `RegistrationError` and its mapping.

**Two traps** the new page must not miss:
- an entry in `REGISTRATION_ENDPOINTS` (`csrfTables.js:61`) or it is unreachable unauthenticated;
- an entry in `APP_STRICT_CSP_PAGES` **with the Firebase `frame-src`**, or `signInWithPhoneNumber` is
  silently CSP-blocked. `tests/integration/cspClaimFrameSrc.test.js` is the existing pin.

## 4. Multi-bag

### Customer / partner side — add-only (D1a)

A scan while an order is open offers **one** action:

```
You have an order in progress (2 bags).
Add this bag to it?
   [ Yes, add this bag ]        [ Cancel ]
```

Confirming increments `bagCount`. There is no competing "start a new order" branch: a new order can
begin only when nothing is open. Add-ons and special instructions are **not** re-offered — they are
captured at order start only, matching today's suppression after `pending`.

**Double-scan guard:** two scans of the same token inside a short window (config, default 60s) must
re-confirm rather than silently increment, because an accidental double-scan inflates the fee (§5).

### ⚠ This makes the scan resolver actor-aware

`resolveScanAction(order, {...})` is today a **pure function of the order state** — a `pending` order
always resolves to `advance → in_progress`. D1a breaks that, because the same `pending` order must
resolve differently depending on who is holding the scanner:

| Order state | Partner / customer scans | Operator scans |
|---|---|---|
| none / cancelled / complete past window | `create-pending` | `create-pending` |
| **`pending`**, customer session | **`add-bag`** — `bagCount++` | — |
| **`pending`**, partner session | **`confirm-pickup`** (D9) — declares a count, no state change | — |
| **`pending`**, operator session | — | `advance → in_progress` (intake) |
| `in_progress` | *nothing* — the store already has the bags (§4a) | `advance → out_for_delivery` |
| `out_for_delivery` | `advance → complete` — **declares a count** (D14), blank field | `advance → complete` |
| `complete` inside reopen window | `delivery-rescan-prompt` | `delivery-rescan-prompt` |

So the resolver signature gains `actorType`, which `scanAuth` already puts on `req.scanActor`
(`middleware/scanAuth.js:48-55`). This is the one place the existing soft convention — "role is not
enforced per gate, only customers are restricted" — has to become a real server rule.

The `expectedAction` drift guard (`scanService.js:255-258`) keeps working and gets more valuable: the
partner UI asks for `add-bag`, the kiosk asks for `intake`, and a mismatch is a 409 rather than a wrong
mutation.

**Add-bag is allowed only while `pending`** — that is, before the laundry reaches the store. Once the
order is `in_progress` the bags are physically on the counter, so the operator's count correction (§4)
is the right mechanism, not another scan.

### Partner pickup — a declared count (D9)

The partner scans **once**, not once per bag, and declares what they collected:

```
Picking up for Jane Doe. The order says 3 bags.
   How many bags are you collecting?  [ 3 ]
   [ Confirm pickup ]
```

- Match → record `partnerPickup`, send the pickup email.
- **Mismatch → escalate (D7).** No silent adjustment, no fee change.

`Order.pickup` keeps its current meaning (the creation event, whoever started the order). The partner's
confirmation is a **separate, optional** event so the schema's existing semantics survive:

```
partnerPickup: { at: Date, by: String, bagsConfirmed: Number }   // NEW, optional
```

### Operator kiosk — intake

Three confirmations, all **recorded on the order**, not merely gating the button — otherwise there is no
audit trail when a count is later disputed:

```
Order for Jane Doe — 3 bags.
   [ ] All 3 bags accounted for
   [ ] Laundry weighed
   [ ] Order created in Cents
   [ Confirm intake ]
```
Cents then emails the customer for payment. **Any box unchecked → escalate (D7).** The operator has no
path to quietly lower `bagCount`.

### Operator kiosk — send-out

```
   [ ] Payment confirmed
   [ ] Receipt attached to one bag
   [ ] All bags turned over to partner
   Final order total:     [        ]
   New return bags issued: [   ]        <- net-new only, not total returned
```
`paymentConfirmed` must become a **real server gate** here — today it is UI-only and a code comment
falsely claims the server enforces it (§8).

### Bag economics (D11)

New on `Customer`: `bagsIssued: { type: Number, default: 0 }`.

At send-out, from the operator's net-new figure:
```js
const entitlement = Math.max(0, order.bagCount - customer.bagsIssued);
const chargeable  = Math.max(0, newReturnBags - entitlement);
customer.bagsIssued += newReturnBags;
```
`chargeable` is charged **in Cents** and confirmed by the operator. Nothing about the charge is stored as
money here; money lives in Cents.

| Scenario | `bagCount` | `bagsIssued` | net-new | entitlement | charged |
|---|---|---|---|---|---|
| First order, own container | 1 | 0 | 1 | 1 | 0 |
| Sends back their one WaveMAX bag — **returns in the same bag** | 1 | 1 | **0** | 0 | **0** |
| Sends 1 WaveMAX + 2 own containers | 3 | 1 | 2 | 2 | 0 |
| Holds 3 bags, sends 1, asks for 2 spares | 1 | 3 | 2 | 0 | **2** |

Row 2 is the case worth stating explicitly: a routine one-bag order needs **no** new bag, so the operator
enters `0` and nothing is charged. `bagsIssued` only ever grows, and only by net-new bags.

### Token rotation by supersession (D8)

Requested from the customer dashboard. Rotation cannot recall bags already in the customer's home, so
the old token stays resolvable and the physical relabel happens organically as bags come through:

```
Bag(old)  status: 'superseded'   supersededBy: <new bagId>   supersededAt: <date>
Bag(new)  status: 'active'
```

| Scan | Behaviour |
|---|---|
| New token | normal |
| Old token, **new token also attached** to the bag | operator prompt: *"This bag has an old label. Find the new label inside and print a replacement."* Order proceeds on the new token |
| Old token, **no new token** on the bag | **escalate (D7)** |

Both rows resolve to the same customer, so no order is ever orphaned. This makes `Bag.status` gain
`superseded` and finally gives `retired` a reason to exist.

### One open order per customer
Already enforced app-layer only (`orderTransitionService.js:127-132`); the partial unique index that
would back it is unsupported by the Oracle ADB Mongo API (`Order.js:77-83`). D1a *reduces* the exposure
— two racing scans now both want to add to the same order rather than each creating one — but the
increment must be an atomic `$inc`, not read-modify-write, or two simultaneous adds lose a bag.

## 4a. Escalations — new mechanism (D7)

Four triggers now raise one, and nothing like it exists today. `cancelled` is the wrong state: an
escalated order still has laundry that needs washing.

**An escalation is a flag, not a status.** Processing continues; the exception surfaces for a human.

```
escalation: {                                    // NEW on Order, optional
  raisedAt, raisedBy, role,
  reason,        // enum, below
  expected, actual,                              // e.g. 3 vs 2
  note,
  resolvedAt, resolvedBy, resolution
}
```

| `reason` | Raised when | By |
|---|---|---|
| `pickup_count_mismatch` | partner's declared count ≠ `bagCount` (D9) | partner scan |
| `bags_not_accounted` | intake checklist "all N accounted for" left unchecked | operator |
| `not_weighed` / `cents_not_created` | the other intake boxes left unchecked | operator |
| `delivery_count_mismatch` | partner's declared delivery count ≠ `bagCount` (D14) — bags never reached the customer | partner scan |
| `superseded_token_no_new_label` | old token scanned, no new label in the bag (D8) | any scan |

Notifies the **admin queue**; a pickup mismatch also notifies the partner, since they are the one who
can say what they collected. Resolution is admin-only, with a note, and is audited.

**Non-blocking by decision (D13)** — blocking would strand real laundry over a paperwork disagreement.
Every escalation **notifies**: the admin queue always, plus the partner on a pickup or delivery mismatch,
since they are the only one who can say what they handled. An order can therefore reach send-out with an
unresolved escalation, so the send-out screen must show it prominently.

## 5. Fees — per bag

`Affiliate.deliveryFee` becomes **per bag**. At send-out:

```js
order.deliveryFeeCharged = perBagFee > 0 ? perBagFee * order.bagCount : 0;
```
One line in `recordSendOutSnapshot` (`orderTransitionService.js:93`), which is already the sole writer of
both money fields. Snapshotting at send-out still immunizes historical commission from later fee edits.

Also required, or the change is only half-done:
- the affiliate settings form we just shipped labels this fee **per order** — copy and help text change
  in all four locales;
- the pricing preview component computes a per-order figure;
- the order-start email states the delivery fee (`dispatcher/customer.js:48-50`) and must show
  `perBagFee × bagCount`.

## 6. What is new, reused, retired

| New | Reused unchanged | Retired (D4) |
|---|---|---|
`Affiliate.partnerToken` + resolver | server-side QR (`qrcode`, already a dep) | `mintBatch`, `issueBatch` |
`/customers/join/:partnerToken` | phone verify, geo gate, email dedupe | `POST /bags/mint`, `/print-run`, `/batch/:id/issue` |
`bagService.createForCustomer()` | the 4-state machine + all 4 scan events | `Bag.claim()` and `bagClaimService` |
`Order.bagCount` + add-or-new prompt | scan sessions, lockout, the PWA scanner | `batchId`, `mintedBy/At`, `issuedAt` |
per-customer label renderer | order creation, add-ons, transition emails | `bag_mint_max_batch`, batch label route |
emailed print-page route | `labelSheetService` QR rendering | `Bag.status` `minted`/`issued` |

`Bag.status` collapses to `active` (and the still-unimplemented `retired`).

## 7. Customer portal (D6)

**There is no customer auth today** — zero password/username fields, no customer login route.

**Recommendation: magic link, no passwords.** The customer already holds a durable credential — their
token, in the email we sent. A link built from it authenticates them to a bag-management page. This
reuses the token we already mint, adds no password surface, and matches the existing precedent that a
tab navigation carries no `Authorization` header (`bagController`'s 15-minute `bag-labels` JWT).

Scope for the portal: reprint the QR sheet, view order history, edit contact details and instructions,
report a lost sheet. **Deliberately deferred** — it is not required for the pickup flow to work.

## 8. Prerequisites — fix before or with this

| | |
|---|---|
| 🔴 **`orderTotal` is silently dropped on every kiosk send-out.** `operator-scan-init.js:257` sets it; `scan-session.js` `apply()` never copies it into the payload. The UI *requires* it before enabling Confirm, the server would record it, and `Order.orderTotal` is what the admin revenue view reads. One-line client fix. **This spec makes it worse** — the store now enters a combined multi-bag total | must fix |
| 🟠 `operator-scan-init.js:229-230` claims "the server also hard-rejects the transition without it" about payment confirmation. **False** — send-out without confirmation is UI-gated only | fix the comment, or make it true |
| 🟡 `bagService.linkToOrderAtIntake()` is dead code, so `Bag.orderCount` / `lastIntakeAt` are never written. Multi-bag makes them worth having | wire or delete |
| 🟡 `operatorShiftStatsService.js:154` reads `Customer.numberOfBags`, **which does not exist on the model** — always computes 1. The whole `numberOfBags` cluster is vestigial | delete |

## 9. Cents integration — webhooks EXIST (corrected 2026-09-26)

An earlier draft of this section claimed Cents had no API. **That was wrong.** The webhook documentation
lives on `chathelp.trycents.com`, a help subdomain not linked from the marketing site's navigation or its
partner page, so four separate sources came back empty and the conclusion was over-generalised from
"not found" to "does not exist". Source:
`chathelp.trycents.com/en/articles/12083443-how-to-connect-cents-webhooks-to-your-systems`.

### What Cents actually sends

Six events: `customer_created`, `customer_updated`, `order_created`, `order_updated`,
`order_completed`, `customer_marketing_optin`.

Order payloads carry, among others:

| Field | Why it matters here |
|---|---|
| `order.status` — `SUBMITTED, READY_FOR_PICKUP, PICKED_UP, IN_PROGRESS, READY_FOR_RETURN, OUT_FOR_DELIVERY, COMPLETED, CANCELLED` | their lifecycle, a superset of ours |
| **`balanceDue`**, `orderTotal`, `tipAmount`, `creditAmount`, `promotionAmount` | `balanceDue === 0` is a **verified** payment fact |
| `services[].quantity` + `services[].modifiers[].pricingType` (`PER_POUND` \| `FLAT`) | the **weight**, for per-pound services |
| `pickupDeliveryFee`, `returnDeliveryFee` | Cents already models delivery fees — see the D2 interaction below |
| `customer.centsCustomerId`, `customer.phoneNumber` | candidate join keys |

There is also a **companion REST API** ("How to Connect the Cents API to Your Systems"), details via CSM.

### What this could automate

Three of this spec's manual operator checkboxes become verifiable:

| Today (manual checkbox) | With webhooks |
|---|---|
| "Order created in Cents" | `order_created` arrives |
| "Laundry weighed" | `services[].quantity` on a `PER_POUND` modifier |
| "Payment confirmed" | `balanceDue === 0` |

### ⛔ Three blockers before we trust a single byte of it

**1. No signature verification is documented.** No HMAC, no shared secret, no signing key — just a
"publicly accessible HTTP POST endpoint". An unauthenticated public endpoint that flips a payment flag is
forgeable by anyone who learns the URL. **Therefore: a webhook must never be the sole authority for
money.** Either verify each event against a REST API read before acting, or keep the operator's
confirmation and let the webhook merely pre-fill it. Ask the CSM about signing and about the IP
allowlist — the doc says requests "include the following headers including IP & timestamp" but shows only
an unreadable image.

**2. No join key exists.** The Cents order is created separately by a human, so nothing links their
`order.id` to our `Order`. Matching on `customer.phoneNumber` plus "the open order" is fragile — and
wrong the moment a customer has two orders in a day. This needs `Order.centsOrderId` and a deliberate way
to populate it: either the REST API lets us **create** the Cents order (best — we get the id back), or
the operator records it, which is one more manual step and defeats the point.

**3. No retry or ordering guarantees are documented**, and endpoints that fail get **disabled**
("otherwise you will receive a webhook disabled email"). So the consumer must be idempotent, tolerate
out-of-order delivery, never assume it saw every event, and be monitored — a silently disabled endpoint
would look exactly like "no orders today".

### D2 interaction worth checking

Cents carries its own `pickupDeliveryFee` / `returnDeliveryFee`. Our per-bag partner fee (D2) is computed
and snapshotted on our side. If both are populated, a customer could be charged twice, or the partner's
commission could disagree with what the customer actually paid. Decide which system owns the delivery
fee before wiring anything.

### Recommended sequencing

**Phase 1 (this spec): ship the manual flow.** Not because webhooks are unavailable, but because access
is gated on a CSM conversation, the security model is undocumented, and the join key does not exist yet.

**Phase 2: a webhook consumer**, additive and non-breaking — the operator checkboxes stay and become
*pre-filled confirmations* rather than the source of truth. That keeps the store working if the endpoint
is ever disabled.

### Ask the CSM

1. Webhook **signing / shared secret**, and the exact IP ranges (the header detail is an image).
2. Retry policy, delivery guarantees, and what exactly triggers the auto-disable.
3. REST API scope — specifically whether we can **create an order** and receive its id, which is the
   difference between automation and yet another manual step.
4. Sandbox/test account, so this is not developed against production laundry.
5. Whether **Cents Connect** (their machine-payment product) exposes anything additional.
6. Whether `pickupDeliveryFee` can be **set** by us, which would resolve the D2 overlap cleanly.

## 10. Still open

1. **D15** — the pickup-defaults / delivery-blank reading above needs your confirmation.
2. **Bag accumulation has no ceiling.** `bagsIssued` now tracks it, so the data exists; nothing caps or
   reclaims. Fine until churn or deposits matter.
3. **Escalation resolution flow** — specced as admin-only with a note. Whether a partner can resolve
   their own pickup mismatch (they have the knowledge; they also have the incentive) is unsettled.

## Verification

- Registration through a partner QR creates Customer + Bag(`active`) and emails a working print link;
  the printed QR and the bag label render **byte-identical** QR payloads.
- A second scan while `pending` offers **add-bag only** — no new-order branch — and confirming
  increments `bagCount` via `$inc`; a third scan inside the debounce window re-confirms.
- The same `pending` order resolves to `add-bag` for a partner session and `intake` for an operator,
  and a UI asking for the wrong one gets a 409 rather than a wrong mutation.
- Operator correcting 3 → 2 changes `deliveryFeeCharged` to `perBagFee × 2` and writes an audit row.
- `perBagFee × bagCount` appears in the order-start email in all four locales.
- No `mint`/`issue`/`print-run` route remains; no code path can create a `minted` or `issued` Bag.
- A partner declaring 2 against a 3-bag order raises `pickup_count_mismatch`, notifies partner + admin,
  and changes **no** fee.
- Scanning a superseded token resolves to the same customer and prompts for the new label; the same scan
  with no new label raises `superseded_token_no_new_label`.
- A one-bag order with `bagsIssued: 1` and `newReturnBags: 0` charges nothing and leaves `bagsIssued` at 1.
- A customer holding 3 bags who sends 1 and takes 2 spares is charged for **2**.
- Strict TDD throughout: a failing test first for each of the above, each asserting persistence by
  re-reading from the database — a mocked model accepts a discarded write and passes vacuously, which is
  how three silent-discard bugs reached production in this codebase already.
