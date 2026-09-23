// Field Filtering Utility for API Responses
// Prevents sensitive data exposure in API responses

/**
 * Filter object fields based on allowed field list
 * @param {Object} obj - Object to filter
 * @param {Array} allowedFields - Array of field names to include
 * @returns {Object} Filtered object
 */
const filterFields = (obj, allowedFields) => {
  if (!obj || typeof obj !== 'object') return obj;

  const filtered = {};
  allowedFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(obj, field)) {
      filtered[field] = obj[field];
    }
  });

  return filtered;
};

/**
 * Filter array of objects
 * @param {Array} arr - Array of objects to filter
 * @param {Array} allowedFields - Array of field names to include
 * @returns {Array} Array of filtered objects
 */
const filterArray = (arr, allowedFields) => {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => filterFields(item, allowedFields));
};

// Field definitions for different models
const fieldDefinitions = {
  // Affiliate fields visible to different roles
  affiliate: {
    public: ['affiliateId', 'firstName', 'lastName', 'businessName', 'deliveryFee', 'name'],
    self: ['affiliateId', 'firstName', 'lastName', 'email', 'phone', 'businessName',
      'deliveryFee', 'commissionRate', 'isActive', 'registrationDate', 'lastLogin'],
    admin: ['_id', 'affiliateId', 'firstName', 'lastName', 'email', 'phone',
      'businessName', 'address', 'city', 'state', 'zipCode', 'deliveryFee',
      'commissionRate', 'isActive', 'registrationDate', 'lastLogin',
      'totalEarnings', 'totalCustomers', 'totalOrders']
  },

  // Customer fields visible to different roles
  customer: {
    public: ['customerId', 'firstName', 'lastName'],
    self: ['customerId', 'firstName', 'lastName', 'email', 'phone', 'address',
      'city', 'state', 'zipCode', 'serviceFrequency',
      'specialInstructions', 'affiliateSpecialInstructions', 'lastFourDigits',
      'savePaymentInfo', 'isActive', 'registrationDate', 'lastLogin',
      'numberOfBags'],
    affiliate: ['customerId', 'firstName', 'lastName', 'email', 'phone', 'address',
      'city', 'state', 'zipCode', 'serviceFrequency', 'specialInstructions', 'affiliateSpecialInstructions', 'isActive', 'registrationDate',
      'numberOfBags'],
    admin: ['_id', 'customerId', 'affiliateId', 'firstName', 'lastName', 'email',
      'phone', 'address', 'city', 'state', 'zipCode', 'serviceFrequency',
      'specialInstructions', 'affiliateSpecialInstructions',
      'username', 'lastFourDigits', 'billingZip', 'savePaymentInfo', 'isActive',
      'registrationDate', 'lastLogin', 'numberOfBags']
  },

  // Order fields visible to different roles
  order: {
    customer: ['orderId', 'bagId', 'bagToken',
      'status', 'paymentConfirmedManually',
      'pickup', 'intake', 'storePickup', 'delivery',
      'completedAt', 'cancelledAt', 'createdAt'],
    affiliate: ['orderId', 'customerId', 'affiliateId', 'bagId', 'bagToken',
      'status', 'paymentConfirmedManually',
      'pickup', 'intake', 'storePickup', 'delivery',
      'completedAt', 'cancelledAt', 'createdAt'],
    admin: ['_id', 'orderId', 'customerId', 'affiliateId', 'bagId', 'bagToken',
      'status', 'paymentConfirmedManually',
      'pickup', 'intake', 'storePickup', 'delivery',
      'completedAt', 'cancelledAt', 'createdAt']
  },


  // Administrator fields visible to different roles
  administrator: {
    public: ['adminId', 'firstName', 'lastName'],
    self: ['adminId', 'firstName', 'lastName', 'email', 'permissions', 'isActive',
      'lastLogin', 'createdAt'],
    admin: ['_id', 'adminId', 'firstName', 'lastName', 'email', 'permissions',
      'isActive', 'lastLogin', 'createdAt', 'lockUntil', 'loginAttempts'],
    administrator: ['_id', 'adminId', 'firstName', 'lastName', 'email', 'permissions',
      'isActive', 'lastLogin', 'createdAt', 'role']
  },

  // Operator fields visible to different roles
  operator: {
    public: ['operatorId', 'firstName', 'lastName'],
    self: ['operatorId', 'firstName', 'lastName', 'email',
      'shiftStart', 'shiftEnd', 'isActive', 'currentOrderCount'],
    admin: ['_id', 'operatorId', 'firstName', 'lastName', 'email',
      'shiftStart', 'shiftEnd', 'isActive', 'currentOrderCount', 'totalOrdersProcessed',
      'averageProcessingTime', 'qualityScore', 'createdBy', 'createdAt'],
    administrator: ['_id', 'operatorId', 'firstName', 'lastName', 'email',
      'shiftStart', 'shiftEnd', 'isActive', 'currentOrderCount', 'totalOrdersProcessed',
      'averageProcessingTime', 'qualityScore', 'createdBy', 'createdAt', 'role']
  }
};

