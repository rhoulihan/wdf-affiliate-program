// Laundromat Affiliate Program
// API Controllers for handling all API endpoints

const Affiliate = require('../models/Affiliate');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const emailService = require('../utils/emailService');
const { escapeRegex } = require('../utils/securityUtils');

// Utility modules for consistent error handling and responses
const ControllerHelpers = require('../utils/controllerHelpers');
const AuthorizationHelpers = require('../middleware/authorizationHelpers');
const Formatters = require('../utils/formatters');
const logger = require('../utils/logger');
const { canTransition, applyTransition } = require('../modules/orders/orderStateMachine');
const orderTransitionService = require('../modules/orders/orderTransitionService');

// ============================================================================
// Order Controllers
// ============================================================================

/**
 * Get bags for an order (for label printing)
 */
/**
 * Get order details
 */
exports.getOrderDetails = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { orderId } = req.params;

  // Find order
  const order = await Order.findOne({ orderId });

  if (!order) {
    return ControllerHelpers.sendError(res, 'Order not found', 404);
  }

  // Check authorization using AuthorizationHelpers
  if (!AuthorizationHelpers.canAccessOrder(req.user, order)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }

  // Get customer details
  const customer = await Customer.findOne({ customerId: order.customerId });

  // Get affiliate details
  const affiliate = await Affiliate.findOne({ affiliateId: order.affiliateId });

  // Slim state record (Phase 1). All money/weight/pricing lives in Cents.
  const orderData = {
    orderId: order.orderId,
    customerId: order.customerId,
    customer: customer ? {
      name: Formatters.fullName(customer.firstName, customer.lastName),
      phone: Formatters.phone(customer.phone),
      email: customer.email,
      address: Formatters.address(customer)
    } : null,
    affiliateId: order.affiliateId,
    affiliate: affiliate ? {
      name: Formatters.fullName(affiliate.firstName, affiliate.lastName),
      phone: Formatters.phone(affiliate.phone),
      email: affiliate.email
    } : null,
    bagId: order.bagId,
    status: Formatters.status(order.status, 'order'),
    paymentConfirmedManually: order.paymentConfirmedManually,
    pickup: order.pickup,
    intake: order.intake,
    storePickup: order.storePickup,
    delivery: order.delivery,
    createdAt: Formatters.datetime(order.createdAt),
    completedAt: Formatters.datetime(order.completedAt),
    cancelledAt: Formatters.datetime(order.cancelledAt)
  };

  ControllerHelpers.sendSuccess(res, { order: orderData }, 'Order details retrieved successfully');
});

/**
 * Update order status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Find order by orderId or _id
    let order;
    if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ orderId });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization (admin, operator, or associated affiliate)
    const isAuthorized =
      req.user.role === 'admin' ||
      req.user.role === 'operator' ||
      (req.user.role === 'affiliate' && req.user.affiliateId === order.affiliateId);

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!canTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${order.status} to ${status}`
      });
    }

    const customer = await Customer.findOne({ customerId: order.customerId });

    const role = ['affiliate'].includes(req.user.role) ? 'affiliate' : 'operator';
    applyTransition(order, status, {
      by: String(req.user.id),
      role,
      paymentConfirmed: status === 'out_for_delivery' ? !!req.body.paymentConfirmed : undefined
    });
    // Revenue snapshot at send-out — the SAME helper the scan path uses, so the
    // REST and scan paths can't diverge (freezes deliveryFeeCharged + the
    // operator-entered orderTotal). Was previously skipped here.
    if (status === 'out_for_delivery') {
      await orderTransitionService.recordSendOutSnapshot(order, { orderTotal: req.body.orderTotal });
    }
    await order.save();

    // Status-update notice to the customer (no money framing). Only to a verified
    // email — the welcome email is the only mail an unverified address receives.
    if (customer && customer.emailVerified && ['in_progress', 'out_for_delivery', 'complete'].includes(status)) {
      try {
        await emailService.sendOrderStatusUpdateEmail(customer, order, status);
      } catch (emailError) {
        logger.error('Order status email failed (non-blocking):', emailError);
      }
    }

    res.status(200).json({
      success: true,
      orderId: order.orderId,
      status: order.status,
      message: 'Order status updated successfully!'
    });
  } catch (error) {
    // A bad operator-entered order total is a client error, not a server fault.
    if (error.isTransitionError) {
      return res.status(error.status || 400).json({ success: false, message: error.message });
    }
    logger.error('Order status update error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the order status'
    });
  }
};

/**
 * Cancel order
 */
