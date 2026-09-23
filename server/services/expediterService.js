// Order Expediter aggregations (PR D) — read-only, AGGREGATE-ONLY (no customer
// PII). Powers the always-on in-store display: who has active orders, totals by
// state across all affiliates, and a daily completed-orders summary.
//
// Phase 1 holds no weight/money (Cents owns it), so the daily summary reports
// counts + timing only (no "pounds of WDF"). Timing is derived from the scan
// timestamps already on the Order: intake.at, storePickup.at, pickup.at,
// completedAt.

const Order = require('../models/Order');
const Affiliate = require('../models/Affiliate');
const SystemConfig = require('../models/SystemConfig');
const { OPEN_STATUSES } = require('../modules/orders/orderStateMachine');

// Cap the per-affiliate rows returned to the display (counters always reflect
// ALL open orders — only the table is bounded). Single-store volume is tiny;
// this just bounds a pathological response.
const MAX_AFFILIATE_ROWS = 100;

/**
 * Start of "today" in the store's configured timezone, returned as a UTC Date
 * for the Mongo query. The server may run in UTC while the store keeps local
 * hours (system_timezone, default America/Chicago) — using the server's own
 * local midnight would misalign the day boundary by the tz offset.
 */
/**
 * The zone's UTC offset in ms at a given instant (east of UTC is positive).
 * Derived from the zone's own wall-clock reading of that instant, so it is
 * DST-correct by construction and never consults the server clock.
 */
function tzOffsetMsAt(date, tz) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date)) p[type] = value;
  // Some ICU builds render midnight as hour "24" with hour12:false.
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hour, Number(p.minute), Number(p.second)
  );
  // Compare against the instant truncated to the second, because formatToParts
  // gives no sub-second field.
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which "today" began on the wall clock of `tz`.
 *
 * MUST NOT depend on the server's own timezone. The previous implementation
 * round-tripped toLocaleString() through new Date() and then called
 * setHours(0,0,0,0) -- but setHours works in SERVER-local time while the offset
 * it subtracted was the target zone's, so the result was wrong by exactly the
 * server's own UTC offset. It looked correct only because both boxes run
 * Etc/UTC; `npm test` pins TZ=America/Chicago, which is where it surfaced.
 */
function startOfTodayInTz(tz) {
  const now = new Date();
  // Today's calendar date as the target zone sees it.
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)) p[type] = value;
  const y = Number(p.year); const mo = Number(p.month); const d = Number(p.day);
  const midnightAsIfUtc = Date.UTC(y, mo - 1, d);

  // Subtract the zone's offset to get the real instant. Two candidates, because a
  // zone that changes offset AT midnight makes the first guess land on the wrong
  // side of the jump:
  //   c1 -- offset sampled at the naive instant
  //   c2 -- offset re-sampled at c1
  // On a FALL-BACK-at-midnight day (e.g. Europe/Chisinau 2026-10-25) c1 reads
  // 01:00 and skips the repeated hour, so c2 is right. On a
  // SPRING-FORWARD-at-midnight day (e.g. America/Santiago 2026-09-06) midnight
  // does not exist at all and c2 lands at 23:00 on the PREVIOUS day, so c1 --
  // the first instant of the target date that does exist -- is right.
  // So: keep only candidates whose wall clock still falls on the target date,
  // and take the earliest. Neither pass alone is correct.
  const c1 = midnightAsIfUtc - tzOffsetMsAt(new Date(midnightAsIfUtc), tz);
  const c2 = midnightAsIfUtc - tzOffsetMsAt(new Date(c1), tz);
  const onTargetDate = (ts) => {
    const q = {};
    for (const { type, value } of new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(ts))) q[type] = value;
    return Number(q.year) === y && Number(q.month) === mo && Number(q.day) === d;
  };
  const valid = [c1, c2].filter(onTargetDate);
  return new Date(valid.length ? Math.min(...valid) : c1);
}

/**
 * @returns {Promise<{
 *   generatedAt: string,
 *   counters: {pending:number, in_progress:number, out_for_delivery:number, total:number},
 *   activeByAffiliate: Array<{affiliateId,name,serviceType,pending,in_progress,out_for_delivery,total}>,
 *   dailyCompleted: {count:number, avgProcessingMinutes:number|null, avgTurnaroundMinutes:number|null}
 * }>}
 */
async function getExpediterSummary() {
  // Open orders grouped by affiliate + status (skip orphan/null affiliateId).
  const openRows = await Order.aggregate([
    { $match: { status: { $in: OPEN_STATUSES }, affiliateId: { $ne: null } } },
    { $group: { _id: { affiliateId: '$affiliateId', status: '$status' }, count: { $sum: 1 } } }
  ]);

  const counters = { total: 0 };
  OPEN_STATUSES.forEach((s) => { counters[s] = 0; });

  const byAffiliate = new Map();
  for (const row of openRows) {
    const aid = row._id.affiliateId;
    const st = row._id.status;
    const c = row.count;
    if (aid == null) continue; // defensive (matched out above)
    if (!byAffiliate.has(aid)) {
      const rec = { affiliateId: aid, total: 0 };
      OPEN_STATUSES.forEach((s) => { rec[s] = 0; });
      byAffiliate.set(aid, rec);
    }
    const rec = byAffiliate.get(aid);
    if (rec[st] !== undefined) rec[st] += c;
    rec.total += c;
    if (counters[st] !== undefined) counters[st] += c;
    counters.total += c;
  }

  // Attach affiliate display names (no customer PII anywhere in this payload).
  const ids = [...byAffiliate.keys()];
  if (ids.length) {
    const affs = await Affiliate.find({ affiliateId: { $in: ids } })
      .select('affiliateId businessName firstName lastName serviceType').lean();
    const nameMap = new Map(affs.map((a) => [a.affiliateId, a]));
    for (const rec of byAffiliate.values()) {
      const a = nameMap.get(rec.affiliateId);
      rec.name = a ? (a.businessName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || rec.affiliateId)
        : rec.affiliateId;
      rec.serviceType = a ? a.serviceType : null;
    }
  }
  const activeByAffiliate = [...byAffiliate.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_AFFILIATE_ROWS);

  // Daily completed summary (orders completed since local midnight in the store tz).
  const tz = await SystemConfig.getValue('system_timezone', 'America/Chicago');
  const dayStart = startOfTodayInTz(tz);
  const completedToday = await Order.find({
    status: 'complete', completedAt: { $gte: dayStart }
  }).select('intake.at storePickup.at pickup.at completedAt').lean();

  let procSum = 0; let procN = 0; let turnSum = 0; let turnN = 0;
  for (const o of completedToday) {
    if (o.intake && o.intake.at && o.storePickup && o.storePickup.at) {
      procSum += (new Date(o.storePickup.at).getTime() - new Date(o.intake.at).getTime());
      procN += 1;
    }
    if (o.pickup && o.pickup.at && o.completedAt) {
      turnSum += (new Date(o.completedAt).getTime() - new Date(o.pickup.at).getTime());
      turnN += 1;
    }
  }
  const toMin = (ms) => Math.round(ms / 60000);

  return {
    generatedAt: new Date().toISOString(),
    counters,
    activeByAffiliate,
    dailyCompleted: {
      count: completedToday.length,
      // intake → ready-for-pickup (the in-store WDF window)
      avgProcessingMinutes: procN ? toMin(procSum / procN) : null,
      // pickup → delivered (full turnaround)
      avgTurnaroundMinutes: turnN ? toMin(turnSum / turnN) : null
    }
  };
}

module.exports = { getExpediterSummary, startOfTodayInTz };
