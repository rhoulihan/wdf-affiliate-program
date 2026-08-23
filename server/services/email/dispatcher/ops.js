// Operational email dispatchers — service alerts.
// Extracted from utils/emailService.js in Phase 2. (The order ready / on-the-way
// lifecycle emails were removed in Phase 1 PR 3 with the old order lifecycle.)

const { sendEmail } = require('../transport');
const brand = require('../../../config/brand');
/**
 * Send service down alert email
 */
exports.sendServiceDownAlert = async function({ serviceName, error, timestamp, serviceData }) {
  const mailOptions = {
    from: `"${brand.displayName} Monitoring" <${process.env.EMAIL_FROM || 'no-reply@rundberglaundry.com'}>`,
    to: process.env.ALERT_EMAIL || process.env.DEFAULT_ADMIN_EMAIL || 'admin@rundberglaundry.com',
    subject: `⚠️ CRITICAL: ${serviceName} Service Down - ${new Date().toISOString()}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Service Down Alert</h2>
        </div>
        <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 0 0 8px 8px; padding: 20px;">
          <h3 style="color: #dc3545;">Critical Service Failure Detected</h3>
          
          <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Service:</strong> ${serviceName}</p>
            <p style="margin: 5px 0 0;"><strong>Status:</strong> DOWN</p>
            <p style="margin: 5px 0 0;"><strong>Error:</strong> ${error || 'Connection timeout'}</p>
            <p style="margin: 5px 0 0;"><strong>Time:</strong> ${timestamp.toLocaleString()}</p>
          </div>
          
          <h4>Service Statistics:</h4>
          <ul style="list-style: none; padding: 0;">
            <li>• <strong>Last Success:</strong> ${serviceData.lastSuccess ? new Date(serviceData.lastSuccess).toLocaleString() : 'Never'}</li>
            <li>• <strong>Total Checks:</strong> ${serviceData.totalChecks}</li>
            <li>• <strong>Failed Checks:</strong> ${serviceData.failedChecks}</li>
            <li>• <strong>Availability:</strong> ${((serviceData.uptime / serviceData.totalChecks) * 100).toFixed(2)}%</li>
          </ul>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Action Required:</strong></p>
            <p style="margin: 5px 0 0;">This critical service requires immediate attention. Please investigate and resolve the issue as soon as possible.</p>
          </div>
          
          <p style="margin-top: 20px;">
            <a href="https://rundberglaundry.com/monitoring-dashboard.html" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">View Monitoring Dashboard</a>
          </p>
        </div>
      </div>
    `,
    text: `
CRITICAL SERVICE DOWN ALERT

Service: ${serviceName}
Status: DOWN
Error: ${error || 'Connection timeout'}
Time: ${timestamp.toLocaleString()}

Service Statistics:
- Last Success: ${serviceData.lastSuccess ? new Date(serviceData.lastSuccess).toLocaleString() : 'Never'}
- Total Checks: ${serviceData.totalChecks}
- Failed Checks: ${serviceData.failedChecks}
- Availability: ${((serviceData.uptime / serviceData.totalChecks) * 100).toFixed(2)}%

ACTION REQUIRED: This critical service requires immediate attention.

View monitoring dashboard: https://rundberglaundry.com/monitoring-dashboard.html
    `
  };

  // Use the internal sendEmail function
  return sendEmail(mailOptions.to, mailOptions.subject, mailOptions.html);
};

module.exports = exports;
