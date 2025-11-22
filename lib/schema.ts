import { readFile } from "fs/promises";
import { join } from "path";

interface CollectionSchema {
  collection: string;
  count: number;
  empty: boolean;
  schema: Record<string, string>;
}

let cachedSchema: CollectionSchema[] | null = null;

export async function getMongoSchema(): Promise<CollectionSchema[]> {
  if (cachedSchema) {
    return cachedSchema;
  }

  try {
    const schemaPath = join(process.cwd(), "dbcheck", "schema-2025-11-22T09-11-35.json");
    const schemaData = await readFile(schemaPath, "utf-8");
    cachedSchema = JSON.parse(schemaData) as CollectionSchema[];
    return cachedSchema;
  } catch (error) {
    console.error("Error loading schema:", error);
    return [];
  }
}

export function formatSchemaForPrompt(schemas: CollectionSchema[]): string {
  // Priority collections in the order specified by user
  const priorityCollections = [
    "users",
    "jrsattempts",
    "interview_results",
    "interviews",
    "practicehistories",
    "progresstracks",
    "courses",
    "resumewithais"
  ];

  // Create a map for quick lookup
  const schemaMap = new Map<string, CollectionSchema>();
  schemas.forEach((s) => {
    if (!s.empty && s.count > 0) {
      schemaMap.set(s.collection, s);
    }
  });

  // Format priority collections first with document counts
  const formatted: string[] = [];
  priorityCollections.forEach((collectionName, index) => {
    const schema = schemaMap.get(collectionName);
    if (schema) {
      const fields = Object.entries(schema.schema)
        .map(([key, type]) => `    ${key}: ${type}`)
        .join(",\n");
      formatted.push(`${index + 1}. ${schema.collection} (${schema.count.toLocaleString()} documents)\n${fields}\n`);
      schemaMap.delete(collectionName); // Remove from map so we don't duplicate
    }
  });

  // Add any remaining collections with counts
  schemaMap.forEach((schema) => {
    const fields = Object.entries(schema.schema)
      .map(([key, type]) => `    ${key}: ${type}`)
      .join(",\n");
    formatted.push(`${schema.collection} (${schema.count.toLocaleString()} documents)\n${fields}\n`);
  });

  return formatted.join("\n\n");
}

