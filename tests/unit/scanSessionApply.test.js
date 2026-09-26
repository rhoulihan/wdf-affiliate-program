/**
 * ScanSession.apply() must forward every field the kiosk collects.
 *
 * `operator-scan-init.js` sets `opts.orderTotal` from the operator's input and
 * will not enable Confirm until it is filled. The server accepts `orderTotal` and
 * records it through `recordSendOutSnapshot`, and `Order.orderTotal` is what the
 * admin revenue view reads. But `apply()` built its payload from an explicit list
 * that omitted `orderTotal`, so the number the operator typed was dropped on the
 * floor on every send-out — silently, with a 200 back.
 *
 * The lesson this encodes: a hand-maintained forwarding list is a silent-drop
 * machine. Each field the kiosk can send is asserted here individually.
 */
describe('ScanSession.apply payload', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  let captured;

  function loadScanSession() {
    jest.resetModules();
    captured = [];
    global.localStorage = {
      store: {},
      getItem(k) { return this.store[k] || null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; }
    };
    global.fetch = jest.fn((url, opts) => {
      captured.push({ url, body: JSON.parse(opts.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
      });
    });
    const mod = require('../../public/assets/js/scan-session');
    const ScanSession = mod.ScanSession || global.window?.ScanSession;
    ScanSession.init({ mode: 'operator' });
    return ScanSession;
  }

  const applyWith = async (opts) => {
    const ScanSession = loadScanSession();
    await ScanSession.apply(TOKEN, 'advance', opts);
    return captured[0].body;
  };

  it('sends the token and expectedAction (guards against a vacuous pass)', async () => {
    const body = await applyWith({});
    expect(body.bagToken).toBe(TOKEN);
    expect(body.expectedAction).toBe('advance');
  });

  it('forwards orderTotal — the send-out figure the operator types', async () => {
    const body = await applyWith({ orderTotal: 42.5 });
    expect(body.orderTotal).toBe(42.5);
  });

  it('forwards orderTotal of 0 rather than dropping it as falsy', async () => {
    // A genuinely free order is a real case; `if (opts.orderTotal)` would lose it.
    const body = await applyWith({ orderTotal: 0 });
    expect(body.orderTotal).toBe(0);
  });

  it('forwards paymentConfirmed', async () => {
    const body = await applyWith({ paymentConfirmed: true });
    expect(body.paymentConfirmed).toBe(true);
  });

  it('forwards reopen, including false', async () => {
    expect((await applyWith({ reopen: true })).reopen).toBe(true);
    expect((await applyWith({ reopen: false })).reopen).toBe(false);
  });

  it('forwards addOns and specialInstructions', async () => {
    const body = await applyWith({ addOns: ['fabric-softener'], specialInstructions: 'cold wash' });
    expect(body.addOns).toEqual(['fabric-softener']);
    expect(body.specialInstructions).toBe('cold wash');
  });

  it('omits fields the caller did not set', async () => {
    const body = await applyWith({});
    expect(body).not.toHaveProperty('orderTotal');
    expect(body).not.toHaveProperty('paymentConfirmed');
    expect(body).not.toHaveProperty('addOns');
  });
});
