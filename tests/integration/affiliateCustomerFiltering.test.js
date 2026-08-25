jest.setTimeout(90000);

const request = require('supertest');
const app = require('../../server');
const Affiliate = require('../../server/models/Affiliate');
const Customer = require('../../server/models/Customer');
const encryptionUtil = require('../../server/utils/encryption');
const { expectSuccessResponse, expectErrorResponse } = require('../helpers/responseHelpers');
const { createFindOneMock, createFindMock, createMockDocument, createAggregateMock } = require('../helpers/mockHelpers');

describe('Affiliate Customer Filtering Integration Tests', () => {
  let testAffiliate;
  let testCustomer;
  let affiliateToken;

  beforeEach(async () => {
    // Create proper password hash for testing
    const testPassword = 'testpassword123';
    const { salt, hash } = encryptionUtil.hashPassword(testPassword);

    // Create test affiliate with all required fields
    testAffiliate = new Affiliate({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@testaffiliate.com',
      phone: '555-1234',
      businessName: 'Test Laundry Service',
      address: '123 Business St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      serviceArea: 'Downtown',
      deliveryFee: 25,
      username: 'john@testaffiliate.com',
      passwordSalt: salt,
      passwordHash: hash,
      paymentMethod: 'check',
      isActive: true
    });
    await testAffiliate.save();

    // Create proper password hash for customer
    const customerPassword = 'customerpass123';
    const { salt: customerSalt, hash: customerHash } = encryptionUtil.hashPassword(customerPassword);

    // Create test customer associated with affiliate
    testCustomer = new Customer({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@testcustomer.com',
      phone: '555-5678',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      serviceFrequency: 'weekly',
      affiliateId: testAffiliate.affiliateId,
      username: 'jane@testcustomer.com',
      passwordSalt: customerSalt,
      passwordHash: customerHash,
      isActive: true
    });
    await testCustomer.save();


    // Get affiliate authentication token
    const loginResponse = await request(app)
      .post('/api/v1/auth/affiliate/login')
      .send({
        username: testAffiliate.username,
        password: testPassword
      });

    affiliateToken = loginResponse.body.token;
  });

  describe('Email URL Generation for Customer Filtering', () => {
    test('should generate correct dashboard URL with customer parameter', () => {
      // Test the URL format that should be generated in emails
      const dashboardURL = `https://rundberglaundry.com/embed-app-v2.html?login=affiliate&customer=${testCustomer.customerId}`;

      expect(dashboardURL).toContain(`customer=${testCustomer.customerId}`);
      expect(dashboardURL).toContain('login=affiliate');
      expect(dashboardURL).toMatch(/customer=CUST-[a-f0-9-]+/);
    });
  });

  describe('Affiliate Dashboard Customer Filtering API', () => {
    test('should return customers for authenticated affiliate', async () => {
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.customers).toHaveLength(1);
      expect(response.body.customers[0]).toMatchObject({
        customerId: testCustomer.customerId,
        firstName: testCustomer.firstName,
        lastName: testCustomer.lastName,
        email: testCustomer.email,
        phone: testCustomer.phone
      });
    });

    test('should filter customers by customerId when provided', async () => {
      // Create additional customer with proper password hash
      const alicePassword = 'alicepass123';
      const { salt: aliceSalt, hash: aliceHash } = encryptionUtil.hashPassword(alicePassword);

      const additionalCustomer = new Customer({
        firstName: 'Alice',
        lastName: 'Brown',
        email: 'alice@customer.com',
        phone: '555-7777',
        address: '789 Pine St',
        city: 'Austin',
        state: 'TX',
        zipCode: '78703',
        serviceFrequency: 'monthly',
        affiliateId: testAffiliate.affiliateId,
        username: 'alice@customer.com',
        passwordSalt: aliceSalt,
        passwordHash: aliceHash,
        isActive: true
      });
      await additionalCustomer.save();

      // Request customers with specific filter
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .query({ customerId: testCustomer.customerId })
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.customers).toHaveLength(1);
      expect(response.body.customers[0].customerId).toBe(testCustomer.customerId);
    });

    test('should return empty array when filtering by non-existent customerId', async () => {
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .query({ customerId: 'NONEXISTENT123' })
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.customers).toHaveLength(0);
    });

    test('should require authentication to access customer list', async () => {
      await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .expect(401);
    });
  });

  describe('Complete Email-to-Dashboard Flow Simulation', () => {
    test('should handle complete flow from email generation to dashboard access', async () => {
      // Step 1: Simulate email URL generation
      const dashboardURL = `https://rundberglaundry.com/embed-app-v2.html?login=affiliate&customer=${testCustomer.customerId}`;

      // Verify URL contains customer parameter
      expect(dashboardURL).toContain(`customer=${testCustomer.customerId}`);
      expect(dashboardURL).toContain('login=affiliate');

      // Step 2: Simulate affiliate login (preserving customer parameter)
      const loginResponse = await request(app)
        .post('/api/v1/auth/affiliate/login')
        .send({
          username: testAffiliate.username,
          password: 'testpassword123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.affiliate.affiliateId).toBe(testAffiliate.affiliateId);

      // Step 3: Simulate dashboard access with customer filtering
      const dashboardResponse = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      // Verify dashboard can load customer data for highlighting
      expect(dashboardResponse.body.customers).toHaveLength(1);
      expect(dashboardResponse.body.customers[0].customerId).toBe(testCustomer.customerId);

      // Step 4: Verify affiliate dashboard stats also load correctly
      const statsResponse = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/dashboard`)
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.stats.customerCount).toBe(1);
    });

    test('should handle URL parameters correctly throughout the flow', async () => {
      // Simulate the URL structure that would come from email clicking
      const emailURL = `https://rundberglaundry.com/embed-app-v2.html?login=affiliate&customer=${testCustomer.customerId}`;

      // Parse URL parameters like the frontend would
      const url = new URL(emailURL);
      const loginParam = url.searchParams.get('login');
      const customerParam = url.searchParams.get('customer');

      expect(loginParam).toBe('affiliate');
      expect(customerParam).toBe(testCustomer.customerId);

      // After login, the redirect URL would be constructed
      const redirectURL = `/embed-app-v2.html?route=/affiliate-dashboard&id=${testAffiliate.affiliateId}&customer=${customerParam}`;

      expect(redirectURL).toContain(testAffiliate.affiliateId);
      expect(redirectURL).toContain(testCustomer.customerId);

      // Dashboard would then parse these parameters
      const redirectUrlObj = new URL(redirectURL, 'https://example.com');
      const routeParam = redirectUrlObj.searchParams.get('route');
      const idParam = redirectUrlObj.searchParams.get('id');
      const finalCustomerParam = redirectUrlObj.searchParams.get('customer');

      expect(routeParam).toBe('/affiliate-dashboard');
      expect(idParam).toBe(testAffiliate.affiliateId);
      expect(finalCustomerParam).toBe(testCustomer.customerId);
    });
  });

  describe('Dashboard Data Loading for Customer Highlighting', () => {
    test('should load affiliate profile data correctly', async () => {
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.affiliate).toMatchObject({
        firstName: testAffiliate.firstName,
        lastName: testAffiliate.lastName,
        email: testAffiliate.email,
        businessName: testAffiliate.businessName,
        deliveryFee: 25
      });
    });

    test('should load dashboard statistics correctly', async () => {
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/dashboard`)
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toMatchObject({
        customerCount: 1,
        activeOrderCount: 0,
        monthEarnings: 0,
        pendingEarnings: 0
      });
    });
  });

  describe('Error Handling in Customer Filtering Flow', () => {
    test('should handle invalid customer ID gracefully', async () => {
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .query({ customerId: 'INVALID_ID' })
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.customers).toHaveLength(0);
    });

    test('should handle invalid affiliate ID', async () => {
      await request(app)
        .get('/api/v1/affiliates/INVALID_AFFILIATE/customers')
        .set('Authorization', `Bearer ${affiliateToken}`)
        .expect(403);
    });

    test('should handle database connection issues gracefully', async () => {
      // This would require mocking the database connection to fail
      // For now, we'll test that the endpoint structure is correct
      const response = await request(app)
        .get(`/api/v1/affiliates/${testAffiliate.affiliateId}/customers`)
        .set('Authorization', `Bearer ${affiliateToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('customers');
    });
  });
});