import { MongoClient, Db, Collection, Document, Filter, Sort } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Admin:viosa@cluster0.ysacony.mongodb.net";
const DB_NAME = process.env.MONGO_DB_NAME || "viosa";

let client: MongoClient | null = null;
let db: Db | null = null;

async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  }
  return client;
}

async function getDb(): Promise<Db> {
  if (!db) {
    const clientInstance = await getClient();
    db = clientInstance.db(DB_NAME);
  }
  return db;
}

/**
 * Sanitizes MongoDB aggregation pipeline to fix common projection errors
 */
function sanitizePipeline(pipeline: unknown[]): Document[] {
  return pipeline.map((stage: unknown): Document => {
    if (typeof stage !== 'object' || stage === null) {
      return stage as Document;
    }

    const stageObj = stage as Record<string, unknown>;
    
    // Fix $project stages that mix inclusion and exclusion
    if ('$project' in stageObj && typeof stageObj.$project === 'object' && stageObj.$project !== null) {
      const project = stageObj.$project as Record<string, unknown>;
      const keys = Object.keys(project);
      
      // Check if we have both inclusion (1) and exclusion (0)
      const hasInclusion = keys.some(key => {
        const value = project[key];
        return value === 1 || value === true;
      });
      const hasExclusion = keys.some(key => {
        const value = project[key];
        return value === 0 || value === false;
      });
      
      // If we have both inclusion and exclusion (except _id), convert to inclusion-only
      if (hasInclusion && hasExclusion) {
        const newProject: Record<string, unknown> = {};
        let hasIdExclusion = false;
        
        keys.forEach(key => {
          const value = project[key];
          
          // Handle _id separately - it can be excluded even with inclusion projection
          if (key === '_id' && (value === 0 || value === false)) {
            hasIdExclusion = true;
            return; // Will add it at the end
          }
          
          // Keep inclusion fields (1 or true)
          if (value === 1 || value === true) {
            newProject[key] = 1;
          }
          // Keep expressions (non-boolean, non-number values like $concat, etc.)
          else if (typeof value !== 'number' && typeof value !== 'boolean' && value !== null) {
            newProject[key] = value;
          }
          // Skip exclusion fields (0 or false) - they won't be in the new projection
        });
        
        // Add _id exclusion if it was explicitly excluded
        if (hasIdExclusion) {
          newProject._id = 0;
        }
        
        return { $project: newProject } as Document;
      }
      
      // If only exclusions, ensure _id is handled correctly
      if (hasExclusion && !hasInclusion) {
        // If _id is not explicitly set, include it by default
        if (!('_id' in project)) {
          const newProject = { ...project };
          newProject._id = 1;
          return { $project: newProject } as Document;
        }
      }
    }
    
    return stage as Document;
  });
}

export async function query(collectionName: string, pipeline: unknown[] = []) {
  const database = await getDb();
  const collection = database.collection(collectionName);
  
  if (pipeline.length === 0) {
    // If no pipeline, return all documents
    const results = await collection.find({}).toArray();
    return { rows: results };
  }
  
  // Sanitize pipeline to fix common errors
  const sanitizedPipeline = sanitizePipeline(pipeline) as Document[];
  
  try {
    // Execute aggregation pipeline
    const aggregationCursor = collection.aggregate(sanitizedPipeline, {
      allowDiskUse: true, // Allow disk use for large aggregations
    });
    
    const results = await aggregationCursor.toArray();
    return { rows: results };
  } catch (error) {
    console.error("[DB] Pipeline execution error:", error);
    console.error("[DB] Original pipeline:", JSON.stringify(pipeline, null, 2));
    console.error("[DB] Sanitized pipeline:", JSON.stringify(sanitizedPipeline, null, 2));
    throw error;
  }
}

export async function find(collectionName: string, filter: Filter<Document> = {}, options: { limit?: number; sort?: Sort } = {}) {
  const database = await getDb();
  const collection = database.collection(collectionName);
  
  let query = collection.find(filter);
  
  if (options.sort) {
    query = query.sort(options.sort);
  }
  
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  const results = await query.toArray();
  return { rows: results };
}

export async function getCollection(collectionName: string): Promise<Collection> {
  const database = await getDb();
  return database.collection(collectionName);
} 