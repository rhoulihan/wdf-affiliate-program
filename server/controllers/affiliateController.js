// Affiliate Controller for Laundromat Affiliate Program

const Affiliate = require('../models/Affiliate');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const encryptionUtil = require('../utils/encryption');
const emailService = require('../utils/emailService');
const { validationResult } = require('express-validator');
const { escapeRegex } = require('../utils/securityUtils');

// Utility modules for consistent error handling and responses
const ControllerHelpers = require('../utils/controllerHelpers');
const AuthorizationHelpers = require('../middleware/authorizationHelpers');
const Formatters = require('../utils/formatters');
const logger = require('../utils/logger');
const inviteService = require('../modules/onboarding/inviteService');
const { InviteError } = inviteService;
const { OPEN_STATUSES } = require('../modules/orders/orderStateMachine');
const { logAuditEvent, AuditEvents } = require('../utils/auditLogger');
const SystemConfig = require('../models/SystemConfig');
const roleCodes = require('../utils/roleCodes');
const { effectiveDeliveryFee } = require('../utils/deliveryFee');

/**
 * Register a new affiliate — INVITE-BOUND (spec §6.2).
 *
 * Contract:
 *  - `inviteToken` is required; it must resolve to a pending, unexpired invite.
 *  - The account email is ALWAYS `invite.email`; any client-sent email is ignored.
 *  - After the affiliate saves, the invite is consumed atomically (single-use).
 *    Losing that race deletes the just-created affiliate and returns 409.
 *  - JSON-only in this PR; the multipart W-9 field arrives in PR 10.
 */
