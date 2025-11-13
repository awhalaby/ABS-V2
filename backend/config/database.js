import { MongoClient } from "mongodb";
import { COLLECTIONS } from "./constants.js";

let client = null;
let db = null;

/**
 * MongoDB connection management
 */

/**
 * Connect to MongoDB
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<MongoClient>} MongoDB client
 */
export async function connectDatabase(uri) {
  if (client && db) {
    return { client, db };
  }

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db();

    console.log("✅ Connected to MongoDB");

    // Create indexes
    await createIndexes();

    return { client, db };
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
}

/**
 * Get database instance
 * @returns {Db} MongoDB database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  return db;
}

/**
 * Get collection by name
 * @param {string} collectionName - Collection name
 * @returns {Collection} MongoDB collection
 */
export function getCollection(collectionName) {
  const database = getDatabase();
  return database.collection(collectionName);
}

/**
 * Create indexes for collections
 */
async function createIndexes() {
  try {
    const database = getDatabase();

    // menu_items indexes
    const menuItems = database.collection(COLLECTIONS.MENU_ITEMS);
    await menuItems.createIndex({ orderId: 1 });
    await menuItems.createIndex({ paidDate: 1 });
    await menuItems.createIndex({ displayName: 1 });
    await menuItems.createIndex({ itemGuid: 1 });
    await menuItems.createIndex({ displayName: 1, paidDate: 1 });
    await menuItems.createIndex({ itemGuid: 1, paidDate: 1 });

    // bake_specs indexes
    const bakeSpecs = database.collection(COLLECTIONS.BAKE_SPECS);
    await bakeSpecs.createIndex({ itemGuid: 1 }, { unique: true });
    await bakeSpecs.createIndex({ active: 1 });

    // forecasts indexes
    const forecasts = database.collection(COLLECTIONS.FORECASTS);
    await forecasts.createIndex({ forecastType: 1, date: 1 });
    await forecasts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // abs_schedules indexes
    const absSchedules = database.collection(COLLECTIONS.ABS_SCHEDULES);
    await absSchedules.createIndex({ date: 1 });
    await absSchedules.createIndex({ createdAt: -1 });

    console.log("✅ Database indexes created");
  } catch (error) {
    console.error("⚠️ Error creating indexes:", error);
    // Don't throw - indexes may already exist
  }
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("✅ MongoDB connection closed");
  }
}

/**
 * Health check - test database connection
 * @returns {Promise<boolean>} True if healthy
 */
export async function healthCheck() {
  try {
    if (!db) {
      return false;
    }
    await db.admin().ping();
    return true;
  } catch (error) {
    console.error("Health check failed:", error);
    return false;
  }
}

// Collection name exports for convenience
export const Collections = COLLECTIONS;
