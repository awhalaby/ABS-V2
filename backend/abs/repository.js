import { getCollection } from "../config/database.js";
import { COLLECTIONS } from "../config/constants.js";
import { startOfBusinessDay, endOfBusinessDay } from "../config/timezone.js";
import { parseISO } from "date-fns";

/**
 * ABS Schedule repository - Database queries for schedule operations
 */

/**
 * Get earliest order date from database
 * @returns {Promise<string|null>} Earliest date string (YYYY-MM-DD) or null
 */
export async function getEarliestOrderDate() {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const earliest = await collection.findOne(
    {},
    {
      sort: { paidDate: 1 },
      projection: { paidDate: 1 },
    }
  );

  if (!earliest || !earliest.paidDate) {
    return null;
  }

  // Convert to date string in business timezone
  const date = new Date(earliest.paidDate);
  const dateStr = date.toISOString().split("T")[0];
  return dateStr;
}

/**
 * Get forecast data for date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Forecast data
 */
export async function getForecastData(startDate, endDate) {
  // This would ideally query from forecasts collection
  // For now, we'll need to generate it on the fly or cache it
  // Placeholder - will be implemented to query forecast service
  return [];
}

/**
 * Get bake specs for all active items
 * @returns {Promise<Array>} Array of bake specs
 */
export async function getBakeSpecs() {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);
  return await collection.find({ active: true }).toArray();
}

/**
 * Get bake spec by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object|null>} Bake spec or null
 */
export async function getBakeSpecByItemGuid(itemGuid) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);
  return await collection.findOne({ itemGuid, active: true });
}

/**
 * Save schedule to database
 * @param {Object} schedule - Schedule object
 * @returns {Promise<Object>} Inserted schedule
 */
export async function saveSchedule(schedule) {
  const collection = getCollection(COLLECTIONS.ABS_SCHEDULES);

  // Check if schedule already exists for this date
  const existing = await collection.findOne({ date: schedule.date });

  if (existing) {
    // Update existing schedule
    const result = await collection.updateOne(
      { date: schedule.date },
      {
        $set: {
          ...schedule,
          updatedAt: new Date(),
        },
      }
    );
    return { ...existing, ...schedule, updatedAt: new Date() };
  } else {
    // Insert new schedule
    const result = await collection.insertOne({
      ...schedule,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      ...schedule,
      _id: result.insertedId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Get schedule by date
 * @param {Date|string} date - Schedule date
 * @returns {Promise<Object|null>} Schedule or null
 */
export async function getScheduleByDate(date) {
  const collection = getCollection(COLLECTIONS.ABS_SCHEDULES);
  const dateStr =
    typeof date === "string" ? date : date.toISOString().split("T")[0];
  return await collection.findOne({ date: dateStr });
}

/**
 * Get schedules by date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Array of schedules
 */
export async function getSchedulesByDateRange(startDate, endDate) {
  const collection = getCollection(COLLECTIONS.ABS_SCHEDULES);
  const start =
    typeof startDate === "string"
      ? startDate
      : startDate.toISOString().split("T")[0];
  const end =
    typeof endDate === "string" ? endDate : endDate.toISOString().split("T")[0];

  return await collection
    .find({
      date: {
        $gte: start,
        $lte: end,
      },
    })
    .sort({ date: 1 })
    .toArray();
}

/**
 * Delete schedule by date
 * @param {Date|string} date - Schedule date
 * @returns {Promise<Object>} Delete result
 */
export async function deleteScheduleByDate(date) {
  const collection = getCollection(COLLECTIONS.ABS_SCHEDULES);
  const dateStr =
    typeof date === "string" ? date : date.toISOString().split("T")[0];
  const result = await collection.deleteOne({ date: dateStr });
  return { deletedCount: result.deletedCount };
}

/**
 * Update schedule batch
 * @param {string} scheduleId - Schedule ID
 * @param {string} batchId - Batch ID
 * @param {Object} updates - Batch updates
 * @returns {Promise<Object>} Update result
 */
export async function updateScheduleBatch(scheduleId, batchId, updates) {
  const collection = getCollection(COLLECTIONS.ABS_SCHEDULES);

  const result = await collection.updateOne(
    { _id: scheduleId, "batches.batchId": batchId },
    {
      $set: {
        "batches.$": {
          ...updates,
          batchId,
        },
        updatedAt: new Date(),
      },
    }
  );

  return { modifiedCount: result.modifiedCount };
}