exports.registerAffiliate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.info('[Registration] Validation errors:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      inviteToken,
      firstName,
      lastName,
      phone,
      businessName,
      address,
      city,
      state,
      zipCode,
      deliveryFee,
      username,
      password,
      paymentMethod,
      paypalEmail,
      venmoHandle,
      languagePreference
    } = req.body;

    // Invite gate — also the source of truth for the email (client email ignored).
    let invite;
    try {
      invite = await inviteService.validateInvite(inviteToken);
    } catch (inviteError) {
      if (inviteError instanceof InviteError) {
        return res.status(inviteError.statusCode).json({
          success: false,
          message: 'This invitation is no longer valid.',
          reason: inviteError.code === 'expired' ? 'expired' : 'invalid'
        });
      }
      throw inviteError;
    }
    const email = invite.email;

    // Check if email or username already exists (email keyed on the invite email)
    const existingEmail = await Affiliate.findOne({ email });
    const existingUsername = await Affiliate.findOne({ username });

    if (existingEmail && existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Both email and username are already in use',
        errors: {
          email: 'Email already registered',
          username: 'Username already taken'
        }
      });
    } else if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
        field: 'email'
      });
    } else if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken',
        field: 'username'
      });
    }

    // Hash password
    const { salt, hash } = encryptionUtil.hashPassword(password);

    // Create new affiliate (email from the invite — never from the client)
    const newAffiliate = new Affiliate({
      firstName,
      lastName,
      email,
      phone,
      businessName,
      address,
      city,
      state,
      zipCode,
      deliveryFee: parseFloat(deliveryFee) || 0,
      username,
      passwordSalt: salt,
      passwordHash: hash,
      paymentMethod,
      languagePreference: languagePreference || 'en'
    });

    // Add payment information if provided
    if (paymentMethod === 'paypal' && paypalEmail) {
      newAffiliate.paypalEmail = paypalEmail;
      // The encryption middleware will handle this automatically
    } else if (paymentMethod === 'venmo' && venmoHandle) {
      newAffiliate.venmoHandle = venmoHandle;
      // The encryption middleware will handle this automatically
    }

    // PR 9: provision the vendor delivery code at invited registration (§4.6).
    const deliveryCodeLength = await SystemConfig.getValue('affiliate_delivery_code_length', 6);
    const deliveryCode = roleCodes.generateNumericCode(deliveryCodeLength); // 6-digit partner staff code
    newAffiliate.affiliateDeliveryCodeHash = roleCodes.hashCode(deliveryCode);
    newAffiliate.affiliateDeliveryCodeSetAt = new Date();

    await newAffiliate.save();

    // Atomic single-use consume. A null result means another registration
    // already used this invite — roll back the affiliate we just created.
    const consumed = await inviteService.consumeInvite(inviteToken, newAffiliate.affiliateId);
    if (!consumed) {
      await Affiliate.deleteOne({ _id: newAffiliate._id });
      return res.status(409).json({
        success: false,
        message: 'This invitation has already been used.',
        reason: 'already_used'
      });
    }

    logAuditEvent(AuditEvents.INVITE_CONSUMED, {
      inviteId: consumed.inviteId,
      affiliateId: newAffiliate.affiliateId,
      email
    }, req);

    // Send welcome email fire-and-forget — never block (or hang) the
    // registration response on SMTP latency/availability. A slow or stalled
    // mail server must not freeze the client's "Processing…" spinner.
    Promise.resolve()
      .then(() => emailService.sendAffiliateWelcomeEmail(newAffiliate))
      .catch((emailError) => {
        logger.warn('Welcome email could not be sent:', emailError);
      });

    res.status(201).json({
      success: true,
      affiliateId: newAffiliate.affiliateId,
      deliveryCode, // shown exactly once
      message: 'Affiliate registered successfully!'
    });
  } catch (error) {
    logger.error('Affiliate registration error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
};

/**
 * Get affiliate profile
 */
exports.getAffiliateProfile = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { affiliateId } = req.params;

  // Verify affiliate exists
  const affiliate = await Affiliate.findOne({ affiliateId });

  if (!affiliate) {
    return ControllerHelpers.sendError(res, 'Affiliate not found', 404);
  }

  // Check authorization using AuthorizationHelpers
  if (!AuthorizationHelpers.canAccessAffiliate(req.user, affiliateId)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }

  // Prepare response data with formatting
  const responseData = {
    affiliateId: affiliate.affiliateId,
    firstName: affiliate.firstName,
    lastName: affiliate.lastName,
    name: Formatters.fullName(affiliate.firstName, affiliate.lastName),
    email: affiliate.email,
    phone: Formatters.phone(affiliate.phone),
    businessName: affiliate.businessName,
    address: Formatters.address({
      address: affiliate.address,
      city: affiliate.city,
      state: affiliate.state,
      zipCode: affiliate.zipCode
    }),
    city: affiliate.city,
    state: affiliate.state,
    zipCode: affiliate.zipCode,
    // Flat per-affiliate delivery fee (raw number) — the partner's commission per
    // order; single source of truth (the V1 min/per-bag pair was removed).
    deliveryFee: affiliate.deliveryFee || 0,
    paymentMethod: affiliate.paymentMethod,
    isActive: affiliate.isActive,
    dateRegistered: Formatters.datetime(affiliate.dateRegistered),
    lastLogin: Formatters.datetime(affiliate.lastLogin)
  };

  // Include payment info if available (decrypt if necessary)
  if (affiliate.paymentMethod === 'paypal' && affiliate.paypalEmail) {
    try {
      // Decrypt PayPal email if it's encrypted
      responseData.paypalEmail = typeof affiliate.paypalEmail === 'object'
        ? encryptionUtil.decrypt(affiliate.paypalEmail)
        : affiliate.paypalEmail;
    } catch (error) {
      logger.error('Error decrypting PayPal email:', error);
      // Don't include if decryption fails
    }
  }

  ControllerHelpers.sendSuccess(res, { affiliate: responseData }, 'Affiliate profile retrieved successfully');
});

/**
 * Update affiliate profile
 */
