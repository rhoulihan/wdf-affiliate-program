/**
 * checkSMTP must complete an SMTP conversation, not abandon the socket.
 *
 * The original implementation destroyed the socket the instant TCP connected —
 * before the server had sent its 220 greeting. Postfix logs that as
 * `lost connection after CONNECT ... commands=0/0`, and with the monitor running
 * in every pm2 worker on both boxes it accounted for ~31% of the mail host's
 * submission log (614 of 2000 lines, split 306/308 between the boxes).
 *
 * It also made the probe weaker than it looked: destroying on `connect` proves
 * only that a TCP port accepts, never that SMTP is answering.
 */
const net = require('net');

function startFakeSmtp(onSession) {
  const srv = net.createServer((sock) => {
    const seen = [];
    sock.write('220 fake.test ESMTP ready\r\n');
    sock.on('data', (d) => {
      seen.push(d.toString().trim());
      if (/^QUIT/i.test(d.toString())) { sock.write('221 Bye\r\n'); sock.end(); }
    });
    sock.on('close', () => onSession(seen));
    sock.on('error', () => {});
  });
  return srv;
}

describe('connectivity-monitor checkSMTP', () => {
  let srv; let port; let sessions;
  beforeEach((done) => {
    sessions = [];
    srv = startFakeSmtp((seen) => sessions.push(seen));
    srv.listen(0, '127.0.0.1', () => { port = srv.address().port; done(); });
  });
  afterEach((done) => { srv.close(done); });

  test('reports success against a live SMTP server', async () => {
    const { checkSMTP } = require('../../server/monitoring/connectivity-monitor');
    const r = await checkSMTP({ host: '127.0.0.1', port });
    expect(r.success).toBe(true);
    expect(typeof r.responseTime).toBe('number');
  });

  test('sends QUIT — it does not abandon the connection (the regression)', async () => {
    const { checkSMTP } = require('../../server/monitoring/connectivity-monitor');
    await checkSMTP({ host: '127.0.0.1', port });
    await new Promise((r) => setTimeout(r, 120));
    expect(sessions.length).toBe(1);
    expect(sessions[0].join(' ')).toMatch(/QUIT/i);
  });

  test('fails when the port is closed', async () => {
    const { checkSMTP } = require('../../server/monitoring/connectivity-monitor');
    const closed = await new Promise((res) => {
      const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    });
    const r = await checkSMTP({ host: '127.0.0.1', port: closed });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test('a port that accepts TCP but never speaks SMTP is NOT a success', async () => {
    // The old implementation called this healthy. A silent port is not a mail server.
    const mute = net.createServer(() => { /* accept, say nothing */ });
    const p = await new Promise((res) => mute.listen(0, '127.0.0.1', () => res(mute.address().port)));
    const { checkSMTP } = require('../../server/monitoring/connectivity-monitor');
    const r = await checkSMTP({ host: '127.0.0.1', port: p }, 400);
    mute.close();
    expect(r.success).toBe(false);
  });
});
