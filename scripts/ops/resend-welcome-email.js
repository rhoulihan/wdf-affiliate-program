#!/usr/bin/env node

// Resend welcome email to specific affiliate
// dotenv MUST load before anything else: the email stack reads BRAND_* and
// EMAIL_* config, and loading it late is how this script shipped mail branded
// "Laundromat" instead of the configured brand name.
require('dotenv').config();
const mongoose = require('mongoose');
const Affiliate = require('../../server/models/Affiliate');
const emailService = require('../../server/utils/emailService');

async function resendWelcomeEmail(email) {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Find affiliate
    const affiliate = await Affiliate.findOne({ email });
    
    if (!affiliate) {
      console.error(`❌ Affiliate with email ${email} not found`);
      return;
    }

    console.log(`Found affiliate: ${affiliate.firstName} ${affiliate.lastName}`);
    console.log(`Affiliate ID: ${affiliate.affiliateId}`);
    
    // Send welcome email
    console.log('\nSending welcome email...');
    await emailService.sendAffiliateWelcomeEmail(affiliate);
    
    console.log('✅ Welcome email sent successfully!');
    
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    if (error.responseCode === 535) {
      console.error('\n🔐 Authentication failed! Please fix the mailcow password first.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.error('Usage: node resend-welcome-email.js <email>');
  console.error('Example: node resend-welcome-email.js colinhoulihan96@gmail.com');
  process.exit(1);
}

resendWelcomeEmail(email);