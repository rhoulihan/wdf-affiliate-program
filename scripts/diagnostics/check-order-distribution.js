// MongoDB script to check order date distribution
// Run with: mongo wavemax_affiliate scripts/check-order-distribution.js

// Connect to the database
db = db.getSiblingDB('wavemax_affiliate');

print('=== Order Date Distribution Analysis ===\n');

// Get total count of orders
const totalOrders = db.orders.countDocuments();
print('Total orders in database: ' + totalOrders);

// Group orders by date (day level)
print('\n=== Orders grouped by date ===');
const ordersByDate = db.orders.aggregate([
  {
    $group: {
      _id: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$createdAt'
        }
      },
      count: { $sum: 1 },
      totalRevenue: { $sum: '$totalAmount' }
    }
  },
  {
    $sort: { _id: -1 }
  }
]).toArray();

print('\nDate\t\t\tCount\tTotal Revenue');
print('----------------------------------------');
ordersByDate.forEach(function(day) {
  print(day._id + '\t\t' + day.count + '\t$' + day.totalRevenue.toFixed(2));
});

// Check for specific problematic dates
print('\n=== Checking specific dates ===');
const june19Orders = db.orders.countDocuments({
  createdAt: {
    $gte: new Date('2024-06-19T00:00:00Z'),
    $lt: new Date('2024-06-20T00:00:00Z')
  }
});
print('Orders on June 19, 2024: ' + june19Orders);

const dec31Orders = db.orders.countDocuments({
  createdAt: {
    $gte: new Date('2024-12-31T00:00:00Z'),
    $lt: new Date('2025-01-01T00:00:00Z')
  }
});
print('Orders on Dec 31, 2024: ' + dec31Orders);

// Group by month to see monthly distribution
print('\n=== Monthly distribution ===');
const ordersByMonth = db.orders.aggregate([
  {
    $group: {
      _id: {
        $dateToString: {
          format: '%Y-%m',
          date: '$createdAt'
        }
      },
      count: { $sum: 1 },
      totalRevenue: { $sum: '$totalAmount' }
    }
  },
  {
    $sort: { _id: 1 }
  }
]).toArray();

print('\nMonth\t\tCount\tTotal Revenue');
print('------------------------------------');
ordersByMonth.forEach(function(month) {
  print(month._id + '\t\t' + month.count + '\t$' + month.totalRevenue.toFixed(2));
});

// Check date range of orders
print('\n=== Date range of orders ===');
const dateRange = db.orders.aggregate([
  {
    $group: {
      _id: null,
      minDate: { $min: '$createdAt' },
      maxDate: { $max: '$createdAt' }
    }
  }
]).toArray()[0];

if (dateRange) {
  print('Earliest order: ' + dateRange.minDate);
  print('Latest order: ' + dateRange.maxDate);
}

// Sample some orders to see their actual dates
print('\n=== Sample of 10 recent orders ===');
const sampleOrders = db.orders.find({}, {
  _id: 1,
  createdAt: 1,
  totalAmount: 1
}).sort({ createdAt: -1 }).limit(10).toArray();

print('\nOrder ID\t\t\t\tDate\t\t\t\tAmount');
print('--------------------------------------------------------------------------------');
sampleOrders.forEach(function(order) {
  print(order._id + '\t' + order.createdAt + '\t$' + order.totalAmount.toFixed(2));
});