exports.updateAffiliateProfile = async (req, res) => {
  try {
    const { affiliateId } = req.params;
    const updates = req.body;

    // Check authorization (admin or self)
    if (req.user.role !== 'admin' && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Verify affiliate exists
    const affiliate = await Affiliate.findOne({ affiliateId });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // Fields that can be updated
    const updatableFields = [
      'firstName', 'lastName', 'phone', 'businessName',
      'address', 'city', 'state', 'zipCode',
      'deliveryFee', 'paymentMethod'
    ];

    // Update fields
    updatableFields.forEach(field => {
      if (updates[field] !== undefined) {
        affiliate[field] = updates[field];
      }
    });

    // Special handling for payment info
    if (updates.paymentMethod) {
      affiliate.paymentMethod = updates.paymentMethod;

      if (updates.paymentMethod === 'paypal') {
        if (updates.paypalEmail) {
          affiliate.paypalEmail = updates.paypalEmail;
        }
      } else if (updates.paymentMethod === 'venmo') {
        if (updates.venmoHandle) {
          affiliate.venmoHandle = updates.venmoHandle;
        }
      }
    }

    // Handle password change if provided
    if (updates.currentPassword && updates.newPassword) {
      // Verify current password
      const isPasswordValid = encryptionUtil.verifyPassword(
        updates.currentPassword,
        affiliate.passwordSalt,
        affiliate.passwordHash
      );

      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Update password
      const { salt, hash } = encryptionUtil.hashPassword(updates.newPassword);
      affiliate.passwordSalt = salt;
      affiliate.passwordHash = hash;
    }

    await affiliate.save();

    res.status(200).json({
      success: true,
      message: 'Affiliate profile updated successfully'
    });
  } catch (error) {
    logger.error('Update affiliate profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating affiliate profile'
    });
  }
};

/**
 * Get affiliate earnings
 */
exports.getAffiliateEarnings = async (req, res) => {
  try {
    const { affiliateId } = req.params;
    const { period } = req.query;

    // Check authorization (admin or self)
    if (req.user.role !== 'admin' && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Verify affiliate exists
    const affiliate = await Affiliate.findOne({ affiliateId });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // Determine date range based on period
    let startDate = new Date();
    const endDate = new Date();

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      // Default to all-time
      startDate = new Date(0);
    }

    // Find all completed orders for this affiliate within the date range.
    // Money/weight/commission moved to Cents (external) in Phase 1; this
    // endpoint now returns order counts only.
    const orders = await Order.find({
      affiliateId,
      status: 'complete',
      completedAt: { $gte: startDate, $lte: endDate }
    }).sort({ completedAt: -1 });

    // Get customer details for each order
    const customerIds = [...new Set(orders.map(order => order.customerId))];
    const customers = await Customer.find({ customerId: { $in: customerIds } });

    // Map customers to a dictionary for quick lookup
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer.customerId] = customer;
    });

    // Commission = the partner's own delivery fee snapshot per order (frozen at
    // send-out). Order totals (revenue) are admin-only — not returned here.
    const totalEarnings = orders.reduce((sum, o) => sum + (o.deliveryFeeCharged || 0), 0);

    res.status(200).json({
      success: true,
      totalEarnings, // commission = partner delivery fees
      pendingAmount: 0,
      orderCount: orders.length,
      orders: orders.map(order => {
        const customer = customerMap[order.customerId];
        return {
          orderId: order.orderId,
          customerId: order.customerId,
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer',
          commission: order.deliveryFeeCharged || 0,
          completedAt: order.completedAt
        };
      })
    });
  } catch (error) {
    logger.error('Affiliate earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving earnings information'
    });
  }
};

/**
 * Get affiliate customers
 */
