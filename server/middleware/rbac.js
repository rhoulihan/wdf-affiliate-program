const logger = require('../utils/logger');
const adminIpGate = require('./adminIpGate');
// Role-Based Access Control Middleware for Laundromat Affiliate Program

/**
 * When the acting user is an administrator, the IP allowlist must hold — this is
 * the authorization-layer backstop so EVERY admin-authorized route (operators,
 * system config, etc., not just /administrators) and ANY admin token (incl. one
 * minted via /auth/refresh-token, or stolen) is rejected off-allowlist. Stealth
 * 404 to match the route-level gate. Only enforced when an allowlist is actually
 * configured: with none set, the fail-closed login gate already blocks minting an
 * admin token in prod, and test suites (which mint admin tokens directly from
 * loopback with no allowlist) keep working.
 * @returns {boolean} true if the request was blocked (response sent)
 */
function blockedByAdminIp(req, res) {
  const role = req.user && req.user.role;
  if (role !== 'administrator' && role !== 'admin') return false;
  if (!adminIpGate.isConfigured()) return false;
  if (adminIpGate.isAllowed(req)) return false;
  logger.warn('Admin request blocked by IP allowlist (authz layer)', {
    path: (req && req.originalUrl) || '', ip: adminIpGate.clientIp(req) || '(none)'
  });
  res.status(404);
  if (String((req && req.originalUrl) || '').startsWith('/api/')) {
    res.json({ success: false, message: 'Not found' });
  } else {
    res.type('html').send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>');
  }
  return true;
}

// Define role hierarchy
const roleHierarchy = {
  'admin': ['administrator', 'operator', 'affiliate', 'customer'], // Super admin can access everything
  'administrator': ['operator', 'affiliate', 'customer'], // Admin can manage operators and view affiliate/customer data
  'operator': [], // Operators have no subordinate roles
  'affiliate': ['customer'], // Affiliates can view their customers
  'customer': [] // Customers have no subordinate roles
};

// Define allowed roles for the system
const allowedRoles = ['admin', 'administrator', 'operator', 'affiliate', 'customer'];

/**
 * Check if a role has permission to access another role's resources
 * @param {string} userRole - The role of the current user
 * @param {string} targetRole - The role being accessed
 * @returns {boolean}
 */
const canAccessRole = (userRole, targetRole) => {
  if (userRole === targetRole) return true;
  return roleHierarchy[userRole]?.includes(targetRole) || false;
};

/**
 * Middleware to check if user has required role(s)
 * @param {string|string[]} requiredRoles - Required role(s)
 * @returns {Function} Express middleware
 */
exports.checkRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No role found'
      });
    }

    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    const userRole = req.user.role;

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Invalid role'
      });
    }

    // Check if user has one of the required roles
    const hasRequiredRole = roles.some(role => canAccessRole(userRole, role));

    if (!hasRequiredRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient privileges'
      });
    }

    // Administrators may only operate from an allowlisted IP.
    if (blockedByAdminIp(req, res)) return;

    next();
  };
};

/**
 * Middleware to check if user has all required roles (AND operation)
 * @param {string[]} requiredRoles - All required roles
 * @returns {Function} Express middleware
 */
exports.checkAllRoles = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: No role found'
      });
    }

    const userRole = req.user.role;

    // Check if user has access to all required roles
    const hasAllRoles = requiredRoles.every(role => canAccessRole(userRole, role));

    if (!hasAllRoles) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient privileges for all required roles'
      });
    }

    next();
  };
};

/**
 * Middleware to check if user owns the resource or has admin privileges
 * @param {string} resourceOwnerField - Field name containing the resource owner ID
 * @returns {Function} Express middleware
 */
