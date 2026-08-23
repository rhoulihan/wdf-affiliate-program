// Administrator Controller for Laundromat Affiliate Program
// Handles system configuration, operator management, and analytics

const Administrator = require('../models/Administrator');
const Operator = require('../models/Operator');
const Order = require('../models/Order');
const Affiliate = require('../models/Affiliate');
const Customer = require('../models/Customer');
const SystemConfig = require('../models/SystemConfig');
const Transaction = require('../models/Transaction');
const { fieldFilter } = require('../utils/fieldFilter');
const emailService = require('../utils/emailService');
const { logAuditEvent, AuditEvents } = require('../utils/auditLogger');
const { validatePasswordStrength } = require('../utils/passwordValidator');
const { validationResult } = require('express-validator');
const { escapeRegex } = require('../utils/securityUtils');
const crypto = require('crypto');
const mongoose = require('mongoose');
const encryptionUtil = require('../utils/encryption');
const logger = require('../utils/logger');

const systemConfigService = require('../services/systemConfigService');
const systemHealthService = require('../services/systemHealthService');
const adminDashboardService = require('../services/adminDashboardService');
const operatorAdminService = require('../services/operatorAdminService');
const administratorAccountService = require('../services/administratorAccountService');

// Administrator Management

/**
 * Get all administrators
 */
/**
 * Get all administrators
 */
exports.getAdministrators = async (req, res) => {
  try {
    const result = await administratorAccountService.listAdministrators(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error fetching administrators:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch administrators' });
  }
};

/**
 * Get administrator by ID
 */
exports.getAdministratorById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid administrator ID' });
    }
    const administrator = await administratorAccountService.getAdministratorById({
      id: req.params.id
    });
    res.json({ success: true, administrator });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error fetching administrator:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch administrator' });
  }
};

/**
 * Create new administrator
 */
exports.createAdministrator = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return res.status(400).json({
        success: false,
        message: errorMessages[0],
        errors: errors.array()
      });
    }
    const administrator = await administratorAccountService.createAdministrator({
      payload: req.body,
      adminId: req.user.id,
      req
    });
    res.status(201).json({
      success: true,
      message: 'Administrator created successfully',
      administrator
    });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    logger.error('Error creating administrator:', err);
    res.status(500).json({ success: false, message: 'Failed to create administrator' });
  }
};

/**
 * Update administrator
 */
exports.updateAdministrator = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid administrator ID' });
    }
    const administrator = await administratorAccountService.updateAdministrator({
      id: req.params.id,
      updates: req.body,
      adminId: req.user.id,
      req
    });
    res.json({
      success: true,
      message: 'Administrator updated successfully',
      administrator
    });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error updating administrator:', err);
    res.status(500).json({ success: false, message: 'Failed to update administrator' });
  }
};

/**
 * Delete administrator
 */
exports.deleteAdministrator = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid administrator ID' });
    }
    await administratorAccountService.deleteAdministrator({
      id: req.params.id,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Administrator deleted successfully' });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error deleting administrator:', err);
    res.status(500).json({ success: false, message: 'Failed to delete administrator' });
  }
};

/**
 * Reset administrator password
 */
exports.resetAdministratorPassword = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid administrator ID' });
    }
    await administratorAccountService.resetAdministratorPassword({
      id: req.params.id,
      newPassword: req.body.newPassword,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        ...err.extras
      });
    }
    logger.error('Error resetting administrator password:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reset administrator password'
    });
  }
};

/**
 * Change administrator password (for logged-in admin)
 */
exports.changeAdministratorPassword = async (req, res) => {
  try {
    await administratorAccountService.changeAdministratorPassword({
      administratorId: req.user.id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
      req
    });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    if (err.isAdministratorAccountError) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        ...err.extras
      });
    }
    logger.error('Error changing administrator password:', err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

/**
 * Get available permissions
 */
exports.getPermissions = async (req, res) => {
  try {
    const permissions = administratorAccountService.getPermissions();
    res.json({ success: true, permissions });
  } catch (error) {
    logger.error('Error fetching permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch permissions' });
  }
};


// Operator Management

/**
 * Create a new operator
 */
/**
 * Create a new operator
 */
