// Mock the transport BEFORE requiring the dispatcher (house rule).
jest.mock('../../server/services/email/transport', () => ({
  sendEmail: jest.fn().mockResolvedValue(true)
}));

const fs = require('fs');
const path = require('path');
const brand = require('../../server/config/brand');
const { sendEmail } = require('../../server/services/email/transport');
const onboarding = require('../../server/services/email/dispatcher/onboarding');

describe('onboarding email dispatcher — sendAffiliateInviteEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(['en', 'es', 'pt', 'de'])(
    '%s affiliate-invite template exists with the canonical placeholders and no script',
    (lang) => {
      const file = path.join(__dirname, '../../server/templates/emails', lang, 'affiliate-invite.html');
      const html = fs.readFileSync(file, 'utf8');
      expect(html).toContain('[INVITE_URL]');
      expect(html).toContain('[EXPIRES_AT]');
      expect(html).toContain('[FIRST_NAME]');
      expect(html).not.toMatch(/<script/i);
    }
  );

  test('fills invite_url / expires_at / first_name and sends with a language-specific subject', async () => {
    await onboarding.sendAffiliateInviteEmail({
      email: 'invitee@example.com',
      firstName: 'Ina',
      inviteUrl: 'https://wavemax.promo/embed-app-v2.html?route=/affiliate-register&invite=abc123',
      expiresAt: new Date('2026-06-12T12:00:00Z'),
      language: 'es'
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe('invitee@example.com');
    expect(subject.toLowerCase()).toContain('invitaci'); // "invitación"
    expect(html).toContain('route=/affiliate-register&invite=abc123');
    expect(html).toContain('Ina');
    expect(html).not.toContain('[INVITE_URL]');
    expect(html).not.toContain('[EXPIRES_AT]');
  });

  test('falls back to English for an unknown language', async () => {
    await onboarding.sendAffiliateInviteEmail({
      email: 'invitee@example.com',
      firstName: 'Ina',
      inviteUrl: 'https://wavemax.promo/embed-app-v2.html?route=/affiliate-register&invite=abc123',
      expiresAt: new Date('2026-06-12T12:00:00Z'),
      language: 'fr'
    });
    const [, subject] = sendEmail.mock.calls[0];
    expect(subject).toBe(`Your ${brand.displayName} Affiliate Invitation`);
  });

  test('propagates transport failure to the caller', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(onboarding.sendAffiliateInviteEmail({
      email: 'invitee@example.com',
      firstName: 'Ina',
      inviteUrl: 'https://x',
      expiresAt: new Date(),
      language: 'en'
    })).rejects.toThrow('smtp down');
  });
});
