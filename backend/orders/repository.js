import { getCollection } from "../config/database.js";
import { COLLECTIONS } from "../config/constants.js";
import { startOfBusinessDay, endOfBusinessDay } from "../config/timezone.js";

/**
 * Orders repository - Database queries for orders
 */

/**
 * Bulk insert orders with duplicate handling
 * @param {Array<Object>} orders - Array of order objects
 * @returns {Promise<Object>} Insert result with insertedCount and duplicates
 */
export async function bulkInsertOrders(orders) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  // Check for duplicates by orderId:itemGuid combination (allows multiple items per order)
  // Build a set of existing orderId:itemGuid combinations
  const orderItemKeys = orders.map(
    (order) => `${order.orderId}:${order.itemGuid}`
  );
  const uniqueOrderIds = [...new Set(orders.map((order) => order.orderId))];

  const existingOrders = await collection
    .find({ orderId: { $in: uniqueOrderIds } })
    .toArray();

  const existingOrderItemKeys = new Set(
    existingOrders.map((order) => `${order.orderId}:${order.itemGuid}`)
  );

  // Separate new orders from duplicates
  const newOrders = orders.filter(
    (order) => !existingOrderItemKeys.has(`${order.orderId}:${order.itemGuid}`)
  );
  const duplicates = orders.filter((order) =>
    existingOrderItemKeys.has(`${order.orderId}:${order.itemGuid}`)
  );

  let insertedCount = 0;
  if (newOrders.length > 0) {
    // Insert in batches of 1000 for better performance
    const batchSize = 1000;
    for (let i = 0; i < newOrders.length; i += batchSize) {
      const batch = newOrders.slice(i, i + batchSize);
      const result = await collection.insertMany(batch, { ordered: false });
      insertedCount += result.insertedCount;
    }
  }

  return {
    insertedCount,
    duplicateCount: duplicates.length,
    duplicates: duplicates.map((order) => order.orderId),
  };
}

/**
 * Get order statistics for a date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Object>} Statistics object
 */
export async function getOrderStatistics(startDate, endDate) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);

  const pipeline = [
    {
      $match: {
        paidDate: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalOrders: { $addToSet: "$orderId" },
        totalItems: { $sum: "$quantity" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$price"] } },
        uniqueSKUs: { $addToSet: "$itemGuid" },
        uniqueDisplayNames: { $addToSet: "$displayName" },
      },
    },
    {
      $project: {
        _id: 0,
        totalOrders: { $size: "$totalOrders" },
        totalItems: 1,
        totalRevenue: 1,
        uniqueSKUs: { $size: "$uniqueSKUs" },
        uniqueDisplayNames: { $size: "$uniqueDisplayNames" },
      },
    },
  ];

  const result = await collection.aggregate(pipeline).toArray();

  if (result.length === 0) {
    return {
      totalOrders: 0,
      totalItems: 0,
      totalRevenue: 0,
      uniqueSKUs: 0,
      uniqueDisplayNames: 0,
    };
  }

  return result[0];
}

/**
 * Find date ranges with order data
 * @returns {Promise<Array>} Array of date range objects
 */
export async function findDateRanges() {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const pipeline = [
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$paidDate",
            timezone: "America/New_York",
          },
        },
        orderCount: { $addToSet: "$orderId" },
        itemCount: { $sum: "$quantity" },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        orderCount: { $size: "$orderCount" },
        itemCount: 1,
      },
    },
    {
      $sort: { date: -1 },
    },
  ];

  const dates = await collection.aggregate(pipeline).toArray();

  // Return each date as its own individual entry (no grouping)
  const ranges = dates.map((dateEntry) => ({
    startDate: dateEntry.date,
    endDate: dateEntry.date,
    orderCount: dateEntry.orderCount,
    itemCount: dateEntry.itemCount,
  }));

  return ranges;
}

/**
 * Delete orders by date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Object>} Delete result
 */
export async function deleteByDateRange(startDate, endDate) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);

  const result = await collection.deleteMany({
    paidDate: {
      $gte: start,
      $lte: end,
    },
  });

  return {
    deletedCount: result.deletedCount,
  };
}

/**
 * Delete all orders
 * @returns {Promise<Object>} Delete result
 */
export async function deleteAllOrders() {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const result = await collection.deleteMany({});

  return {
    deletedCount: result.deletedCount,
  };
}

/**
 * Get orders for a date range (for preview/validation)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {number} limit - Maximum number of orders to return
 * @returns {Promise<Array>} Array of order objects
 */
export async function getOrdersByDateRange(startDate, endDate, limit = 100) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);

  const orders = await collection
    .find({
      paidDate: {
        $gte: start,
        $lte: end,
      },
    })
    .sort({ paidDate: 1 })
    .limit(limit)
    .toArray();

  return orders;
}