exports.getAffiliateCustomers = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { affiliateId } = req.params;
  const { search, sort, customerId } = req.query;
  
  // Parse pagination parameters
  const pagination = ControllerHelpers.parsePagination(req.query);

  // Check authorization using AuthorizationHelpers
  if (!AuthorizationHelpers.canAccessAffiliate(req.user, affiliateId)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }

  // Build query
  const query = { affiliateId };

  // Add customer ID filter if provided (for dashboard customer highlighting)
  if (customerId) {
    query.customerId = customerId;
  }

  // Add search if provided
  if (search) {
    const escapedSearch = escapeRegex(search);
    query.$or = [
      { firstName: { $regex: escapedSearch, $options: 'i' } },
      { lastName: { $regex: escapedSearch, $options: 'i' } },
      { email: { $regex: escapedSearch, $options: 'i' } },
      { phone: { $regex: escapedSearch, $options: 'i' } },
      { customerId: { $regex: escapedSearch, $options: 'i' } }
    ];
  }

  // Build sort options
  const sortOptionsMap = {
    'name_asc': { firstName: 1, lastName: 1 },
    'name_desc': { firstName: -1, lastName: -1 },
    'recent': { registrationDate: -1 },
    default: { registrationDate: -1 }
  };

  const sortOptions = sortOptionsMap[sort] || sortOptionsMap.default;

  // Get total count for pagination
  const totalCustomers = await Customer.countDocuments(query);

  // Get paginated customers
  const customers = await Customer.find(query)
    .sort(sortOptions)
    .skip(pagination.skip)
    .limit(pagination.limit);

  // Get order counts for each customer
  const customerIds = customers.map(customer => customer.customerId);

  const orderCounts = await Order.aggregate([
    { $match: { customerId: { $in: customerIds } } },
    { $group: { _id: '$customerId', count: { $sum: 1 } } }
  ]);

  // Map order counts to customer objects
  const orderCountMap = {};
  orderCounts.forEach(item => {
    orderCountMap[item._id] = item.count;
  });

  // Prepare response data with formatting
  const customersData = customers.map(customer => ({
    customerId: customer.customerId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: Formatters.fullName(customer.firstName, customer.lastName),
    email: customer.email,
    phone: Formatters.phone(customer.phone),
    address: customer.address,
    city: customer.city,
    state: customer.state,
    zipCode: customer.zipCode,
    fullAddress: Formatters.address(customer),
    registrationDate: Formatters.datetime(customer.registrationDate),
    lastLogin: Formatters.datetime(customer.lastLogin),
    serviceFrequency: customer.serviceFrequency,
    orderCount: orderCountMap[customer.customerId] || 0
  }));

  const paginationMeta = ControllerHelpers.calculatePagination(totalCustomers, pagination.page, pagination.limit);

  ControllerHelpers.sendPaginated(res, customersData, paginationMeta, 'customers');
});

/**
 * Get affiliate orders
 */
exports.getAffiliateOrders = async (req, res) => {
  try {
    const { affiliateId } = req.params;
    const {
      status,
      date,
      search,
      page = 1,
      limit = 10
    } = req.query;

    // Check authorization (admin or self)
    if (req.user.role !== 'admin' && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Build query
    const query = { affiliateId };

    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add date filter if provided
    if (date) {
      const now = new Date();
      let startDate, endDate;

      switch (date) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'tomorrow':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        startDate.setDate(startDate.getDate() + 1);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'month':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      }

      if (startDate && endDate) {
        // Slim order (PR 3): pickupDate is gone — orders are filtered by their
        // intake/creation time instead.
        query.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    // Add search if provided
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { orderId: { $regex: escapedSearch, $options: 'i' } },
        { customerId: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);

    // Get paginated orders
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Get customer details for each order
    const customerIds = [...new Set(orders.map(order => order.customerId))];
    const customers = await Customer.find({ customerId: { $in: customerIds } });

    // Map customers to a dictionary for quick lookup
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer.customerId] = customer;
    });

    // Prepare response data
    const ordersData = orders.map(order => {
      const customer = customerMap[order.customerId];

      // Slim order (PR 3): state record only — status + scan timestamps +
      // createdAt. Money/weight/pickup-scheduling fields were removed.
      return {
        orderId: order.orderId,
        customerId: order.customerId,
        customer: customer ? {
          name: `${customer.firstName} ${customer.lastName}`,
          phone: customer.phone,
          address: `${customer.address}, ${customer.city}, ${customer.state} ${customer.zipCode}`
        } : null,
        bagId: order.bagId,
        status: order.status,
        pickup: order.pickup,
        processing: order.processing,
        storePickup: order.storePickup,
        delivery: order.delivery,
        completedAt: order.completedAt,
        cancelledAt: order.cancelledAt,
        createdAt: order.createdAt
      };
    });

    res.status(200).json({
      success: true,
      orders: ordersData,
      totalItems: totalOrders,
      totalEarnings: 0,
      pagination: {
        total: totalOrders,
        page,
        limit,
        pages: Math.ceil(totalOrders / limit)
      }
    });
  } catch (error) {
    logger.error('Get affiliate orders error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving orders'
    });
  }
};

