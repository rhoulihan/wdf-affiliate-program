// PR 4 — partner revenue/commission surfacing. Admin analytics sums the
// operator-entered order totals (revenue) and the partner-fee snapshots
// (commission); the platform default ($0 partner fee) stays revenue.
const adminDashboardService = require('../../server/services/adminDashboardService');
const Affiliate = require('../../server/models/Affiliate');
const Order = require('../../server/models/Order');
const { hashPassword } = require('../../server/utils/encryption');

async function makeAffiliate() {
  const { salt, hash } = hashPassword('StrongPassword123!');
  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return Affiliate.create({
    firstName: 'Rev', lastName: 'Partner', email: `rev${uniq}@example.com`,
    phone: '5125550000', address: '1 A St', city: 'Austin', state: 'TX', zipCode: '78701',
    username: `rev${uniq}`, passwordSalt: salt, passwordHash: hash, paymentMethod: 'check'
  });
}

describe('admin affiliate analytics — revenue + commission', () => {
  beforeEach(async () => { await Order.deleteMany({}); await Affiliate.deleteMany({}); });

  it('sums order totals as revenue and partner-fee snapshots as commission', async () => {
    const aff = await makeAffiliate();
    const base = { affiliateId: aff.affiliateId, customerId: 'CUST-x', bagId: 'BAG-x', status: 'complete' };
    // partner-fee order: counts $8 toward commission
    await Order.create({ ...base, orderTotal: 42.5, deliveryFeeCharged: 8 });
    // platform-default order: $0 commission, but its total is revenue
    await Order.create({ ...base, orderTotal: 30, deliveryFeeCharged: 0 });
    // an unsent (pending) order: no orderTotal → excluded from revenue
    await Order.create({ ...base, status: 'pending' });

    const start = new Date(Date.now() - 86400000);
    const end = new Date(Date.now() + 86400000);
    const { affiliates } = await adminDashboardService.getAffiliateAnalytics({ startDate: start, endDate: end });
    const row = affiliates.find(a => a.affiliateId === aff.affiliateId);
    expect(row).toBeTruthy();
    expect(row.metrics.totalRevenue).toBeCloseTo(72.5, 2);   // 42.5 + 30 (default fee stays revenue)
    expect(row.metrics.totalCommission).toBeCloseTo(8, 2);   // only the partner's own fee
    expect(row.metrics.totalOrders).toBe(3);
  });

  it('excludes a cancelled-after-send-out order (stale snapshot never settled)', async () => {
    const aff = await makeAffiliate();
    const base = { affiliateId: aff.affiliateId, customerId: 'CUST-x', bagId: 'BAG-x' };
    await Order.create({ ...base, status: 'complete', orderTotal: 40, deliveryFeeCharged: 5 });
    // sent out, then cancelled — keeps its snapshot but must NOT count
    await Order.create({ ...base, status: 'cancelled', orderTotal: 99, deliveryFeeCharged: 99 });

    const start = new Date(Date.now() - 86400000);
    const end = new Date(Date.now() + 86400000);
    const { affiliates } = await adminDashboardService.getAffiliateAnalytics({ startDate: start, endDate: end });
    const row = affiliates.find(a => a.affiliateId === aff.affiliateId);
    expect(row.metrics.totalRevenue).toBeCloseTo(40, 2);     // cancelled $99 excluded
    expect(row.metrics.totalCommission).toBeCloseTo(5, 2);   // cancelled $99 excluded
    expect(row.metrics.totalOrders).toBe(2);                 // count still includes the cancelled order
  });
});
