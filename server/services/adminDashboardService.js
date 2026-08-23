// Admin dashboard + analytics service
//
// All the heavy aggregation pipelines the admin UI leans on: the dashboard
// overview (counts, status distributions, top operators/affiliates, recent
// activity), plus three drill-down analytics endpoints and the CSV/JSON
// export pipeline. Aggregations here are read-only; no audit logging
// required except on the report export (controller handles that).

const mongoose = require('mongoose');
const Administrator = require('../models/Administrator');
const Operator = require('../models/Operator');
const Order = require('../models/Order');
const Affiliate = require('../models/Affiliate');
const Customer = require('../models/Customer');
const { OPEN_STATUSES } = require('../modules/orders/orderStateMachine');
const { logAuditEvent, AuditEvents } = require('../utils/auditLogger');

const GROUP_BY_FORMAT = {
  day: '%Y-%m-%d',
  week: '%Y-W%V',
  month: '%Y-%m'
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function resolveDateRange({ startDate, endDate }) {
  return {
    start: startDate ? new Date(startDate) : new Date(Date.now() - THIRTY_DAYS_MS),
    end: endDate ? new Date(endDate) : new Date()
  };
}

async function getDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay());
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const orderStats = await Order.aggregate([
    {
      $facet: {
        today: [{ $match: { createdAt: { $gte: today } } }, { $count: 'count' }],
        thisWeek: [{ $match: { createdAt: { $gte: thisWeekStart } } }, { $count: 'count' }],
        thisMonth: [{ $match: { createdAt: { $gte: thisMonthStart } } }, { $count: 'count' }],
        statusDistribution: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
      }
    }
  ]);

  const operatorPerformance = await Operator.aggregate([
    { $match: { isActive: true } },
    { $lookup: { from: 'orders', localField: '_id', foreignField: 'assignedOperator', as: 'orders' } },
    {
      $project: {
        operatorId: 1,
        firstName: 1,
        lastName: 1,
        currentOrderCount: 1,
        totalOrdersProcessed: 1,
        averageProcessingTime: 1,
        qualityScore: 1,
        ordersToday: {
          $size: {
            $filter: {
              input: '$orders',
              cond: { $gte: ['$$this.createdAt', today] }
            }
          }
        }
      }
    },
    { $sort: { totalOrdersProcessed: -1 } },
    { $limit: 10 }
  ]);

  const affiliatePerformance = await Affiliate.aggregate([
    { $match: { isActive: true } },
    { $lookup: { from: 'orders', localField: 'affiliateId', foreignField: 'affiliateId', as: 'orders' } },
    { $lookup: { from: 'customers', localField: 'affiliateId', foreignField: 'affiliateId', as: 'customers' } },
    {
      $project: {
        affiliateId: 1,
        firstName: 1,
        lastName: 1,
        businessName: 1,
        customerCount: { $size: '$customers' },
        orderCount: { $size: '$orders' },
        monthlyOrders: {
          $size: {
            $filter: {
              input: '$orders',
              cond: { $gte: ['$$this.createdAt', thisMonthStart] }
            }
          }
        }
      }
    },
    { $sort: { monthlyOrders: -1 } },
    { $limit: 10 }
  ]);

  const systemHealth = {
    activeOperators: await Operator.countDocuments({ isActive: true }),
    onShiftOperators: await Operator.findOnShift().then(ops => ops.length),
    activeAffiliates: await Affiliate.countDocuments({ isActive: true }),
    totalCustomers: await Customer.countDocuments(),
    ordersInProgress: await Order.countDocuments({
      status: { $in: OPEN_STATUSES }
    }),
    completedOrders: await Order.countDocuments({ status: 'complete' }),
    // Orders stuck in progress for > 24h — surfaces queue backups.
    processingDelays: await Order.countDocuments({
      status: 'in_progress',
      createdAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
  };

  const recentOrders = await Order.find({}).sort({ updatedAt: -1 }).limit(10).lean();
  const affiliateIds = [...new Set(recentOrders.map(o => o.affiliateId).filter(Boolean))];

  let recentActivity = [];
  if (affiliateIds.length > 0) {
    const affiliates = await Affiliate.find({ affiliateId: { $in: affiliateIds } })
      .select('affiliateId firstName lastName businessName')
      .lean();
    const affiliateMap = new Map(affiliates.map(a => [a.affiliateId, a]));

    recentActivity = recentOrders.map(order => {
      const affiliate = affiliateMap.get(order.affiliateId);
      return {
        timestamp: order.updatedAt,
        type: 'Order',
        userName: affiliate ? `${affiliate.firstName} ${affiliate.lastName}` : 'Unknown',
        action: `Order ${order.orderId} - Status: ${order.status}`
      };
    });
  }

  return {
    orderStats: {
      today: orderStats[0].today[0]?.count || 0,
      thisWeek: orderStats[0].thisWeek[0]?.count || 0,
      thisMonth: orderStats[0].thisMonth[0]?.count || 0,
      statusDistribution: orderStats[0].statusDistribution
    },
    operatorPerformance,
    affiliatePerformance,
    systemHealth,
    recentActivity
  };
}

async function getOrderAnalytics({ startDate, endDate, groupBy = 'day' }) {
  const { start, end } = resolveDateRange({ startDate, endDate });
  const format = GROUP_BY_FORMAT[groupBy] || GROUP_BY_FORMAT.day;

  // Money/weight/processing-time moved to Cents (external) in Phase 1.
  // The timeline now reports order counts by status only.
  const timeline = await Order.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt' } },
        totalOrders: { $sum: 1 },
        completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'complete'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    timeline,
    summary: {
      totalOrders: timeline.reduce((sum, item) => sum + item.totalOrders, 0),
      completedOrders: timeline.reduce((sum, item) => sum + item.completedOrders, 0)
    }
  };
}