/**
 * Get filtered data based on user role and data type
 * @param {String} dataType - Type of data (affiliate, customer, order)
 * @param {Object|Array} data - Data to filter
 * @param {String} userRole - Role of the requesting user (admin, affiliate, customer, public)
 * @param {Object} context - Additional context (e.g., userId for self checks)
 * @returns {Object|Array} Filtered data
 */
const getFilteredData = (dataType, data, userRole, context = {}) => {
  if (!data || !fieldDefinitions[dataType]) return data;

  let fields;

  // Determine which fields to use based on role and context
  if (userRole === 'admin' || userRole === 'administrator') {
    fields = fieldDefinitions[dataType].administrator || fieldDefinitions[dataType].admin || fieldDefinitions[dataType].public;
  } else if (userRole === 'affiliate') {
    fields = fieldDefinitions[dataType].affiliate || fieldDefinitions[dataType].public;
  } else if (userRole === 'customer') {
    // Check if it's the customer's own data
    if (context.isSelf) {
      fields = fieldDefinitions[dataType].self || fieldDefinitions[dataType].customer || fieldDefinitions[dataType].public;
    } else {
      fields = fieldDefinitions[dataType].customer || fieldDefinitions[dataType].public;
    }
  } else if (userRole === 'operator') {
    // Check if it's the operator's own data
    if (context.isSelf) {
      fields = fieldDefinitions[dataType].self || fieldDefinitions[dataType].operator || fieldDefinitions[dataType].public;
    } else {
      fields = fieldDefinitions[dataType].operator || fieldDefinitions[dataType].public;
    }
  } else {
    fields = fieldDefinitions[dataType].public || [];
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return filterArray(data, fields);
  }

  // Handle single objects
  return filterFields(data, fields);
};

/**
 * Express middleware for automatic response filtering
 */
const responseFilter = (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;

  // Override the json method
  res.json = function(data) {
    // If the response has a specific data type marker, filter it
    if (data && data._filterType) {
      const filterType = data._filterType;
      delete data._filterType;

      // Get user role from request
      const userRole = req.user ? req.user.role : 'public';
      const userId = req.user ? (req.user.affiliateId || req.user.customerId || req.user.id) : null;

      // Filter the response data
      if (data.data) {
        data.data = getFilteredData(filterType, data.data, userRole, { userId });
      }
    }

    // Call the original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Simple field filter for backward compatibility
 * @param {Object} data - Data to filter
 * @param {String} role - User role
 * @returns {Object} Filtered data
 */
const fieldFilter = (data, role) => {
  if (!data || typeof data !== 'object') return data;

  // Try to determine data type from the object
  let dataType = null;
  if (data.adminId !== undefined && data.permissions !== undefined) {
    dataType = 'administrator';
  } else if (data.operatorId !== undefined && (data.shiftStart !== undefined || data.shiftEnd !== undefined || data.role === 'operator')) {
    dataType = 'operator';
  } else if (data.affiliateId !== undefined && data.businessName !== undefined) {
    dataType = 'affiliate';
  } else if (data.customerId !== undefined && data.serviceFrequency !== undefined) {
    dataType = 'customer';
  } else if (data.orderId !== undefined && data.pickupDate !== undefined) {
    dataType = 'order';
  }

  if (!dataType) return data;

  return getFilteredData(dataType, data, role);
};

module.exports = {
  filterFields,
  filterArray,
  getFilteredData,
  responseFilter,
  fieldDefinitions,
  fieldFilter
};