exports.createOperator = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return res.status(400).json({
        success: false,
        message: errorMessages[0],
        errors: errors.array()
      });
    }

    const { scanCode, ...operator } = await operatorAdminService.createOperator({
      payload: req.body,
      adminId: req.user.id,
      req
    });
    res.status(201).json({
      success: true,
      message: 'Operator created successfully',
      operator,
      scanCode
    });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    logger.error('Error creating operator:', err);
    res.status(500).json({ success: false, message: 'Failed to create operator' });
  }
};

/**
 * Get all operators with pagination and filtering
 */
exports.getOperators = async (req, res) => {
  try {
    const result = await operatorAdminService.listOperators(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error fetching operators:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch operators' });
  }
};

/**
 * Get operator details by ID
 */
exports.getOperatorById = async (req, res) => {
  try {
    const result = await operatorAdminService.getOperatorById({
      operatorId: req.params.operatorId
    });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error fetching operator:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch operator details' });
  }
};

/**
 * Update operator details
 */
exports.updateOperator = async (req, res) => {
  try {
    const operator = await operatorAdminService.updateOperator({
      id: req.params.id,
      updates: req.body,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Operator updated successfully', operator });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error updating operator:', err);
    res.status(500).json({ success: false, message: 'Failed to update operator' });
  }
};

/**
 * Deactivate operator
 */
exports.deactivateOperator = async (req, res) => {
  try {
    await operatorAdminService.deactivateOperator({
      id: req.params.id,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Operator deactivated successfully' });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error deactivating operator:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate operator' });
  }
};

/**
 * Reset operator password
 */
exports.resetOperatorPassword = async (req, res) => {
  try {
    await operatorAdminService.resetOperatorPassword({
      id: req.params.id,
      adminId: req.user.id,
      req
    });
    res.json({
      success: true,
      message: 'Password reset successfully. New password sent to operator email.'
    });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error resetting operator password:', err);
    res.status(500).json({ success: false, message: 'Failed to reset operator password' });
  }
};


// Analytics & Reporting

/**
 * Get administrator dashboard data
 */
/**
 * Get administrator dashboard data
 */
exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await adminDashboardService.getDashboard();
    res.json({ success: true, dashboard });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};

/**
 * Get order processing analytics
 */
exports.getOrderAnalytics = async (req, res) => {
  try {
    const analytics = await adminDashboardService.getOrderAnalytics(req.query);
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('Error fetching order analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order analytics' });
  }
};

/**
 * Get operator performance analytics
 */
exports.getOperatorAnalytics = async (req, res) => {
  try {
    const analytics = await adminDashboardService.getOperatorAnalytics(req.query);
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('Error fetching operator analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch operator analytics' });
  }
};

/**
 * Get affiliate performance analytics
 */
exports.getAffiliateAnalytics = async (req, res) => {
  try {
    const analytics = await adminDashboardService.getAffiliateAnalytics(req.query);
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('Error fetching affiliate analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch affiliate analytics' });
  }
};

/**
 * Export analytics report
 */
exports.exportReport = async (req, res) => {
  try {
    const result = await adminDashboardService.exportReport({
      reportType: req.query.reportType,
      format: req.query.format,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      user: req.user,
      req
    });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.isReportError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error exporting report:', err);
    res.status(500).json({ success: false, message: 'Failed to export report' });
  }
};


/**
 * Get list of affiliates for dropdowns and filters
 */
exports.getAffiliatesList = async (req, res) => {
  try {
    const { search, status, limit = 100 } = req.query;
    const query = {};
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { businessName: { $regex: escapedSearch, $options: 'i' } },
        { firstName: { $regex: escapedSearch, $options: 'i' } },
        { lastName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { affiliateId: { $regex: escapedSearch, $options: 'i' } }
      ];
    }
    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    const affiliates = await Affiliate.find(query)
      .select('affiliateId firstName lastName businessName email isActive serviceArea ' +
              'affiliateType serviceType orderNotificationsEnabled pickupInstructions deliveryFee')
      .limit(parseInt(limit, 10))
      .sort('businessName');

    res.json({ success: true, affiliates });
  } catch (error) {
    logger.error('Error fetching affiliates list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch affiliates list',
      error: error.message
    });
  }
};

// System Configuration

/**
 * Get system configuration
 */