exports.cancelOrder = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { orderId } = req.params;

  // Find order
  const order = await Order.findOne({ orderId });

  if (!order) {
    return ControllerHelpers.sendError(res, 'Order not found', 404);
  }

  // Cancellable only from an open status (shared TRANSITIONS map).
  if (!canTransition(order.status, 'cancelled')) {
    return ControllerHelpers.sendError(res,
      `Orders in ${order.status} status cannot be cancelled.`,
      400
    );
  }

  // Check authorization using AuthorizationHelpers
  if (!AuthorizationHelpers.canAccessOrder(req.user, order)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }

  const role = req.user.role === 'affiliate' ? 'affiliate' : 'operator';
  applyTransition(order, 'cancelled', { by: String(req.user.id), role });
  await order.save();

  // Find customer and affiliate for email notifications
  const customer = await Customer.findOne({ customerId: order.customerId });
  const affiliate = await Affiliate.findOne({ affiliateId: order.affiliateId });

  // Send cancellation emails (don't let email failures stop the cancellation)
  try {
    if (customer && customer.emailVerified) {
      await emailService.sendOrderCancellationEmail(customer, order);
    }

    if (affiliate) {
      await emailService.sendAffiliateOrderCancellationEmail(affiliate, order, customer);
    }
  } catch (emailError) {
    logger.error('Failed to send cancellation emails:', emailError);
    // Continue with success response even if emails fail
  }

  ControllerHelpers.sendSuccess(res, {
    orderId: order.orderId,
    status: Formatters.status(order.status, 'order'),
    cancelledAt: Formatters.datetime(order.cancelledAt)
  }, 'Order cancelled successfully');
});

/**
 * Export orders (CSV or JSON)
 */
exports.exportOrders = async (req, res) => {
  const orderExportService = require('../services/orderExportService');
  const { format = 'csv', startDate, endDate, affiliateId, status } = req.query;
  const filters = { startDate, endDate, affiliateId, status };

  try {
    const { orders, customerMap } = await orderExportService.collectExportData({
      format,
      filters,
      user: req.user
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=orders-export-${Date.now()}.csv`);
      return res.send(orderExportService.formatCsv({ orders, customerMap }));
    }
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=orders-export-${Date.now()}.json`);
      return res.json(orderExportService.formatJson({ orders, customerMap, filters }));
    }
  } catch (err) {
    if (err.isExportError) return res.status(err.status || 400).json({ success: false, message: err.message });
    logger.error('Export orders error:', err);
    res.status(500).json({ success: false, message: 'An error occurred while exporting orders' });
  }
};

/**
 * Search orders
 */
exports.searchOrders = ControllerHelpers.asyncWrapper(async (req, res) => {
  const { search, affiliateId, startDate, endDate, status } = req.query;

  // Parse pagination parameters
  const pagination = ControllerHelpers.parsePagination(req.query);

  // Build query filters
  const allowedFields = {
    'status': 'status',
    'affiliateId': 'affiliateId',
    'startDate': 'createdAt',
    'endDate': 'createdAt'
  };

  const query = ControllerHelpers.buildQuery({ status, affiliateId }, allowedFields);

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Check authorization and apply role-based filters
  if (req.user.role === 'affiliate') {
    query.affiliateId = req.user.affiliateId;
  } else if (!AuthorizationHelpers.isAdmin(req.user)) {
    return ControllerHelpers.sendError(res, 'Unauthorized', 403);
  }

  // Search filter - search in customer names
  if (search) {
    const escapedSearch = escapeRegex(search);
    const customers = await Customer.find({
      $or: [
        { firstName: { $regex: escapedSearch, $options: 'i' } },
        { lastName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } }
      ]
    }).select('customerId');

    const customerIds = customers.map(c => c.customerId);
    query.customerId = { $in: customerIds };
  }

  // Get total count for pagination
  const totalResults = await Order.countDocuments(query);

  // Get paginated results
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit);

  // Get customer data
  const customerIds = [...new Set(orders.map(order => order.customerId))];
  const customers = await Customer.find({ customerId: { $in: customerIds } });
  const customerMap = {};
  customers.forEach(customer => {
    customerMap[customer.customerId] = customer;
  });

  const ordersData = orders.map(order => {
    const customer = customerMap[order.customerId];
    return {
      orderId: order.orderId,
      customer: customer ? {
        customerId: customer.customerId,
        name: Formatters.fullName(customer.firstName, customer.lastName),
        email: customer.email
      } : null,
      affiliateId: order.affiliateId,
      bagId: order.bagId,
      status: Formatters.status(order.status, 'order'),
      createdAt: Formatters.datetime(order.createdAt)
    };
  });

  const paginationMeta = ControllerHelpers.calculatePagination(totalResults, pagination.page, pagination.limit);

  ControllerHelpers.sendPaginated(res, ordersData, paginationMeta, 'orders');
});

/**
 * Get order statistics
 */
exports.getOrderStatistics = async (req, res) => {
  try {
    const { affiliateId } = req.query;

    // Build query
    const query = {};

    // Affiliate filter
    if (affiliateId) {
      query.affiliateId = affiliateId;
    }

    // Check authorization
    if (req.user.role === 'affiliate') {
      // Affiliates can only view their own statistics
      query.affiliateId = req.user.affiliateId;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get all orders
    const orders = await Order.find(query);

    const totalOrders = orders.length;

    // Orders by status (4-state machine).
    const ordersByStatus = {
      pending: 0,
      in_progress: 0,
      out_for_delivery: 0,
      complete: 0,
      cancelled: 0
    };

    let completedCount = 0;
    orders.forEach(order => {
      if (Object.prototype.hasOwnProperty.call(ordersByStatus, order.status)) {
        ordersByStatus[order.status]++;
      }
      if (order.status === 'complete') completedCount++;
    });

    const statistics = {
      totalOrders,
      ordersByStatus,
      completedCount
    };

    res.status(200).json({
      success: true,
      statistics
    });
  } catch (error) {
    logger.error('Get order statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving statistics'
    });
  }
};

module.exports = exports;