exports.checkResourceOwnership = (resourceOwnerField) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Not authenticated'
      });
    }

    const userRole = req.user.role;

    // Admins and administrators can access any resource
    if (userRole === 'admin' || userRole === 'administrator') {
      return next();
    }

    // Get the resource owner ID from params or body
    const resourceOwnerId = req.params[resourceOwnerField] || req.body[resourceOwnerField];

    // Check ownership based on role
    let isOwner = false;
    switch (userRole) {
    case 'affiliate':
      isOwner = req.user.affiliateId === resourceOwnerId;
      break;
    case 'customer':
      isOwner = req.user.customerId === resourceOwnerId;
      break;
    case 'operator':
      isOwner = req.user.operatorId === resourceOwnerId;
      break;
    }

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not own this resource'
      });
    }

    next();
  };
};

/**
 * Middleware to check administrator permissions
 * @param {string|string[]} requiredPermissions - Required permission(s)
 * @returns {Function} Express middleware
 */
exports.checkAdminPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.user || req.user.role !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Administrator role required'
      });
    }

    // Administrators may only operate from an allowlisted IP (authz backstop).
    if (blockedByAdminIp(req, res)) return;

    try {
      const Administrator = require('../models/Administrator');
      const admin = await Administrator.findById(req.user.id);

      if (!admin || !admin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Administrator account not active'
        });
      }

      const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      const hasPermission = permissions.every(perm => admin.hasPermission(perm));

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied: ${permissions.join(', ')} permission required`
        });
      }

      // Add admin object to request for use in controllers
      req.admin = admin;
      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Middleware to check if operator is active and on shift
 * @returns {Function} Express middleware
 */
exports.checkOperatorStatus = () => {
  return async (req, res, next) => {
    if (!req.user || req.user.role !== 'operator') {
      return next(); // Skip check for non-operators
    }

    try {
      const Operator = require('../models/Operator');
      const operator = await Operator.findById(req.user.id);

      if (!operator || !operator.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Operator account not active'
        });
      }

      if (!operator.isOnShift) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Operator not on shift'
        });
      }

      // Add operator object to request for use in controllers
      req.operator = operator;
      next();
    } catch (error) {
      logger.error('Operator status check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking operator status'
      });
    }
  };
};

/**
 * Middleware to apply field filtering based on role
 * @param {Object} fieldPermissions - Object mapping roles to allowed fields
 * @returns {Function} Express middleware
 */
exports.filterResponseFields = (fieldPermissions) => {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function(data) {
      if (!req.user || !req.user.role) {
        return originalJson.call(this, data);
      }

      const userRole = req.user.role;
      const allowedFields = fieldPermissions[userRole] || fieldPermissions.default || [];

      // If no field restrictions, return original data
      if (allowedFields.length === 0 || allowedFields.includes('*')) {
        return originalJson.call(this, data);
      }

      // Filter the response data
      const filterObject = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
          return obj.map(item => filterObject(item));
        }

        const filtered = {};
        for (const field of allowedFields) {
          if (field.includes('.')) {
            // Handle nested fields
            const [parent, ...rest] = field.split('.');
            if (obj[parent] !== undefined) {
              if (!filtered[parent]) filtered[parent] = {};
              const nestedField = rest.join('.');
              const nestedValue = getNestedValue(obj[parent], nestedField);
              setNestedValue(filtered[parent], nestedField, nestedValue);
            }
          } else if (obj[field] !== undefined) {
            filtered[field] = obj[field];
          }
        }
        return filtered;
      };

      // Helper to get nested values
      const getNestedValue = (obj, path) => {
        return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
      };

      // Helper to set nested values
      const setNestedValue = (obj, path, value) => {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((curr, key) => {
          if (!curr[key]) curr[key] = {};
          return curr[key];
        }, obj);
        target[lastKey] = value;
      };

      // Apply filtering
      if (data && data.success !== undefined) {
        // Standard response format
        const filtered = { ...data };
        if (data.data) {
          filtered.data = filterObject(data.data);
        }
        return originalJson.call(this, filtered);
      } else {
        // Direct data response
        return originalJson.call(this, filterObject(data));
      }
    };

    next();
  };
};

// Export role hierarchy for use in other modules
exports.roleHierarchy = roleHierarchy;
exports.allowedRoles = allowedRoles;