/**
 * Get affiliate transactions
 */
exports.getAffiliateTransactions = async (req, res) => {
  try {
    const { affiliateId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check authorization (admin or self)
    if (req.user.role !== 'admin' && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Build query
    const query = { affiliateId };

    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(query);

    // Get paginated transactions
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Calculate summary
    const allTransactions = await Transaction.find({ affiliateId });
    const summary = {
      totalEarnings: 0,
      totalPayouts: 0,
      pendingAmount: 0
    };

    allTransactions.forEach(transaction => {
      if (transaction.type === 'commission') {
        summary.totalEarnings += transaction.amount;
        if (transaction.status === 'pending') {
          summary.pendingAmount += transaction.amount;
        }
      } else if (transaction.type === 'payout' && transaction.status === 'completed') {
        summary.totalPayouts += Math.abs(transaction.amount);
      }
    });

    res.status(200).json({
      success: true,
      transactions,
      summary: {
        totalEarnings: parseFloat(summary.totalEarnings.toFixed(2)),
        totalPayouts: parseFloat(summary.totalPayouts.toFixed(2)),
        pendingAmount: parseFloat(summary.pendingAmount.toFixed(2))
      },
      pagination: {
        total: totalTransactions,
        page,
        limit,
        pages: Math.ceil(totalTransactions / limit)
      }
    });
  } catch (error) {
    logger.error('Get affiliate transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving transactions'
    });
  }
};

/**
 * Get affiliate dashboard stats
 */
/**
 * Year-to-date stats for an affiliate.
 * Counts completed orders since Jan 1 of the current year. Money/commission
 * moved to Cents (external) in Phase 1, so revenue/earnings report 0.
 * Used by the dashboard YTD card.
 */
exports.getAffiliateYtdStats = async (req, res) => {
  try {
    const { affiliateId } = req.params;

    if (!AuthorizationHelpers.isAdmin(req.user) && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    // completedAt is the ground truth for YTD. Commission = Σ the partner's own
    // delivery fee snapshot (frozen at send-out). Order totals (revenue) are
    // admin-only — the partner sees commission only.
    const match = { affiliateId, status: 'complete', completedAt: { $gte: yearStart } };
    const orderCount = await Order.countDocuments(match);
    const agg = await Order.aggregate([
      { $match: match },
      { $group: { _id: null, commission: { $sum: '$deliveryFeeCharged' } } }
    ]);
    const totalEarnings = agg.length ? (agg[0].commission || 0) : 0;

    res.status(200).json({
      success: true,
      totalEarnings, // commission = partner delivery fees
      orderCount,
      yearStart,
      asOf: new Date()
    });
  } catch (error) {
    logger.error('Get affiliate YTD stats error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving year-to-date statistics'
    });
  }
};

exports.getAffiliateDashboardStats = async (req, res) => {
  try {
    const { affiliateId } = req.params;

    // Check authorization (admin or self)
    if (req.user.role !== 'admin' && req.user.affiliateId !== affiliateId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get customer count
    const customerCount = await Customer.countDocuments({ affiliateId });

    // Get active orders count (open set in the new status machine)
    const activeOrderCount = await Order.countDocuments({
      affiliateId,
      status: { $in: OPEN_STATUSES }
    });

    // Money/commission moved to Cents (external) in Phase 1. Earnings fields
    // are kept in the response shape but report 0; counts remain accurate.
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfWeek = new Date(now);
    firstDayOfWeek.setDate(now.getDate() - now.getDay());
    firstDayOfWeek.setHours(0, 0, 0, 0);

    const monthMatch = { affiliateId, status: 'complete', completedAt: { $gte: firstDayOfMonth } };
    const weekMatch = { affiliateId, status: 'complete', completedAt: { $gte: firstDayOfWeek } };
    const monthlyOrders = await Order.countDocuments(monthMatch);
    const weeklyOrders = await Order.countDocuments(weekMatch);

    // Commission = Σ the partner's own delivery fee snapshot (frozen at send-out).
    // The partner sees commission only; order totals (revenue) are admin-only.
    const sumCommission = async (match) => {
      const agg = await Order.aggregate([
        { $match: match },
        { $group: { _id: null, commission: { $sum: '$deliveryFeeCharged' } } }
      ]);
      return agg.length ? (agg[0].commission || 0) : 0;
    };
    const monthEarnings = await sumCommission(monthMatch);
    const weekEarnings = await sumCommission(weekMatch);

    // Calculate next payout date (typically weekly on Fridays)
    const nextPayoutDate = new Date();
    nextPayoutDate.setDate(nextPayoutDate.getDate() + ((5 - nextPayoutDate.getDay() + 7) % 7));

    res.status(200).json({
      success: true,
      stats: {
        customerCount,
        activeOrderCount,
        totalEarnings: monthEarnings, // dashboard headline = this month's commission
        monthEarnings,
        weekEarnings,
        pendingEarnings: 0,
        monthlyOrders,
        weeklyOrders,
        nextPayoutDate
      }
    });
  } catch (error) {
    logger.error('Get affiliate dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving dashboard statistics'
    });
  }
};


/**
 * Delete all data for an affiliate (development/test only)
 */
exports.deleteAffiliateData = async (req, res) => {
  try {
    // Only allow if feature is enabled
    if (process.env.ENABLE_DELETE_DATA_FEATURE !== 'true') {
      return res.status(403).json({
        success: false,
        message: 'This operation is not allowed'
      });
    }

    const { affiliateId } = req.params;
    const loggedInAffiliateId = req.user.affiliateId;

    // Verify the logged-in user is deleting their own data
    if (affiliateId !== loggedInAffiliateId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own data'
      });
    }

    // Verify the affiliate exists
    const affiliate = await Affiliate.findOne({ affiliateId });
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // Find all customers associated with this affiliate
    const customers = await Customer.find({ affiliateId });
    const customerIds = customers.map(c => c.customerId);
    const customerObjectIds = customers.map(c => c._id);

    // Delete all related data
    // 1. Delete all orders for these customers
    await Order.deleteMany({
      $or: [
        { affiliateId },
        { customerId: { $in: customerIds } }
      ]
    });

    // 2. Delete all transactions for this affiliate
    await Transaction.deleteMany({ affiliateId });

    // 3. Delete all customers
    await Customer.deleteMany({ affiliateId });

    // 4. Delete the affiliate
    await Affiliate.deleteOne({ affiliateId });

    res.status(200).json({
      success: true,
      message: 'All data has been deleted successfully',
      deletedData: {
        affiliate: 1,
        customers: customers.length,
        orders: 'All related orders deleted',
        transactions: 'All transactions deleted'
      }
    });
  } catch (error) {
    logger.error('Delete affiliate data error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting data'
    });
  }
};