async function getOperatorAnalytics({ startDate, endDate }) {
  const { start, end } = resolveDateRange({ startDate, endDate });

  const operators = await Operator.aggregate([
    {
      $lookup: {
        from: 'orders',
        let: { operatorId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$assignedOperator', '$$operatorId'] },
                  { $gte: ['$createdAt', start] },
                  { $lte: ['$createdAt', end] }
                ]
              }
            }
          }
        ],
        as: 'periodOrders'
      }
    },
    {
      $project: {
        operatorId: 1,
        firstName: 1,
        lastName: 1,
        workStation: 1,
        isActive: 1,
        metrics: {
          totalOrders: { $size: '$periodOrders' },
          completedOrders: {
            $size: {
              $filter: {
                input: '$periodOrders',
                cond: { $eq: ['$$this.status', 'complete'] }
              }
            }
          }
        }
      }
    },
    {
      $addFields: {
        'metrics.completionRate': {
          $cond: [
            { $eq: ['$metrics.totalOrders', 0] },
            0,
            { $divide: ['$metrics.completedOrders', '$metrics.totalOrders'] }
          ]
        }
      }
    },
    { $sort: { 'metrics.totalOrders': -1 } }
  ]);

  const workstations = await Order.aggregate([
    {
      $match: {
        assignedOperator: { $exists: true },
        createdAt: { $gte: start, $lte: end }
      }
    },
    { $lookup: { from: 'operators', localField: 'assignedOperator', foreignField: '_id', as: 'operator' } },
    { $unwind: '$operator' },
    {
      $group: {
        _id: '$operator.workStation',
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  return { operators, workstations };
}

async function getAffiliateAnalytics({ startDate, endDate }) {
  const { start, end } = resolveDateRange({ startDate, endDate });

  const affiliates = await Affiliate.aggregate([
    {
      $lookup: {
        from: 'orders',
        let: { affiliateId: '$affiliateId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$affiliateId', '$$affiliateId'] },
                  { $gte: ['$createdAt', start] },
                  { $lte: ['$createdAt', end] }
                ]
              }
            }
          }
        ],
        as: 'periodOrders'
      }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'affiliateId',
        foreignField: 'affiliateId',
        as: 'customers'
      }
    },
    {
      $project: {
        affiliateId: 1,
        firstName: 1,
        lastName: 1,
        businessName: 1,
        affiliateType: 1,
        serviceType: 1,
        orderNotificationsEnabled: 1,
        pickupInstructions: 1,
        email: 1,
        metrics: {
          totalCustomers: { $size: '$customers' },
          activeCustomers: {
            $size: {
              $filter: { input: '$customers', cond: { $eq: ['$$this.isActive', true] } }
            }
          },
          totalOrders: { $size: '$periodOrders' },
          // Revenue = Σ operator-entered order totals (only set on sent-out orders).
          // Commission = Σ the partner's own delivery fee snapshot (0 for orders
          // that used the Laundromat Associates default — that stays house revenue).
          // Exclude CANCELLED orders: one cancelled after send-out keeps its
          // snapshot, which never settled — counting it would inflate the totals.
          totalRevenue: {
            $sum: { $map: {
              input: { $filter: { input: '$periodOrders', as: 'o', cond: { $ne: ['$$o.status', 'cancelled'] } } },
              as: 'o', in: '$$o.orderTotal'
            } }
          },
          totalCommission: {
            $sum: { $map: {
              input: { $filter: { input: '$periodOrders', as: 'o', cond: { $ne: ['$$o.status', 'cancelled'] } } },
              as: 'o', in: '$$o.deliveryFeeCharged'
            } }
          }
        }
      }
    },
    { $sort: { 'metrics.totalOrders': -1 } }
  ]);

  return { affiliates };
}

