// orderTransitionService — the seam the scan layer (PR 4/5) calls.
// create-at-pickup, state-driven advance, cancel, undo, 4h delivery-rescan.

jest.mock('../../server/utils/emailService', () => ({
  sendCustomerDeliveredEmail: jest.fn().mockResolvedValue(true),
  sendOrderStatusUpdateEmail: jest.fn().mockResolvedValue(true),
  sendOrderCancellationEmail: jest.fn().mockResolvedValue(true),
  sendAffiliateNewOrderEmail: jest.fn().mockResolvedValue(true),
  sendAffiliateOrderReadyEmail: jest.fn().mockResolvedValue(true)
}));

const mongoose = require('mongoose');
const Order = require('../../server/models/Order');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const Bag = require('../../server/modules/bags/Bag');
const SystemConfig = require('../../server/models/SystemConfig');
const svc = require('../../server/modules/orders/orderTransitionService');
const { ensureTestAffiliate, ensureTestCustomer } = require('../helpers/v2TestHelpers');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 32 hex

describe('orderTransitionService', () => {
  let affiliate, customer, bag;
  const opRole = { by: '507f1f77bcf86cd799439011', role: 'operator' };
  const affRole = () => ({ by: affiliate.affiliateId, role: 'affiliate' });

  beforeEach(async () => {
    await Promise.all([
      Order.deleteMany({}), Customer.deleteMany({}),
      Affiliate.deleteMany({}), Bag.deleteMany({})
    ]);
    jest.clearAllMocks();
    await SystemConfig.initializeDefaults();
    affiliate = await ensureTestAffiliate();
    customer = await ensureTestCustomer({ affiliateId: affiliate.affiliateId });
    bag = await Bag.create({
      token: TOKEN, tokenHash: Bag.hashToken(TOKEN),
      affiliateId: affiliate.affiliateId, customerId: customer.customerId,
      status: 'active', batchId: 'BATCH-test'
    });
  });

  async function freshBag() {
    return Bag.findOne({ bagId: bag.bagId });
  }

  describe('createPendingOrder', () => {
    it('creates one pending order with ids from the bag (never client input)', async () => {
      const { order } = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(order.status).toBe('pending');
      expect(order.customerId).toBe(customer.customerId);
      expect(order.affiliateId).toBe(affiliate.affiliateId);
      expect(order.bagId).toBe(bag.bagId);
      expect(order.bagToken).toBe(TOKEN);
      expect(order.pickup.by).toBe(affiliate.affiliateId);
      expect(order.pickup.role).toBe('affiliate');
      expect(order.pickup.at).toBeInstanceOf(Date);
    });

    it('rejects an unregistered bag (no customer) with bag_not_registered', async () => {
      bag.customerId = null; bag.status = 'issued'; await bag.save();
      await expect(svc.createPendingOrder({ bag: await freshBag(), ...affRole() }))
        .rejects.toMatchObject({ code: 'bag_not_registered' });
    });

    it('blocks a second open order for the same bag with order_already_open', async () => {
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      await expect(svc.createPendingOrder({ bag: await freshBag(), ...affRole() }))
        .rejects.toMatchObject({ code: 'order_already_open', status: 409 });
      expect(await Order.countDocuments({ bagId: bag.bagId })).toBe(1);
    });

    // Order-start reminder flags (PR-A2): firstOrder + emailVerified.
    async function priorOrder(status) {
      await Order.create({
        customerId: customer.customerId, affiliateId: affiliate.affiliateId,
        bagId: 'BAG-prior-' + status, bagToken: status.padEnd(32, '0').slice(0, 32),
        status, pickup: { at: new Date(), by: affiliate.affiliateId, role: 'affiliate' }
      });
    }

    it('flags the first order (firstOrder true) and mirrors the customer emailVerified', async () => {
      customer.emailVerified = true; await customer.save();
      const res = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(res.firstOrder).toBe(true);
      expect(res.emailVerified).toBe(true);
    });

    it('firstOrder is false once the customer has a prior non-cancelled order', async () => {
      await priorOrder('complete');
      const res = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(res.firstOrder).toBe(false);
    });

    it('a cancelled prior order does not count — still the first (real) order', async () => {
      await priorOrder('cancelled');
      const res = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(res.firstOrder).toBe(true);
    });

    it('emailVerified is false when the customer email is unverified', async () => {
      customer.emailVerified = false; await customer.save();
      const res = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(res.emailVerified).toBe(false);
    });
  });

  describe('advanceOrder (state-driven)', () => {
    async function openPending() {
      const { order } = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      return order;
    }

    it('pending -> in_progress stamps intake', async () => {
      await openPending();
      const { order, action } = await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      expect(order.status).toBe('in_progress');
      expect(action).toBe('advance');
      expect(order.intake.by).toBe(opRole.by);
      expect(order.intake.role).toBe('operator');
    });

    it('in_progress -> out_for_delivery stamps storePickup + payment flag', async () => {
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // -> in_progress
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole, paymentConfirmed: true });
      expect(order.status).toBe('out_for_delivery');
      expect(order.storePickup.at).toBeInstanceOf(Date);
      expect(order.paymentConfirmedManually).toBe(true);
    });

    it('records orderTotal + snapshots the partner delivery fee as commission at send-out', async () => {
      affiliate.deliveryFee = 8; await affiliate.save();
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // -> in_progress
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole, paymentConfirmed: true, orderTotal: 42.5 });
      expect(order.status).toBe('out_for_delivery');
      expect(order.orderTotal).toBe(42.5);
      expect(order.deliveryFeeCharged).toBe(8); // partner's own fee = commission
    });

    it('snapshots deliveryFeeCharged = 0 for a default-fee partner (house revenue, not commission)', async () => {
      affiliate.deliveryFee = 0; await affiliate.save(); // no own fee → platform default
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole, paymentConfirmed: true, orderTotal: 30 });
      expect(order.orderTotal).toBe(30);
      expect(order.deliveryFeeCharged).toBe(0);
    });

    it('rejects an invalid (negative) order total at send-out', async () => {
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      await expect(svc.advanceOrder({ bag: await freshBag(), ...opRole, orderTotal: -5 }))
        .rejects.toThrow();
    });

    it('freezes commission against a later partner fee change', async () => {
      affiliate.deliveryFee = 8; await affiliate.save();
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole, orderTotal: 50 });
      expect(order.deliveryFeeCharged).toBe(8);
      affiliate.deliveryFee = 12; await affiliate.save();
      const reloaded = await Order.findOne({ orderId: order.orderId });
      expect(reloaded.deliveryFeeCharged).toBe(8); // snapshot unchanged
    });

    it('out_for_delivery -> complete stamps delivery + completedAt + sends delivered email', async () => {
      const emailService = require('../../server/utils/emailService');
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      expect(order.status).toBe('complete');
      expect(order.completedAt).toBeInstanceOf(Date);
      expect(order.delivery.role).toBe('affiliate');
      expect(emailService.sendCustomerDeliveredEmail).toHaveBeenCalledTimes(1);
    });

    it('no open order -> create-pending action (opens a new pending)', async () => {
      const { order, action } = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      expect(action).toBe('create-pending');
      expect(order.status).toBe('pending');
    });

    it('complete within reopen window -> delivery-rescan-prompt (no mutation)', async () => {
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const done = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      expect(done.order.status).toBe('complete');

      const res = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      expect(res.action).toBe('delivery-rescan-prompt');
      expect(res.orderId).toBe(done.order.orderId);
      // no new order created
      expect(await Order.countDocuments({ bagId: bag.bagId })).toBe(1);
    });

    it('complete beyond reopen window -> opens a fresh pending', async () => {
      await openPending();
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const done = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      // Force completedAt far in the past.
      await Order.updateOne({ orderId: done.order.orderId },
        { $set: { completedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) } });

      const res = await svc.advanceOrder({ bag: await freshBag(), ...affRole() });
      expect(res.action).toBe('create-pending');
      expect(res.order.status).toBe('pending');
      expect(await Order.countDocuments({ bagId: bag.bagId })).toBe(2);
    });
  });

  describe('cancelOrder', () => {
    it('cancels an open order and stamps cancelledAt', async () => {
      const { order } = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      const { order: cancelled } = await svc.cancelOrder({ order, ...opRole });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    });
  });

  describe('transition notifications (PR B)', () => {
    const email = require('../../server/utils/emailService');
    const AddOn = require('../../server/models/AddOn');
    const custRole = () => ({ by: customer.customerId, role: 'customer' });

    it('customer gets a status email on create / in_progress / out_for_delivery; cancel sends cancellation', async () => {
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: customer.customerId }), expect.anything(), 'pending', expect.anything());

      const { order: ip } = await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'in_progress', expect.anything());
      // in_progress carries NO envelope extras (no pickup/delivery instructions, no fee) — pin opts to {}
      const ipCall = email.sendOrderStatusUpdateEmail.mock.calls.find(c => c[2] === 'in_progress');
      expect(ipCall[3]).toEqual({});

      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // -> out_for_delivery
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'out_for_delivery', expect.anything());

      await svc.cancelOrder({ order: await Order.findOne({ orderId: ip.orderId }), ...opRole });
      expect(email.sendOrderCancellationEmail).toHaveBeenCalledTimes(1);
    });

    it('start email carries pickup instructions + delivery fee + resolved paid add-ons', async () => {
      affiliate.pickupInstructions = 'Leave on porch';
      affiliate.deliveryFee = 7.5;
      await affiliate.save();
      await AddOn.updateOne({ key: 'premium_detergent' }, { $set: { price: 5 } });

      await svc.createPendingOrder({ bag: await freshBag(), ...affRole(), addOns: ['premium_detergent'] });
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'pending',
        expect.objectContaining({
          pickupInstructions: 'Leave on porch',
          deliveryFee: 7.5,
          addOns: expect.arrayContaining([expect.objectContaining({ key: 'premium_detergent', price: 5 })])
        }));
    });

    it('out_for_delivery email carries the affiliate delivery instructions', async () => {
      affiliate.deliveryInstructions = 'Ring the bell; hand to staff.';
      await affiliate.save();
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // in_progress
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // out_for_delivery
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'out_for_delivery',
        expect.objectContaining({ deliveryInstructions: 'Ring the bell; hand to staff.' }));
    });

    it('affiliate (opted-in) gets a new-order email on ANY start (customer OR staff)', async () => {
      affiliate.orderNotificationsEnabled = true; await affiliate.save();

      // operator/staff-initiated → affiliate new-order email STILL fires
      await svc.createPendingOrder({ bag: await freshBag(), ...opRole });
      expect(email.sendAffiliateNewOrderEmail).toHaveBeenCalledTimes(1);
      jest.clearAllMocks();
      await Order.deleteMany({});

      // customer-initiated → also fires
      await svc.createPendingOrder({ bag: await freshBag(), ...custRole() });
      expect(email.sendAffiliateNewOrderEmail).toHaveBeenCalledTimes(1);
    });

    it('affiliate (opted-in) gets NO email at out_for_delivery (ready email removed; they manage their own schedule)', async () => {
      affiliate.orderNotificationsEnabled = true; await affiliate.save();
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() }); // 1 new-order email
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // in_progress
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // out_for_delivery
      expect(email.sendAffiliateOrderReadyEmail).not.toHaveBeenCalled();
      expect(email.sendAffiliateNewOrderEmail).toHaveBeenCalledTimes(1); // only the start email
    });

    it('affiliate (opted-OUT, the default) gets NO affiliate emails', async () => {
      expect(affiliate.orderNotificationsEnabled).toBe(false);
      await svc.createPendingOrder({ bag: await freshBag(), ...custRole() });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // in_progress
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // out_for_delivery
      expect(email.sendAffiliateNewOrderEmail).not.toHaveBeenCalled();
      expect(email.sendAffiliateOrderReadyEmail).not.toHaveBeenCalled();
      // ...but the customer still got status emails
      expect(email.sendOrderStatusUpdateEmail).toHaveBeenCalled();
    });

    it('an UNVERIFIED customer email gets NO order emails (only the welcome reaches unverified)', async () => {
      customer.emailVerified = false; await customer.save();
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // in_progress
      await svc.advanceOrder({ bag: await freshBag(), ...opRole }); // out_for_delivery
      expect(email.sendOrderStatusUpdateEmail).not.toHaveBeenCalled();
      expect(email.sendCustomerDeliveredEmail).not.toHaveBeenCalled();
    });
  });

  describe('undoLastTransition', () => {
    it('deletes a just-created pending order', async () => {
      const { order } = await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      const res = await svc.undoLastTransition({ order, by: opRole.by });
      expect(res.undone).toBe('deleted');
      expect(await Order.countDocuments({ orderId: order.orderId })).toBe(0);
    });

    it('rolls in_progress back to pending', async () => {
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      expect(order.status).toBe('in_progress');
      const res = await svc.undoLastTransition({ order, by: opRole.by });
      expect(res.order.status).toBe('pending');
    });

    it('rolls out_for_delivery back to in_progress', async () => {
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      expect(order.status).toBe('out_for_delivery');
      const res = await svc.undoLastTransition({ order, by: opRole.by });
      expect(res.order.status).toBe('in_progress');
    });

    it('clears the revenue snapshot when undoing from out_for_delivery', async () => {
      affiliate.deliveryFee = 8; await affiliate.save();
      await svc.createPendingOrder({ bag: await freshBag(), ...affRole() });
      await svc.advanceOrder({ bag: await freshBag(), ...opRole });
      const { order } = await svc.advanceOrder({ bag: await freshBag(), ...opRole, orderTotal: 50 });
      expect(order.orderTotal).toBe(50);
      expect(order.deliveryFeeCharged).toBe(8);
      const res = await svc.undoLastTransition({ order, by: opRole.by });
      expect(res.order.status).toBe('in_progress');
      expect(res.order.orderTotal).toBeUndefined();   // snapshot cleared
      expect(res.order.deliveryFeeCharged).toBe(0);
    });
  });
});
