const mongoose = require('mongoose');
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');

// Monitoring configuration
const MONITORING_CONFIG = {
  checkInterval: 60000, // 1 minute
  timeout: 10000, // 10 seconds per check
  retryAttempts: 3,
  retryDelay: 5000,
  alertCooldown: 3600000, // 1 hour between alerts for same service
};

// Services to monitor
const SERVICES = [
  {
    name: 'MongoDB Atlas',
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    critical: true,
  },
  {
    name: 'Mailcow SMTP',
    type: 'smtp',
    host: process.env.EMAIL_HOST || 'mail.rundberglaundry.com',
    port: process.env.EMAIL_PORT || 587,
    critical: false,
  },
  {
    name: 'DNS Resolution',
    type: 'dns',
    hostname: 'google.com',
    critical: true,
  },
];

// In-memory storage for monitoring data
const monitoringData = {
  services: {},
  lastAlert: {},
  startTime: Date.now(),
};

// Initialize monitoring data
SERVICES.forEach(service => {
  monitoringData.services[service.name] = {
    status: 'unknown',
    lastCheck: null,
    lastSuccess: null,
    lastFailure: null,
    uptime: 0,
    downtime: 0,
    totalChecks: 0,
    failedChecks: 0,
    responseTime: 0,
    history: [],
  };
});

/**
 * Check MongoDB connectivity
 */
