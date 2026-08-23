// Unit test for the From override added to the email transport.
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../../server/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }));

const nodemailer = require('nodemailer');
const { sendEmail, createTransport } = require('../../server/services/email/transport');

describe('email transport — From override', () => {
  let sendMail;
  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';
  });

  it('uses the fromOverride argument verbatim when provided', async () => {
    await sendEmail('to@example.com', 'Subj', '<p>hi</p>', '"Laundromat" <admin@rundberglaundry.com>');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].from).toBe('"Laundromat" <admin@rundberglaundry.com>');
  });

  it('falls back to the default From when no override is given', async () => {
    await sendEmail('to@example.com', 'Subj', '<p>hi</p>');
    expect(sendMail.mock.calls[0][0].from).toContain('no-reply@crhsent.com');
  });
});

describe('email transport — TLS servername when connecting by IP', () => {
  const savedHost = process.env.EMAIL_HOST;
  const savedServername = process.env.EMAIL_TLS_SERVERNAME;
  beforeEach(() => {
    jest.clearAllMocks();
    nodemailer.createTransport.mockReturnValue({ sendMail: jest.fn() });
    process.env.EMAIL_PROVIDER = 'smtp';
  });
  afterEach(() => {
    if (savedHost === undefined) delete process.env.EMAIL_HOST; else process.env.EMAIL_HOST = savedHost;
    if (savedServername === undefined) delete process.env.EMAIL_TLS_SERVERNAME; else process.env.EMAIL_TLS_SERVERNAME = savedServername;
  });

  it('uses the cert-matching default servername (mail.crhsent.com) when EMAIL_HOST is an IP', () => {
    process.env.EMAIL_HOST = '158.62.198.7';
    delete process.env.EMAIL_TLS_SERVERNAME;
    createTransport();
    expect(nodemailer.createTransport.mock.calls[0][0].tls.servername).toBe('mail.crhsent.com');
  });

  it('honors EMAIL_TLS_SERVERNAME override when EMAIL_HOST is an IP', () => {
    process.env.EMAIL_HOST = '158.62.198.7';
    process.env.EMAIL_TLS_SERVERNAME = 'mail.example.net';
    createTransport();
    expect(nodemailer.createTransport.mock.calls[0][0].tls.servername).toBe('mail.example.net');
  });

  it('does not set a servername when EMAIL_HOST is a hostname', () => {
    process.env.EMAIL_HOST = 'mail.crhsent.com';
    delete process.env.EMAIL_TLS_SERVERNAME;
    createTransport();
    expect(nodemailer.createTransport.mock.calls[0][0].tls.servername).toBeUndefined();
  });
});
