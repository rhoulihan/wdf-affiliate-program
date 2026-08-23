// Order Routes for Laundromat Affiliate Program

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/orders/export
 * @desc    Export orders in various formats
 * @access  Private (affiliate or admin)
 */
router.get('/export', authenticate, orderController.exportOrders);

/**
 * @route   GET /api/orders/search
 * @desc    Search orders
 * @access  Private (affiliate or admin)
 */
router.get('/search', authenticate, orderController.searchOrders);

/**
 * @route   GET /api/orders/statistics
 * @desc    Get order statistics
 * @access  Private (affiliate or admin)
 */
router.get('/statistics', authenticate, orderController.getOrderStatistics);

/**
 * @route   GET /api/orders/:orderId
 * @desc    Get order details
 * @access  Private (involved customer, affiliate, or admin)
 */
router.get('/:orderId', authenticate, orderController.getOrderDetails);

/**
 * @route   GET /api/orders/:orderId/bags
 * @desc    Get bags for an order (for label printing)
 * @access  Private (operator, affiliate, or admin)
 */

/**
 * @route   PUT /api/orders/:orderId/status
 * @desc    Update order status
 * @access  Private (affiliate or admin)
 */
router.put('/:orderId/status', authenticate, orderController.updateOrderStatus);

/**
 * @route   POST /api/orders/:orderId/cancel
 * @desc    Cancel order
 * @access  Private (involved customer, affiliate, or admin)
 */
router.post('/:orderId/cancel', authenticate, orderController.cancelOrder);

module.exports = router;