exports.getSystemConfig = async (req, res) => {
  try {
    const configurations = await systemConfigService.listConfigurations(req.query);
    res.json({ success: true, configurations });
  } catch (error) {
    logger.error('Error fetching system config:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system configuration' });
  }
};

/**
 * Update system configuration
 */
exports.updateSystemConfig = async (req, res) => {
  try {
    const configuration = await systemConfigService.updateConfiguration({
      key: req.body.key,
      value: req.body.value,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Configuration updated successfully', configuration });
  } catch (error) {
    logger.error('Error updating system config:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update system configuration'
    });
  }
};

/**
 * Get system health status
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const health = await systemConfigService.getSystemHealth();
    res.json({ success: true, health });
  } catch (error) {
    logger.error('Error checking system health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check system health',
      health: { status: 'unhealthy', error: error.message }
    });
  }
};

/**
 * @desc    Update operator performance statistics
 * @route   PATCH /api/v1/operators/:id/stats
 * @access  Private (Admin with operators.update permission)
 */
/**
 * Update operator performance statistics
 */
exports.updateOperatorStats = async (req, res) => {
  try {
    const operator = await operatorAdminService.updateOperatorStats({
      id: req.params.id,
      processingTime: req.body.processingTime,
      qualityScore: req.body.qualityScore,
      qualityPassed: req.body.qualityPassed,
      totalOrdersProcessed: req.body.totalOrdersProcessed
    });
    res.status(200).json({
      success: true,
      message: 'Operator statistics updated successfully',
      operator
    });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error updating operator stats:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating operator statistics'
    });
  }
};

/**
 * Get available operators for order assignment
 */
exports.getAvailableOperators = async (req, res) => {
  try {
    const operators = await operatorAdminService.getAvailableOperators(req.query);
    res.json({ success: true, operators });
  } catch (error) {
    logger.error('Error getting available operators:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching available operators'
    });
  }
};

/**
 * Delete operator (hard delete)
 */
exports.deleteOperator = async (req, res) => {
  try {
    await operatorAdminService.deleteOperator({ id: req.params.id, adminId: req.user.id });
    res.json({ success: true, message: 'Operator deleted successfully' });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error deleting operator:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the operator'
    });
  }
};

/**
 * Reset operator scan code (admin). Returns the new code exactly once.
 */
exports.resetOperatorScanCode = async (req, res) => {
  try {
    const result = await operatorAdminService.resetOperatorScanCode({
      id: req.params.operatorId,
      adminId: req.user.id,
      req
    });
    res.json({ success: true, message: 'Scan code reset successfully', ...result });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error resetting operator scan code:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting the scan code'
    });
  }
};

/**
 * Allow operators to update their own profile (limited fields)
 */
exports.updateOperatorSelf = async (req, res) => {
  try {
    const operator = await operatorAdminService.updateOperatorSelf({
      id: req.params.id,
      updates: req.body
    });
    res.json({ success: true, message: 'Profile updated successfully', operator });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error updating operator profile:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the profile'
    });
  }
};

/**
 * Allow operators to view their own profile
 */
exports.getOperatorSelf = async (req, res) => {
  try {
    const operator = await operatorAdminService.getOperatorSelf({ id: req.params.id });
    res.json({ success: true, operator });
  } catch (err) {
    if (err.isOperatorAdminError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error getting operator profile:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the profile'
    });
  }
};


/**
 * Get environment variables (sanitized for display)
/**
 * Get environment variables (sanitized for display)
 */
exports.getEnvironmentVariables = async (req, res) => {
  try {
    const result = await systemHealthService.getEnvironmentVariables({ user: req.user, req });
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error fetching environment variables:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch environment variables' });
  }
};

/**
 * Reset rate limits for specified criteria
 */
exports.resetRateLimits = async (req, res) => {
  try {
    const { deletedCount } = await systemHealthService.resetRateLimits({
      type: req.body.type,
      ip: req.body.ip,
      user: req.user,
      req
    });
    res.json({
      success: true,
      message: `Reset ${deletedCount} rate limit entries`,
      deletedCount
    });
  } catch (err) {
    if (err.isSystemHealthError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Error resetting rate limits:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reset rate limits',
      error: err.message
    });
  }
};