/**
 * Get public affiliate information by affiliate code
 * No authentication required - for customer landing pages
 */
exports.getPublicAffiliateInfo = async (req, res) => {
  try {
    const { affiliateCode } = req.params;

    // Find affiliate by code
    const affiliate = await Affiliate.findOne({ affiliateId: affiliateCode })
      .select('firstName lastName businessName deliveryFee city state');

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // Return public information only — the effective fee (partner's own, else the
    // Laundromat Associates default) is what the customer is shown.
    res.status(200).json({
      success: true,
      firstName: affiliate.firstName,
      lastName: affiliate.lastName,
      businessName: affiliate.businessName,
      deliveryFee: await effectiveDeliveryFee(affiliate),
      city: affiliate.city,
      state: affiliate.state
    });
  } catch (error) {
    logger.error('Get public affiliate info error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving affiliate information'
    });
  }
};

// Get public affiliate info by ID (for customer success page)
exports.getPublicAffiliateInfoById = async (req, res) => {
  try {
    const { affiliateId } = req.params;

    // Find affiliate by ID
    const affiliate = await Affiliate.findOne({ affiliateId: affiliateId })
      .select('firstName lastName businessName deliveryFee city state');

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // The effective delivery fee: the partner's own flat fee, else the
    // Laundromat Associates default (utils/deliveryFee.js).
    const deliveryFee = await effectiveDeliveryFee(affiliate);

    // Return public information formatted for the success page
    res.status(200).json({
      success: true,
      affiliate: {
        firstName: affiliate.firstName,
        lastName: affiliate.lastName,
        businessName: affiliate.businessName,
        deliveryFee: deliveryFee,
        // Display label from city/state for the customer success page — not a service-area field
        serviceArea: `${affiliate.city}, ${affiliate.state}`
      }
    });
  } catch (error) {
    logger.error('Get public affiliate info by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving affiliate information'
    });
  }
};