async function generateOrdersReport({ startDate, endDate }) {
  const { start, end } = resolveDateRange({ startDate, endDate });
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
    .populate('affiliateId', 'firstName lastName businessName')
    .lean();

  return orders.map(order => ({
    orderId: order.orderId,
    customerID: order.customerId,
    affiliateName: order.affiliateId
      ? `${order.affiliateId.firstName} ${order.affiliateId.lastName}`
      : 'N/A',
    status: order.status,
    bagId: order.bagId,
    createdAt: order.createdAt
  }));
}

async function generateOperatorsReport({ startDate, endDate }) {
  const { start, end } = resolveDateRange({ startDate, endDate });
  const operators = await Operator.find().lean();

  const reports = [];
  for (const operator of operators) {
    const orderStats = await Order.aggregate([
      { $match: { assignedOperator: operator._id, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'complete'] }, 1, 0] } }
        }
      }
    ]);

    reports.push({
      operatorId: operator.operatorId,
      name: `${operator.firstName} ${operator.lastName}`,
      workStation: operator.workStation,
      isActive: operator.isActive,
      totalOrders: orderStats[0]?.totalOrders || 0,
      completedOrders: orderStats[0]?.completedOrders || 0,
      qualityScore: operator.qualityScore
    });
  }
  return reports;
}

async function generateAffiliatesReport({ startDate, endDate }) {
  const { start, end } = resolveDateRange({ startDate, endDate });
  const affiliates = await Affiliate.find().lean();

  const reports = [];
  for (const affiliate of affiliates) {
    const stats = await Order.aggregate([
      { $match: { affiliateId: affiliate.affiliateId, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const customerCount = await Customer.countDocuments({ affiliateId: affiliate.affiliateId });

    reports.push({
      affiliateId: affiliate.affiliateId,
      name: `${affiliate.firstName} ${affiliate.lastName}`,
      businessName: affiliate.businessName,
      customerCount,
      totalOrders: stats[0]?.totalOrders || 0,
      isActive: affiliate.isActive
    });
  }
  return reports;
}

async function generateComprehensiveReport({ startDate, endDate }) {
  const [orders, operators, affiliates] = await Promise.all([
    generateOrdersReport({ startDate, endDate }),
    generateOperatorsReport({ startDate, endDate }),
    generateAffiliatesReport({ startDate, endDate })
  ]);

  return {
    orders,
    operators,
    affiliates,
    summary: {
      totalOrders: orders.length,
      activeOperators: operators.filter(op => op.isActive).length,
      activeAffiliates: affiliates.filter(aff => aff.isActive).length
    }
  };
}

class ReportError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.isReportError = true;
  }
}

async function exportReport({ reportType = 'orders', format = 'csv', startDate, endDate, user, req }) {
  const generators = {
    orders: generateOrdersReport,
    operators: generateOperatorsReport,
    affiliates: generateAffiliatesReport,
    comprehensive: generateComprehensiveReport
  };

  const generator = generators[reportType];
  if (!generator) throw new ReportError('invalid_type', 'Invalid report type');

  const report = await generator({ startDate, endDate });

  logAuditEvent(AuditEvents.DATA_MODIFICATION, {
    action: 'EXPORT_REPORT',
    userId: user.id,
    userType: 'administrator',
    details: { reportType, format, startDate, endDate }
  }, req);

  return {
    report,
    metadata: { reportType, generatedAt: new Date(), startDate, endDate }
  };
}

module.exports = {
  getDashboard,
  getOrderAnalytics,
  getOperatorAnalytics,
  getAffiliateAnalytics,
  exportReport,
  ReportError
};
