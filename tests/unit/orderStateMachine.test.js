// Unit tests for the 4-state scan-gate order machine (Phase 1 PR 3, spec §3/§6).
// Pure logic — no DB needed.
const {
  TRANSITIONS,
  OPEN_STATUSES,
  CLOSED_STATUSES,
  canTransition,
  applyTransition,
  resolveScanAction,
  TransitionError
} = require('../../server/modules/orders/orderStateMachine');

describe('orderStateMachine (4-state)', () => {
  describe('TRANSITIONS', () => {
    it('defines the canonical 4-gate map from spec §3', () => {
      expect(TRANSITIONS).toEqual({
        pending: ['in_progress', 'cancelled'],
        in_progress: ['out_for_delivery', 'cancelled'],
        out_for_delivery: ['complete', 'cancelled'],
        complete: [],
        cancelled: []
      });
    });

    it('exposes OPEN/CLOSED status partitions', () => {
      expect(OPEN_STATUSES).toEqual(['pending', 'in_progress', 'out_for_delivery']);
      expect(CLOSED_STATUSES).toEqual(['complete', 'cancelled']);
    });
  });

  describe('canTransition', () => {
    it.each([
      ['pending', 'in_progress'],
      ['pending', 'cancelled'],
      ['in_progress', 'out_for_delivery'],
      ['in_progress', 'cancelled'],
      ['out_for_delivery', 'complete'],
      ['out_for_delivery', 'cancelled']
    ])('allows %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    it.each([
      ['pending', 'out_for_delivery'],
      ['pending', 'complete'],
      ['in_progress', 'complete'],
      ['complete', 'cancelled'],
      ['cancelled', 'pending'],
      ['processed', 'ready_for_pickup'], // old enum is dead
      [undefined, 'in_progress']
    ])('rejects %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('applyTransition stamping', () => {
    const stamp = { by: 'OP-1', role: 'operator' };

    it('in_progress stamps the intake sub-object', () => {
      const order = { status: 'pending' };
      applyTransition(order, 'in_progress', stamp);
      expect(order.status).toBe('in_progress');
      expect(order.intake.at).toBeInstanceOf(Date);
      expect(order.intake.by).toBe('OP-1');
      expect(order.intake.role).toBe('operator');
    });

    it('out_for_delivery stamps storePickup and the manual-payment flag', () => {
      const order = { status: 'in_progress' };
      applyTransition(order, 'out_for_delivery', { ...stamp, paymentConfirmed: true });
      expect(order.status).toBe('out_for_delivery');
      expect(order.storePickup.at).toBeInstanceOf(Date);
      expect(order.storePickup.by).toBe('OP-1');
      expect(order.paymentConfirmedManually).toBe(true);
    });

    it('out_for_delivery WITHOUT paymentConfirmed is refused outright', () => {
      // Previously this merely left the flag falsey and let the order leave the
      // store. Confirmation was enforced only by a disabled button in the operator
      // kiosk — whose own comment wrongly told the reader the server rejected it
      // too — so every other caller, including PUT /orders/:orderId/status, walked
      // straight through. Send-out is where the fee is snapshotted, so the rule
      // lives in the state machine and applies to every path.
      const order = { status: 'in_progress' };
      expect(() => applyTransition(order, 'out_for_delivery', stamp))
        .toThrow(/[Pp]ayment must be confirmed/);
      expect(order.status).toBe('in_progress');
      expect(order.storePickup).toBeUndefined();
    });

    it('the refusal carries payment_not_confirmed and a 400', () => {
      try {
        applyTransition({ status: 'in_progress' }, 'out_for_delivery', stamp);
        throw new Error('expected applyTransition to throw');
      } catch (err) {
        expect(err.code).toBe('payment_not_confirmed');
        expect(err.statusCode).toBe(400);
      }
    });

    it('complete stamps delivery + completedAt', () => {
      const order = { status: 'out_for_delivery' };
      applyTransition(order, 'complete', { by: 'AFF-9', role: 'affiliate' });
      expect(order.status).toBe('complete');
      expect(order.delivery.at).toBeInstanceOf(Date);
      expect(order.delivery.by).toBe('AFF-9');
      expect(order.delivery.role).toBe('affiliate');
      expect(order.completedAt).toBeInstanceOf(Date);
    });

    it('cancelled stamps cancelledAt', () => {
      const order = { status: 'pending' };
      applyTransition(order, 'cancelled', stamp);
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toBeInstanceOf(Date);
    });

    it('honours an explicit at timestamp', () => {
      const at = new Date('2026-01-01T00:00:00Z');
      const order = { status: 'pending' };
      applyTransition(order, 'in_progress', { ...stamp, at });
      expect(order.intake.at).toEqual(at);
    });

    it('throws TransitionError on an invalid move and leaves the order untouched', () => {
      const order = { status: 'complete' };
      expect(() => applyTransition(order, 'cancelled', stamp)).toThrow(TransitionError);
      expect(order.status).toBe('complete');
      expect(order.cancelledAt).toBeUndefined();
    });

    it('TransitionError carries code + statusCode', () => {
      const order = { status: 'pending' };
      try {
        applyTransition(order, 'complete', stamp);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.code).toBe('invalid_transition');
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe('resolveScanAction', () => {
    const reopenWindowMs = 240 * 60 * 1000;
    const now = new Date('2026-06-15T12:00:00Z');

    it('no order -> create-pending', () => {
      expect(resolveScanAction(null, { now, reopenWindowMs }))
        .toEqual({ action: 'create-pending' });
    });

    it('cancelled order -> create-pending', () => {
      expect(resolveScanAction({ status: 'cancelled' }, { now, reopenWindowMs }))
        .toEqual({ action: 'create-pending' });
    });

    it('pending -> advance to in_progress', () => {
      expect(resolveScanAction({ status: 'pending' }, { now, reopenWindowMs }))
        .toEqual({ action: 'advance', to: 'in_progress' });
    });

    it('in_progress -> advance to out_for_delivery', () => {
      expect(resolveScanAction({ status: 'in_progress' }, { now, reopenWindowMs }))
        .toEqual({ action: 'advance', to: 'out_for_delivery' });
    });

    it('out_for_delivery -> advance to complete', () => {
      expect(resolveScanAction({ status: 'out_for_delivery' }, { now, reopenWindowMs }))
        .toEqual({ action: 'advance', to: 'complete' });
    });

    it('complete within the reopen window -> delivery-rescan-prompt', () => {
      const completedAt = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
      const res = resolveScanAction(
        { status: 'complete', completedAt, orderId: 'ORD-1' },
        { now, reopenWindowMs }
      );
      expect(res).toEqual({ action: 'delivery-rescan-prompt', orderId: 'ORD-1' });
    });

    it('complete beyond the reopen window -> create-pending', () => {
      const completedAt = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5h ago
      expect(resolveScanAction(
        { status: 'complete', completedAt, orderId: 'ORD-1' },
        { now, reopenWindowMs }
      )).toEqual({ action: 'create-pending' });
    });
  });
});
