/**
 * Authorization Helper Middleware
 * Provides reusable authorization checks and role-based access control
 * to reduce code duplication across controllers
 */

const Order = require('../models/Order');
const logger = require('../utils/logger');

class AuthorizationHelpers {
  /**
   * Check if user can access a specific customer's data
   * @param {Object} user - User object from JWT
   * @param {string} customerId - Customer ID to check access for
   * @param {string} customerAffiliateId - Customer's affiliate ID
   */
  static canAccessCustomer(user, customerId, customerAffiliateId) {
    return (
      user.role === 'admin' ||
      user.role === 'administrator' ||
      user.customerId === customerId ||
      (user.role === 'affiliate' && user.affiliateId === customerAffiliateId) ||
      (user.role === 'operator' && user.affiliateId === customerAffiliateId)
    );
  }

  /**
   * Check if user can access a specific affiliate's data
   * @param {Object} user - User object from JWT
   * @param {string} affiliateId - Affiliate ID to check access for
   */
  static canAccessAffiliate(user, affiliateId) {
    return (
      user.role === 'admin' ||
      user.role === 'administrator' ||
      (user.role === 'affiliate' && user.affiliateId === affiliateId) ||
      (user.role === 'operator' && user.affiliateId === affiliateId)
    );
  }

  /**
   * Check if user can access a specific order
   * @param {Object} user - User object from JWT
   * @param {Object} order - Order object
   */
  static canAccessOrder(user, order) {
    return (
      user.role === 'admin' ||
      user.role === 'administrator' ||
      (user.customerId && user.customerId === order.customerId) ||
      (user.affiliateId && user.affiliateId === order.affiliateId) ||
      (user.role === 'operator' && user.affiliateId === order.affiliateId)
    );
  }

  /**
   * Middleware to require specific roles
   * @param {Array<string>} roles - Array of allowed roles
   */
  static requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  }

  /**
   * Middleware to require any of the specified roles
   * @param {Array<string>} roles - Array of allowed roles
   */
  static requireAnyRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!roles.some(role => req.user.role === role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  }

  /**
   * Middleware to check order access
   * Expects orderId in params
   */
  static async checkOrderAccess(req, res, next) {
    try {
      const orderId = req.params.orderId || req.params.id;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID required'
        });
      }

      // Admin and administrators have full access
      if (req.user.role === 'admin' || req.user.role === 'administrator') {
        return next();
      }

      const order = await Order.findOne({ orderId }).select('customerId affiliateId');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check access based on role
      let hasAccess = false;

      if (req.user.role === 'customer') {
        hasAccess = order.customerId === req.user.customerId;
      } else if (req.user.role === 'affiliate' || req.user.role === 'operator') {
        hasAccess = order.affiliateId === req.user.affiliateId;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access to order'
        });
      }

      req.order = order; // Attach for use in controller
      next();

    } catch (error) {
      logger.error('Order access check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  }

  /**
   * Middleware to check affiliate access
   * Expects affiliateId in params or body
   */
  static async checkAffiliateAccess(req, res, next) {
    try {
      const affiliateId = req.params.affiliateId || req.body.affiliateId || req.params.id;

      if (!affiliateId) {
        return res.status(400).json({
          success: false,
          message: 'Affiliate ID required'
        });
      }

      // Admin and administrators have full access
      if (req.user.role === 'admin' || req.user.role === 'administrator') {
        return next();
      }

      // Affiliates and operators can only access their own affiliate data
      if (req.user.role === 'affiliate' || req.user.role === 'operator') {
        if (req.user.affiliateId !== affiliateId) {
          return res.status(403).json({
            success: false,
            message: 'Unauthorized access to affiliate data'
          });
        }
        return next();
      }

      // Customers cannot access affiliate data directly
      if (req.user.role === 'customer') {
        return res.status(403).json({
          success: false,
          message: 'Customers cannot access affiliate data directly'
        });
      }

      // Default deny
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });

    } catch (error) {
      logger.error('Affiliate access check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  }

  /**
   * Check if user can perform administrative actions
   */
  static isAdmin(user) {
    return user.role === 'admin' || user.role === 'administrator';
  }

  /**
   * Check if user can perform operator actions
   */
  static isOperator(user) {
    return user.role === 'operator' || this.isAdmin(user);
  }

  /**
   * Check if user can perform affiliate actions
   */
  static isAffiliate(user) {
    return user.role === 'affiliate' || this.isOperator(user);
  }

  /**
   * Middleware to check if user owns the resource
   * Generic ownership check based on user ID
   */
  static checkOwnership(resourceIdField = 'id') {
    return (req, res, next) => {
      const resourceId = req.params[resourceIdField];
      const userId = req.user.id || req.user._id;

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID required'
        });
      }

      // Admins bypass ownership check
      if (this.isAdmin(req.user)) {
        return next();
      }

      // Check if user owns the resource
      if (resourceId !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access to resource'
        });
      }

      next();
    };
  }

  /**
   * Middleware to apply data filters based on user role
   * Modifies req.query to include appropriate filters
   */
  static applyRoleFilters(req, res, next) {
    // Admins see everything - no filters
    if (this.isAdmin(req.user)) {
      return next();
    }

    // Apply filters based on role
    switch (req.user.role) {
    case 'customer':
      req.query.customerId = req.user.customerId;
      break;

    case 'affiliate':
    case 'operator':
      req.query.affiliateId = req.user.affiliateId;
      break;

    default:
      // Unknown role - deny access
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    next();
  }

  /**
   * Check if user has specific permission
   * @param {Object} user - User object
   * @param {string} permission - Permission to check
   */
  static hasPermission(user, permission) {
    // Admin has all permissions
    if (this.isAdmin(user)) {
      return true;
    }

    // Check if user has specific permission in their permissions array
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }

    // Check role-based permissions
    const rolePermissions = {
      operator: ['scan_bags', 'update_orders', 'view_customers'],
      affiliate: ['view_customers', 'view_orders', 'view_reports'],
      customer: ['view_own_orders', 'update_own_profile']
    };

    const userPermissions = rolePermissions[user.role] || [];
    return userPermissions.includes(permission);
  }

  /**
   * Middleware to require specific permission
   * @param {string} permission - Required permission
   */
  static requirePermission(permission) {
    return (req, res, next) => {
      if (!this.hasPermission(req.user, permission)) {
        return res.status(403).json({
          success: false,
          message: `Permission '${permission}' required`
        });
      }
      next();
    };
  }
}

module.exports = AuthorizationHelpers;