async function checkMongoDB(service) { // eslint-disable-line no-unused-vars
  const startTime = Date.now();
  try {
    // Health-check via the EXISTING pooled connection — do NOT open a new one.
    // The previous version called mongoose.createConnection()+close() every cycle,
    // which on the Oracle ADB loadBalanced endpoint meant a fresh `hello` handshake
    // + PLAIN `saslStart` auth every 60s per worker (the connection churn / poor
    // pooling Oracle flagged). A ping on the live connection costs no new connection.
    const readyState = mongoose.connection ? mongoose.connection.readyState : 0;
    if (readyState === 2) {
      // Connecting (e.g. the brief startup window before the pool is ready) — this
      // is not an outage, so don't raise a false "down" alert; the next cycle pings.
      return { success: true, responseTime: Date.now() - startTime };
    }
    if (readyState !== 1) {
      return {
        success: false,
        error: `mongoose not connected (readyState ${readyState})`,
        responseTime: Date.now() - startTime,
      };
    }
    await mongoose.connection.db.admin().ping();
    return {
      success: true,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Check SMTP connectivity
 */
async function checkSMTP(service, timeoutMs) {
  const startTime = Date.now();
  const limit = timeoutMs || MONITORING_CONFIG.timeout;
  return new Promise((resolve) => {
    const client = new net.Socket();
    let resolved = false;
    let banner = '';

    // Complete the conversation instead of abandoning it. Destroying the socket
    // on 'connect' -- before the server has sent its 220 -- is logged by Postfix
    // as "lost connection after CONNECT ... commands=0/0", and with this monitor
    // running in every pm2 worker on both boxes that was ~31% of the mail host's
    // submission log. It also proved only that a TCP port accepts: a silent port
    // counted as healthy. Reading the 220 and sending QUIT proves SMTP is really
    // answering AND leaves a clean disconnect in the peer's log.
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      client.destroy();
      resolve({ ...result, responseTime: Date.now() - startTime });
    };

    client.setTimeout(limit);

    client.on('data', (chunk) => {
      banner += chunk.toString();
      if (/^220[ -]/.test(banner) && /\r?\n/.test(banner)) {
        // Say goodbye properly; end() flushes QUIT then half-closes.
        client.end('QUIT\r\n');
        finish({ success: true, banner: banner.split(/\r?\n/)[0].slice(0, 120) });
      } else if (/^[45]\d\d[ -]/.test(banner)) {
        finish({ success: false, error: 'SMTP refused: ' + banner.split(/\r?\n/)[0].slice(0, 120) });
      }
    });

    client.on('error', (error) => finish({ success: false, error: error.message }));
    client.on('timeout', () => finish({
      success: false,
      error: banner ? 'SMTP incomplete greeting' : 'Connection timeout'
    }));

    client.connect(service.port, service.host);
  });
}

/**
 * Check HTTPS endpoint
 */
async function checkHTTPS(service) {
  const startTime = Date.now();
  try {
    const response = await axios.get(service.url, {
      timeout: MONITORING_CONFIG.timeout,
      validateStatus: () => true, // Don't throw on any status
    });

    return {
      success: response.status < 500,
      statusCode: response.status,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Check DNS resolution
 */
async function checkDNS(service) {
  const startTime = Date.now();
  try {
    const addresses = await dns.resolve4(service.hostname);
    return {
      success: addresses.length > 0,
      addresses,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Perform health check for a service
 */
async function checkService(service) {
  let result;

  switch (service.type) {
  case 'mongodb':
    result = await checkMongoDB(service);
    break;
  case 'smtp':
    result = await checkSMTP(service);
    break;
  case 'https':
    result = await checkHTTPS(service);
    break;
  case 'dns':
    result = await checkDNS(service);
    break;
  default:
    result = { success: false, error: 'Unknown service type' };
  }

  // Update monitoring data
  const serviceData = monitoringData.services[service.name];
  serviceData.lastCheck = new Date();
  serviceData.totalChecks++;
  serviceData.responseTime = result.responseTime;

  if (result.success) {
    serviceData.status = 'up';
    serviceData.lastSuccess = new Date();
    serviceData.uptime++;
  } else {
    serviceData.status = 'down';
    serviceData.lastFailure = new Date();
    serviceData.failedChecks++;
    serviceData.downtime++;
    serviceData.lastError = result.error;
  }

  // Add to history (keep last 60 entries)
  serviceData.history.push({
    timestamp: new Date(),
    success: result.success,
    responseTime: result.responseTime,
    error: result.error,
  });

  if (serviceData.history.length > 60) {
    serviceData.history.shift();
  }

  // Handle alerts
  if (!result.success && service.critical) {
    await handleAlert(service, result);
  }

  return result;
}

/**
 * Handle service failure alerts
 */
async function handleAlert(service, result) {
  const lastAlertTime = monitoringData.lastAlert[service.name];
  const now = Date.now();

  // Check if we should send an alert (cooldown period)
  if (lastAlertTime && (now - lastAlertTime) < MONITORING_CONFIG.alertCooldown) {
    return;
  }

  monitoringData.lastAlert[service.name] = now;

  // Log the alert
  logger.error(`CRITICAL: ${service.name} is down`, {
    service: service.name,
    error: result.error,
    responseTime: result.responseTime,
  });

  // Send email alert
  try {
    await emailService.sendServiceDownAlert({
      serviceName: service.name,
      error: result.error,
      timestamp: new Date(),
      serviceData: monitoringData.services[service.name],
    });
  } catch (error) {
    logger.error('Failed to send alert email:', error);
  }
}

/**
 * Run monitoring checks for all services
 */
async function runMonitoringCycle() {
  const promises = SERVICES.map(service => checkService(service));
  await Promise.allSettled(promises);
}

/**
 * Get current monitoring status
 */
function getMonitoringStatus() {
  const now = Date.now();
  const uptime = now - monitoringData.startTime;

  const summary = {
    uptime,
    services: {},
    overallHealth: 'healthy',
    criticalServicesDown: [],
  };

  for (const [name, data] of Object.entries(monitoringData.services)) {
    const service = SERVICES.find(s => s.name === name);
    const availability = data.totalChecks > 0
      ? (data.uptime / data.totalChecks * 100).toFixed(2)
      : 0;

    summary.services[name] = {
      status: data.status,
      availability: `${availability}%`,
      lastCheck: data.lastCheck,
      lastSuccess: data.lastSuccess,
      lastFailure: data.lastFailure,
      responseTime: data.responseTime,
      totalChecks: data.totalChecks,
      failedChecks: data.failedChecks,
      lastError: data.lastError,
      history: data.history,
      critical: service.critical,
    };

    if (data.status === 'down' && service.critical) {
      summary.criticalServicesDown.push(name);
      summary.overallHealth = 'critical';
    } else if (data.status === 'down' && summary.overallHealth === 'healthy') {
      summary.overallHealth = 'degraded';
    }
  }

  return summary;
}

/**
 * Start monitoring
 */
function startMonitoring() {
  logger.info('Starting connectivity monitoring service');

  // Run initial check
  runMonitoringCycle();

  // Schedule periodic checks
  setInterval(runMonitoringCycle, MONITORING_CONFIG.checkInterval);
}

/**
 * Express route handler for monitoring dashboard
 */
function getMonitoringDashboard(req, res) {
  res.json(getMonitoringStatus());
}

module.exports = {
  startMonitoring,
  getMonitoringStatus,
  getMonitoringDashboard,
  checkService,
  checkSMTP,
  checkMongoDB,
  runMonitoringCycle,
  SERVICES,
  monitoringData,
};