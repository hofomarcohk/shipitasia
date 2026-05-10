import { Db, MongoClient } from 'mongodb';

let cachedDb: Db | null = null;
const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not defined');
}
const client = new MongoClient(uri);

export async function connectToDatabase() {
  if(cachedDb) {
    return cachedDb;
  }
  cachedDb = client.db(process.env.MONGODB_NAME);
  return cachedDb;
}

// Exposed for services that need to start a transaction session — the
// underlying singleton client owns connection pooling. Do NOT instantiate
// a second MongoClient elsewhere.
export function getMongoClient(): MongoClient {
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.close();
    cachedDb = null;
  }
}