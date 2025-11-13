import { getCollection } from "../config/database.js";
import { COLLECTIONS } from "../config/constants.js";
import { getMongoTimezone } from "../config/timezone.js";
import { startOfBusinessDay, endOfBusinessDay } from "../config/timezone.js";
import { parseISO } from "date-fns";

/**
 * Velocity repository - MongoDB aggregations for velocity queries
 */

/**
 * Get weekly velocity (grouped by week and SKU)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Array of weekly velocity records
 */
export async function getWeeklyVelocity(startDate, endDate) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);
  const timezone = getMongoTimezone();

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
        _id: {
          year: { $year: { date: "$paidDate", timezone } },
          week: { $week: { date: "$paidDate", timezone } },
          itemGuid: "$itemGuid",
          displayName: "$displayName",
        },
        totalQuantity: { $sum: "$quantity" },
        orderCount: { $addToSet: "$orderId" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$price"] } },
      },
    },
    {
      $project: {
        _id: 0,
        year: "$_id.year",
        week: "$_id.week",
        itemGuid: "$_id.itemGuid",
        displayName: "$_id.displayName",
        totalQuantity: 1,
        orderCount: { $size: "$orderCount" },
        totalRevenue: 1,
        avgPerDay: {
          $divide: ["$totalQuantity", 7],
        },
      },
    },
    {
      $sort: { year: 1, week: 1, displayName: 1 },
    },
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Get daily velocity (grouped by date and SKU)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {string} sku - Optional SKU filter (itemGuid or displayName)
 * @returns {Promise<Array>} Array of daily velocity records
 */
export async function getDailyVelocity(startDate, endDate, sku = null) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);
  const timezone = getMongoTimezone();

  const matchStage = {
    paidDate: {
      $gte: start,
      $lte: end,
    },
  };

  // Add SKU filter if provided
  if (sku) {
    matchStage.$or = [
      { itemGuid: sku },
      { displayName: { $regex: sku, $options: "i" } },
    ];
  }

  const pipeline = [
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$paidDate",
              timezone,
            },
          },
          itemGuid: "$itemGuid",
          displayName: "$displayName",
        },
        totalQuantity: { $sum: "$quantity" },
        orderCount: { $addToSet: "$orderId" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$price"] } },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id.date",
        itemGuid: "$_id.itemGuid",
        displayName: "$_id.displayName",
        totalQuantity: 1,
        orderCount: { $size: "$orderCount" },
        totalRevenue: 1,
      },
    },
    {
      $sort: { date: 1, displayName: 1 },
    },
  ];

  const results = await collection.aggregate(pipeline).toArray();

  // Add day of week
  return results.map((record) => {
    const date = parseISO(record.date + "T00:00:00");
    const dayOfWeek = date.getDay();
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return {
      ...record,
      dayOfWeek: dayNames[dayOfWeek],
      dayOfWeekAbbr: dayNames[dayOfWeek].substring(0, 3),
    };
  });
}

/**
 * Get intraday velocity (grouped by time bucket)
 * @param {string} itemGuid - Item GUID to filter by
 * @param {Date|string} date - Date to analyze
 * @param {number} intervalMinutes - Time bucket interval (5, 10, or 20 minutes)
 * @returns {Promise<Array>} Array of intraday velocity records
 */
export async function getIntradayVelocity(
  itemGuid,
  date,
  intervalMinutes = 20
) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(date);
  const end = endOfBusinessDay(date);
  const timezone = getMongoTimezone();

  const pipeline = [
    {
      $match: {
        itemGuid: itemGuid,
        paidDate: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $project: {
        itemGuid: 1,
        displayName: 1,
        quantity: 1,
        paidDate: 1,
        hour: { $hour: { date: "$paidDate", timezone } },
        minute: { $minute: { date: "$paidDate", timezone } },
      },
    },
    {
      $project: {
        itemGuid: 1,
        displayName: 1,
        quantity: 1,
        paidDate: 1,
        timeBucket: {
          $subtract: [
            {
              $add: [{ $multiply: ["$hour", 60] }, "$minute"],
            },
            {
              $mod: [
                {
                  $add: [{ $multiply: ["$hour", 60] }, "$minute"],
                },
                intervalMinutes,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          timeBucket: "$timeBucket",
          itemGuid: "$itemGuid",
          displayName: "$displayName",
        },
        totalQuantity: { $sum: "$quantity" },
        orderCount: { $addToSet: "$paidDate" },
      },
    },
    {
      $project: {
        _id: 0,
        timeBucket: "$_id.timeBucket",
        itemGuid: "$_id.itemGuid",
        displayName: "$_id.displayName",
        totalQuantity: 1,
        orderCount: { $size: "$orderCount" },
        timeSlot: {
          $concat: [
            {
              $cond: {
                if: {
                  $lt: [
                    {
                      $floor: { $divide: ["$_id.timeBucket", 60] },
                    },
                    10,
                  ],
                },
                then: {
                  $concat: [
                    "0",
                    {
                      $toString: {
                        $floor: { $divide: ["$_id.timeBucket", 60] },
                      },
                    },
                  ],
                },
                else: {
                  $toString: {
                    $floor: { $divide: ["$_id.timeBucket", 60] },
                  },
                },
              },
            },
            ":",
            {
              $toString: {
                $cond: {
                  if: { $lt: [{ $mod: ["$_id.timeBucket", 60] }, 10] },
                  then: {
                    $concat: [
                      "0",
                      {
                        $toString: { $mod: ["$_id.timeBucket", 60] },
                      },
                    ],
                  },
                  else: { $toString: { $mod: ["$_id.timeBucket", 60] } },
                },
              },
            },
          ],
        },
      },
    },
    {
      $sort: { timeBucket: 1 },
    },
  ];

  return await collection.aggregate(pipeline).toArray();
}
