// Order integration tests — 4-state scan-gate machine (Phase 1 PR 3).
// Orders are slim state records; all money/weight/commission live in Cents.
const app = require('../../server');
const Order = require('../../server/models/Order');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const SystemConfig = require('../../server/models/SystemConfig');
const encryptionUtil = require('../../server/utils/encryption');
const jwt = require('jsonwebtoken');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');

describe('Order Integration Tests', () => {
  let testAffiliate;
  let testCustomer;
  let customerToken;
  let affiliateToken;
  let adminToken;
  let agent;
  let csrfToken;

  beforeAll(async () => { await SystemConfig.initializeDefaults(); });

  beforeEach(async () => {
    agent = createAgent(app);
    csrfToken = await getCsrfToken(app, agent);

    await Order.deleteMany({});
    await Customer.deleteMany({});
    await Affiliate.deleteMany({});

    const { hash, salt } = encryptionUtil.hashPassword('affiliatepass');
    testAffiliate = new Affiliate({
      affiliateId: 'AFF123',
      firstName: 'John', lastName: 'Doe', email: 'john@example.com',
      phone: '555-123-4567', address: '123 Main St', city: 'Austin', state: 'TX', zipCode: '78701',
      serviceArea: 'Downtown',
      username: 'johndoe', passwordHash: hash, passwordSalt: salt, paymentMethod: 'check'
    });
    await testAffiliate.save();

    affiliateToken = jwt.sign(
      { id: testAffiliate._id, affiliateId: 'AFF123', role: 'affiliate' },
      process.env.JWT_SECRET || 'test-secret'
    );

    const customerCreds = encryptionUtil.hashPassword('customerpass');
    testCustomer = new Customer({
      customerId: 'CUST123',
      firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com',
      phone: '555-987-6543', address: '456 Oak Ave', city: 'Austin', state: 'TX', zipCode: '78702',
      serviceFrequency: 'weekly', username: 'janesmith',
      passwordHash: customerCreds.hash, passwordSalt: customerCreds.salt, affiliateId: 'AFF123'
    });
    await testCustomer.save();

    customerToken = jwt.sign(
      { id: testCustomer._id, customerId: 'CUST123', role: 'customer' },
      process.env.JWT_SECRET || 'test-secret'
    );

    adminToken = jwt.sign(
      { id: 'admin123', role: 'admin' },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  // Helper: minimal slim order.
  const seedOrder = (overrides = {}) => new Order({
    orderId: 'ORD123456',
    customerId: 'CUST123',
    affiliateId: 'AFF123',
    bagId: 'BAG-' + Math.random().toString(36).slice(2),
    status: 'in_progress',
    pickup: { at: new Date(), by: 'AFF123', role: 'affiliate' },
    ...overrides
  }).save();

  describe('GET /api/v1/orders/:orderId', () => {
    beforeEach(async () => {
      await seedOrder({ bagId: 'BAG-details-1' });
    });

    it('should return order details for customer', async () => {
      const response = await agent
        .get('/api/v1/orders/ORD123456')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        order: {
          orderId: 'ORD123456',
          customerId: 'CUST123',
          affiliateId: 'AFF123',
          customer: { name: 'Jane Smith', email: 'jane@example.com' }
        }
      });
    });

    it('should return order details for affiliate', async () => {
      const response = await agent
        .get('/api/v1/orders/ORD123456')
        .set('Authorization', `Bearer ${affiliateToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.orderId).toBe('ORD123456');
    });

    it('should fail for unauthorized customer', async () => {
      const otherCustomerToken = jwt.sign(
        { id: 'other', customerId: 'CUST999', role: 'customer' },
        process.env.JWT_SECRET || 'test-secret'
      );
      const response = await agent
        .get('/api/v1/orders/ORD123456')
        .set('Authorization', `Bearer ${otherCustomerToken}`);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, message: 'Unauthorized' });
    });

    it('should return 404 for non-existent order', async () => {
      const response = await agent
        .get('/api/v1/orders/NONEXISTENT')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, message: 'Order not found' });
    });
  });

  describe('PUT /api/v1/orders/:orderId/status', () => {
    beforeEach(async () => {
      await seedOrder({ bagId: 'BAG-status-1', status: 'pending' });
    });

    it('should advance pending -> in_progress as operator', async () => {
      const operatorToken = jwt.sign({ id: 'op1', role: 'operator' }, process.env.JWT_SECRET || 'test-secret');
      const response = await agent
        .put('/api/v1/orders/ORD123456/status')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true, orderId: 'ORD123456', status: 'in_progress'
      });
      const order = await Order.findOne({ orderId: 'ORD123456' });
      expect(order.status).toBe('in_progress');
      expect(order.intake.at).toBeDefined();
    });

    it('should advance to complete and stamp completedAt', async () => {
      await Order.updateOne({ orderId: 'ORD123456' }, { status: 'out_for_delivery' });
      const operatorToken = jwt.sign({ id: 'op1', role: 'operator' }, process.env.JWT_SECRET || 'test-secret');
      const response = await agent
        .put('/api/v1/orders/ORD123456/status')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'complete' });
      expect(response.status).toBe(200);
      const order = await Order.findOne({ orderId: 'ORD123456' });
      expect(order.status).toBe('complete');
      expect(order.completedAt).toBeDefined();
    });

    it('should prevent invalid status transitions', async () => {
      await Order.updateOne({ orderId: 'ORD123456' }, { status: 'complete' });
      const response = await agent
        .put('/api/v1/orders/ORD123456/status')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'in_progress' });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false, message: 'Invalid status transition from complete to in_progress'
      });
    });

    it('should fail for unauthorized affiliate', async () => {
      const otherAffiliateToken = jwt.sign(
        { id: 'other', affiliateId: 'AFF999', role: 'affiliate' },
        process.env.JWT_SECRET || 'test-secret'
      );
      const response = await agent
        .put('/api/v1/orders/ORD123456/status')
        .set('Authorization', `Bearer ${otherAffiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'in_progress' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, message: 'Unauthorized' });
    });
  });

  describe('POST /api/v1/orders/:orderId/cancel', () => {
    beforeEach(async () => {
      await seedOrder({ bagId: 'BAG-cancel-1', status: 'in_progress' });
    });

    it('should cancel order as customer', async () => {
      const response = await agent
        .post('/api/v1/orders/ORD123456/cancel')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true, message: 'Order cancelled successfully' });
      const order = await Order.findOne({ orderId: 'ORD123456' });
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toBeDefined();
    });

    it('should cancel order as affiliate', async () => {
      const response = await agent
        .post('/api/v1/orders/ORD123456/cancel')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent cancelling closed orders', async () => {
      await Order.updateOne({ orderId: 'ORD123456' }, { status: 'complete' });
      const response = await agent
        .post('/api/v1/orders/ORD123456/cancel')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('complete');
    });

    it('should fail for unauthorized user', async () => {
      const otherCustomerToken = jwt.sign(
        { id: 'other', customerId: 'CUST999', role: 'customer' },
        process.env.JWT_SECRET || 'test-secret'
      );
      const response = await agent
        .post('/api/v1/orders/ORD123456/cancel')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, message: 'Unauthorized' });
    });
  });

  // The bulk order endpoints (PUT /bulk/status, POST /bulk/cancel) were removed
  // in the 2026-06-23 audit (zero callers; raw status= bypass skipped stamps +
  // the revenue snapshot). The single-order PUT /:orderId/status now records the
  // same send-out revenue snapshot the scan path does — no longer a divergence.
  describe('Order status revenue snapshot (out_for_delivery)', () => {
    it('refuses send-out via PUT when payment is not confirmed', async () => {
      // The gate lives in the state machine precisely so this route cannot bypass
      // it — it was previously the widest hole, being reachable by an affiliate.
      const order = await seedOrder({ status: 'in_progress' });

      const response = await agent
        .put(`/api/v1/orders/${order.orderId}/status`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'out_for_delivery', orderTotal: 42.5 });

      expect(response.status).toBe(400);
      const saved = await Order.findOne({ orderId: order.orderId });
      expect(saved.status).toBe('in_progress');
      expect(saved.orderTotal).toBeUndefined();
    });

    it('records deliveryFeeCharged + operator orderTotal on send-out via PUT /:orderId/status', async () => {
      await Affiliate.updateOne({ affiliateId: 'AFF123' }, { deliveryFee: 8 });
      const order = await seedOrder({ status: 'in_progress' });

      const response = await agent
        .put(`/api/v1/orders/${order.orderId}/status`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'out_for_delivery', orderTotal: 42.5, paymentConfirmed: true });

      expect(response.status).toBe(200);
      const saved = await Order.findOne({ orderId: order.orderId });
      expect(saved.status).toBe('out_for_delivery');
      expect(saved.deliveryFeeCharged).toBe(8); // partner's OWN fee, frozen as commission
      expect(saved.orderTotal).toBeCloseTo(42.5, 2);
    });

    it('rejects a negative orderTotal with 400 and does not persist the transition', async () => {
      const order = await seedOrder({ status: 'in_progress' });

      const response = await agent
        .put(`/api/v1/orders/${order.orderId}/status`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'out_for_delivery', orderTotal: -5, paymentConfirmed: true });

      expect(response.status).toBe(400);
      const saved = await Order.findOne({ orderId: order.orderId });
      expect(saved.status).toBe('in_progress'); // unchanged — threw before save
    });
  });

  describe('Order export functionality', () => {
    beforeEach(async () => {
      const orders = [];
      for (let i = 1; i <= 15; i++) {
        orders.push({
          orderId: `ORD${String(i).padStart(3, '0')}`,
          customerId: 'CUST123',
          affiliateId: 'AFF123',
          bagId: `BAG-export-${i}`,
          status: i <= 10 ? 'complete' : 'in_progress',
          pickup: { at: new Date(), by: 'AFF123', role: 'affiliate' },
          completedAt: i <= 10 ? new Date(`2025-05-${String(i).padStart(2, '0')}`) : undefined,
          createdAt: new Date(`2025-05-${String(i).padStart(2, '0')}`)
        });
      }
      await Order.insertMany(orders);
    });

    it('should export orders as CSV', async () => {
      const response = await agent
        .get('/api/v1/orders/export')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .query({ format: 'csv', startDate: '2025-05-01', endDate: '2025-05-31', affiliateId: 'AFF123' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('ORD001');
    });

    it('should export orders as JSON', async () => {
      const response = await agent
        .get('/api/v1/orders/export')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .query({ format: 'json', status: 'complete', affiliateId: 'AFF123' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toMatchObject({ success: true, totalOrders: 10, orders: expect.any(Array) });
      expect(response.body.orders).toHaveLength(10);
      expect(response.body.orders.every(o => o.status === 'complete')).toBe(true);
    });

    it('should respect export permissions', async () => {
      const response = await agent
        .get('/api/v1/orders/export')
        .set('Authorization', `Bearer ${customerToken}`)
        .query({ format: 'csv' });
      expect(response.status).toBe(403);
    });
  });

  describe('Order filtering and search', () => {
    beforeEach(async () => {
      const customers = [
        { customerId: 'CUST001', firstName: 'Alice', lastName: 'Anderson', affiliateId: 'AFF123' },
        { customerId: 'CUST002', firstName: 'Bob', lastName: 'Brown', affiliateId: 'AFF123' },
        { customerId: 'CUST003', firstName: 'Charlie', lastName: 'Clark', affiliateId: 'AFF456' }
      ];
      await Customer.insertMany(customers.map(c => ({
        ...c, email: `${c.firstName.toLowerCase()}@example.com`, phone: '555-0000',
        address: '123 Test St', city: 'Austin', state: 'TX', zipCode: '78701',
        serviceFrequency: 'weekly', username: c.firstName.toLowerCase(),
        passwordHash: 'hash', passwordSalt: 'salt'
      })));

      await Order.insertMany([
        { orderId: 'ORD001', customerId: 'CUST001', affiliateId: 'AFF123', bagId: 'BAG-filter-1', status: 'complete', pickup: { at: new Date(), by: 'AFF123', role: 'affiliate' } },
        { orderId: 'ORD002', customerId: 'CUST002', affiliateId: 'AFF123', bagId: 'BAG-filter-2', status: 'out_for_delivery', pickup: { at: new Date(), by: 'AFF123', role: 'affiliate' } },
        { orderId: 'ORD003', customerId: 'CUST001', affiliateId: 'AFF123', bagId: 'BAG-filter-3', status: 'in_progress', pickup: { at: new Date(), by: 'AFF123', role: 'affiliate' } }
      ]);
    });

    it('should search orders by customer name', async () => {
      const response = await agent
        .get('/api/v1/orders/search')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .query({ search: 'alice', affiliateId: 'AFF123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const ids = response.body.orders.map(o => o.orderId);
      expect(ids).toEqual(expect.arrayContaining(['ORD001', 'ORD003']));
    });

    it('should provide aggregated statistics with filters', async () => {
      const response = await agent
        .get('/api/v1/orders/statistics')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .query({ affiliateId: 'AFF123' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        statistics: {
          totalOrders: 3,
          ordersByStatus: { in_progress: 1, out_for_delivery: 1, complete: 1 },
          completedCount: 1
        }
      });
    });
  });
});
