// Plan 3 task 30, defects 2 and 3. checkSMTP's QUIT (defect 1) is covered by
// connectivityMonitorSmtp.test.js; this file covers the two that cut VOLUME.
//
// startMonitoring() was called from server.js inside app.listen, so EVERY pm2
// worker ran its own 60-second cycle: 2 workers x 2 boxes x 1/min = 4 SMTP
// connections/min against the mail host, which measured 94.1% of its submission
// log. Gating to worker 0 and moving to 300s takes that to 0.2/min - 20x.
//
// Heavy deps are mocked so no real network I/O happens when the cycle fires.
jest.mock('axios', () => ({ get: jest.fn().mockResolvedValue({ status: 200 }) }));
jest.mock('../../server/utils/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('mongoose', () => ({
  connection: { readyState: 1, db: { admin: () => ({ ping: jest.fn().mockResolvedValue({}) }) } }
}));

const monitor = require('../../server/monitoring/connectivity-monitor');

describe('task 30: the probe runs in one worker, every 5 minutes', () => {
  const OLD = process.env.NODE_APP_INSTANCE;
  const timers = [];
  afterEach(() => {
    if (OLD === undefined) delete process.env.NODE_APP_INSTANCE;
    else process.env.NODE_APP_INSTANCE = OLD;
    while (timers.length) clearInterval(timers.pop());
    jest.restoreAllMocks();
  });

  it('exports MONITORING_CONFIG so the interval is assertable', () => {
    expect(monitor.MONITORING_CONFIG).toBeDefined();
  });

  it('polls no more often than every 5 minutes', () => {
    expect(monitor.MONITORING_CONFIG.checkInterval).toBeGreaterThanOrEqual(300000);
  });

  it('does NOT start on a pm2 worker other than 0 — and schedules no timer', () => {
    process.env.NODE_APP_INSTANCE = '1';
    const spy = jest.spyOn(global, 'setInterval');
    expect(monitor.startMonitoring()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('starts on pm2 worker 0 and returns an unref-able timer', () => {
    process.env.NODE_APP_INSTANCE = '0';
    const t = monitor.startMonitoring();
    expect(t).not.toBe(false);
    expect(typeof t.unref).toBe('function');
    timers.push(t);
  });

  it('still starts outside pm2, where NODE_APP_INSTANCE is undefined', () => {
    delete process.env.NODE_APP_INSTANCE;
    const t = monitor.startMonitoring();
    expect(t).not.toBe(false);
    expect(typeof t.unref).toBe('function');   // not merely "not false" - a real timer
    timers.push(t);
  });
});
