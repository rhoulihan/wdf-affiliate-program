#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../../server/models/Order');

async function checkDistribution() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wavemax');
    console.log('Connected to MongoDB');

    // Get orders grouped by day
    const distribution = await Order.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$actualTotal' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('\nOrder Distribution by Day:');
    console.log('Date\t\tOrders\tRevenue');
    console.log('----\t\t------\t-------');

    distribution.slice(-30).forEach(day => {
      console.log(`${day._id}\t${day.count}\t$${(day.revenue || 0).toFixed(2)}`);
    });

    const total = distribution.reduce((sum, day) => sum + day.count, 0);
    const avgPerDay = total / distribution.length;

    console.log(`\nTotal days with orders: ${distribution.length}`);
    console.log(`Total orders: ${total}`);
    console.log(`Average orders per day: ${avgPerDay.toFixed(1)}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkDistribution();