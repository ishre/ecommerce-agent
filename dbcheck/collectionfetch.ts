import { MongoClient, Db } from "mongodb";
import { writeFile } from "fs/promises";
import { join } from "path";

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Admin:viosa@cluster0.ysacony.mongodb.net";
const DB_NAME = process.env.MONGO_DB_NAME || "viosa";

// Number of documents to sample per collection (avoid heavy load)
const SAMPLE_SIZE = 100;

type SchemaType = "string" | "number" | "boolean" | "object" | "array" | "date" | "null" | "mixed";
type Schema = Record<string, SchemaType>;

function inferType(value: unknown): SchemaType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value as SchemaType;
}

function mergeSchemas(schemaA: Schema, schemaB: Schema): Schema {
  const merged = { ...schemaA };
  for (const key in schemaB) {
    if (!merged[key]) merged[key] = schemaB[key];
    else if (merged[key] !== schemaB[key]) merged[key] = "mixed";
  }
  return merged;
}

interface CollectionInfo {
  collection: string;
  count: number;
  empty: boolean;
  schema: Schema;
}

async function analyzeCollection(db: Db, collectionName: string): Promise<CollectionInfo> {
  const col = db.collection(collectionName);

  const count = await col.estimatedDocumentCount();
  if (count === 0) {
    return {
      collection: collectionName,
      count: 0,
      empty: true,
      schema: {},
    };
  }

  const sampleDocs = await col.find({}).limit(SAMPLE_SIZE).toArray();
  let schema: Schema = {};

  sampleDocs.forEach((doc) => {
    Object.entries(doc).forEach(([field, value]) => {
      const type = inferType(value);
      schema[field] = schema[field]
        ? (schema[field] === type ? type : "mixed")
        : type;
    });
  });

  return {
    collection: collectionName,
    count,
    empty: false,
    schema,
  };
}

async function generateFullSchema() {
  if (MONGO_URI === "YOUR_MONGO_URI" || DB_NAME === "YOUR_DB_NAME") {
    console.error("❌ Error: Please set MONGO_URI and MONGO_DB_NAME environment variables");
    console.error("   Or update the constants in the file directly.");
    console.error("\n   Example:");
    console.error("   MONGO_URI=mongodb://localhost:27017 MONGO_DB_NAME=mydb npm run dbcheck");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB: ${DB_NAME}...`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("✅ Connected successfully!\n");
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();

  const results: CollectionInfo[] = [];

  for (const { name } of collections) {
    console.log(`Analyzing: ${name} ...`);
    const info = await analyzeCollection(db, name);
    results.push(info);
  }

  await client.close();

  const jsonOutput = JSON.stringify(results, null, 2);
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const filename = `schema-${timestamp}.json`;
  
  // Save to dbcheck directory (relative to project root)
  const filepath = join(process.cwd(), "dbcheck", filename);

  // Save to file
  await writeFile(filepath, jsonOutput, "utf-8");
  
  console.log("\n\n========== FINAL SCHEMA ==========\n");
  console.log(jsonOutput);
  console.log(`\n✅ Schema saved to: ${filepath}`);
}

generateFullSchema().catch(console.error);