function canManageAffiliateCode(req, affiliateId) {
  if (req.user.role === 'administrator' || req.user.role === 'admin') return true;
  return req.user.role === 'affiliate' && req.user.affiliateId === affiliateId;
}

/**
 * GET /api/v1/affiliates/:affiliateId/delivery-code — status (self/admin).
 */
exports.getDeliveryCodeStatus = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { affiliateId } = req.params;
  if (!canManageAffiliateCode(req, affiliateId)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }
  const affiliate = await Affiliate.findOne({ affiliateId }).select('+affiliateDeliveryCodeHash');
  if (!affiliate) return ControllerHelpers.sendError(res, 'Affiliate not found', 404);
  ControllerHelpers.sendSuccess(res, {
    deliveryCodeSet: !!affiliate.affiliateDeliveryCodeHash,
    deliveryCodeSetAt: affiliate.affiliateDeliveryCodeSetAt || null
  }, 'Delivery code status');
});

/**
 * POST /api/v1/affiliates/:affiliateId/delivery-code/reset — regenerate
 * (self/admin, CSRF). Returns the new plaintext code exactly once.
 */
exports.resetDeliveryCode = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { affiliateId } = req.params;
  if (!canManageAffiliateCode(req, affiliateId)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }
  const affiliate = await Affiliate.findOne({ affiliateId });
  if (!affiliate) return ControllerHelpers.sendError(res, 'Affiliate not found', 404);

  const codeLength = await SystemConfig.getValue('affiliate_delivery_code_length', 6);
  const deliveryCode = roleCodes.generateNumericCode(codeLength); // 6-digit partner staff code
  affiliate.affiliateDeliveryCodeHash = roleCodes.hashCode(deliveryCode);
  affiliate.affiliateDeliveryCodeSetAt = new Date();
  await affiliate.save();

  logAuditEvent(AuditEvents.DELIVERY_CODE_RESET, { affiliateId, userId: req.user.id }, req);
  ControllerHelpers.sendSuccess(res, {
    deliveryCode,
    deliveryCodeSetAt: affiliate.affiliateDeliveryCodeSetAt
  }, 'Delivery code reset');
});

module.exports = exports;