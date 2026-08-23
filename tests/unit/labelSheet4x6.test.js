// labelSheetService — 4x6 single-label-per-page thermal format (HP KE100).
// Each page = one 4in x 6in label: the logo, affiliate name (every label),
// QR (claim identity), a blank handwriting line for the customer name, bag ref.
jest.mock('qrcode'); // mock BEFORE require

const QRCode = require('qrcode');
const Bag = require('../../server/modules/bags/Bag');
const Affiliate = require('../../server/models/Affiliate');
const bagService = require('../../server/modules/bags/bagService');
const labelSheetService = require('../../server/modules/bags/labelSheetService');
const { hashPassword } = require('../../server/utils/encryption');

async function createAffiliate(businessName) {
  const { salt, hash } = hashPassword('TestAffiliatePass123!');
  const affiliate = new Affiliate({
    firstName: 'Test', lastName: 'Affiliate',
    email: `label4x6-${Date.now()}@example.com`, username: `label4x6${Date.now()}`,
    passwordHash: hash, passwordSalt: salt,
    phone: '+15125550100', address: '123 Test St', city: 'Austin',
    state: 'TX', zipCode: '78701', businessName,
    serviceArea: 'Downtown', serviceLatitude: 30.2672, serviceLongitude: -97.7431,
    serviceRadius: 10,
    paymentMethod: 'check'
  });
  await affiliate.save();
  return affiliate;
}

describe('labelSheetService — 4x6 thermal labels', () => {
  beforeEach(async () => {
    await Bag.deleteMany({});
    await Affiliate.deleteMany({});
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,TESTQR');
  });

  it('renders one 4x6 .label block per bag, each with logo, name, QR, blank line, ref', async () => {
    const affiliate = await createAffiliate('Austin Wash Co');
    const { batchId, bags } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 3, adminId: affiliate._id
    });
    // renderLabelSheet only renders claimable bags (issued/active/retired);
    // print-run always issues before rendering, so mirror that here.
    await bagService.issueBatch({ batchId, adminId: affiliate._id });

    const html = await labelSheetService.renderLabelSheet(batchId);

    // one .label block per bag
    expect((html.match(/class="label"/g) || [])).toHaveLength(3);
    // QR data-URI per bag
    expect((html.match(/data:image\/png;base64,TESTQR/g) || [])).toHaveLength(3);
    // affiliate name once per bag (on EVERY label)
    expect((html.match(/Austin Wash Co/g) || [])).toHaveLength(3);
    // logo embedded as a data-URI img (thermal SVG, so it always prints)
    expect((html.match(/<img class="label-logo"[^>]*src="data:image\/png;base64,/g) || [])).toHaveLength(3);
    // blank customer-name handwriting line per bag
    expect((html.match(/class="label-customer-line"/g) || [])).toHaveLength(3);
    for (const bag of bags) {
      expect(html).toContain(bag.bagId.slice(-6)); // staff ref, not the secret
      expect(html).not.toContain(bag.token);       // raw token NEVER in markup
    }
  });

  it('prints the partner address under the customer-name line on every label', async () => {
    const affiliate = await createAffiliate('Austin Wash Co');
    const { batchId } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 2, adminId: affiliate._id
    });
    await bagService.issueBatch({ batchId, adminId: affiliate._id });

    const html = await labelSheetService.renderLabelSheet(batchId);
    // partner address line once per bag, after the blank customer-name line
    expect((html.match(/class="label-partner-address"/g) || [])).toHaveLength(2);
    expect(html).toContain('123 Test St, Austin, TX 78701');
    const lineIdx = html.indexOf('label-customer-line');
    const addrIdx = html.indexOf('label-partner-address');
    expect(addrIdx).toBeGreaterThan(lineIdx); // address sits BELOW the write-in line
  });

  it('uses errorCorrectionLevel M and the existing claim URL for the QR', async () => {
    const affiliate = await createAffiliate('QR Co');
    const { batchId, bags } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 1, adminId: affiliate._id
    });
    await bagService.issueBatch({ batchId, adminId: affiliate._id });
    await labelSheetService.renderLabelSheet(batchId);
    const base = process.env.BASE_URL || 'https://rundberglaundry.com';
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      `${base}/embed-app-v2.html?route=/claim&bag=${bags[0].token}`,
      expect.objectContaining({ errorCorrectionLevel: 'M' })
    );
  });

  it('references the 4x6 print stylesheet and an external auto-print script (CSP-clean)', async () => {
    const affiliate = await createAffiliate('CSP Co');
    const { batchId } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 1, adminId: affiliate._id
    });
    await bagService.issueBatch({ batchId, adminId: affiliate._id });
    const html = await labelSheetService.renderLabelSheet(batchId);
    // external stylesheet + auto-print script, with a ?v= cache-buster
    // (assets are served immutable/CDN-fronted)
    expect(html).toMatch(/href="\/assets\/css\/bag-labels\.css(\?v=[^"]+)?"/);
    // external print script (script-src 'self' — no nonce needed), no inline JS/CSS
    expect(html).toMatch(/src="\/assets\/js\/print-labels\.js(\?v=[^"]+)?"/);
    expect(html).not.toMatch(/ style="/i);
    expect(html).not.toMatch(/<style/i);
  });

  it('the 4x6 page geometry lives in bag-labels.css', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(
      path.join(__dirname, '../../public/assets/css/bag-labels.css'), 'utf8'
    );
    expect(css).toMatch(/@page/);
    expect(css).toMatch(/4in/);
    expect(css).toMatch(/6in/);
  });

  it('HTML-escapes the affiliate name', async () => {
    const affiliate = await createAffiliate('<script>alert(1)</script>');
    const { batchId } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 1, adminId: affiliate._id
    });
    await bagService.issueBatch({ batchId, adminId: affiliate._id });
    const html = await labelSheetService.renderLabelSheet(batchId);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('returns null for an unknown batch', async () => {
    expect(await labelSheetService.renderLabelSheet('BATCH-nope')).toBeNull();
  });

  it('excludes minted (unclaimable) bags — a never-issued batch renders null', async () => {
    const affiliate = await createAffiliate('Orphan Co');
    const { batchId } = await bagService.mintBatch({
      affiliateId: affiliate.affiliateId, quantity: 2, adminId: affiliate._id
    });
    // No issueBatch → bags stay 'minted'; their QR tokens resolve to null, so
    // they must not be printed. With no claimable bags the sheet is null.
    expect(await labelSheetService.renderLabelSheet(batchId)).toBeNull();
  });
});
