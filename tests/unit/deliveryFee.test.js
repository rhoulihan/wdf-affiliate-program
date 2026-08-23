// Effective delivery fee resolution: a partner's own fee, else the
// platform default (SystemConfig `default_delivery_fee`, default $10).
const { effectiveDeliveryFee, DEFAULT_DELIVERY_FEE_KEY } = require('../../server/utils/deliveryFee');
const SystemConfig = require('../../server/models/SystemConfig');

describe('effectiveDeliveryFee', () => {
  afterEach(async () => {
    // remove any override so each test starts from the built-in default
    await SystemConfig.deleteOne({ key: DEFAULT_DELIVERY_FEE_KEY });
  });

  it("returns the partner's own fee when they set one", async () => {
    expect(await effectiveDeliveryFee({ deliveryFee: 8 })).toBe(8);
    expect(await effectiveDeliveryFee({ deliveryFee: 12.5 })).toBe(12.5);
  });

  it('falls back to the $10 default when the partner has no fee', async () => {
    expect(await effectiveDeliveryFee({ deliveryFee: 0 })).toBe(10);
    expect(await effectiveDeliveryFee({})).toBe(10);
    expect(await effectiveDeliveryFee(null)).toBe(10);
  });

  it('honors an admin-configured default_delivery_fee', async () => {
    await SystemConfig.setValue(DEFAULT_DELIVERY_FEE_KEY, 15);
    expect(await effectiveDeliveryFee({ deliveryFee: 0 })).toBe(15);
    expect(await effectiveDeliveryFee({ deliveryFee: 6 })).toBe(6); // own fee still wins
  });
});
