import { MongoClient } from "mongodb";
import { DEFAULT_SKUS, COLLECTIONS } from "../backend/config/constants.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/bakehouse";

async function seedBakeSpecs() {
  let client;

  try {
    console.log("Connecting to MongoDB...");
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db();
    const collection = db.collection(COLLECTIONS.BAKE_SPECS);

    console.log("Clearing existing bake specs...");
    await collection.deleteMany({});

    console.log("Inserting default bake specs...");
    const result = await collection.insertMany(DEFAULT_SKUS);

    console.log(`✅ Successfully seeded ${result.insertedCount} bake specs:`);
    DEFAULT_SKUS.forEach((sku) => {
      console.log(`  - ${sku.displayName} (${sku.itemGuid})`);
    });
  } catch (error) {
    console.error("❌ Error seeding bake specs:", error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("MongoDB connection closed");
    }
  }
}

seedBakeSpecs();
