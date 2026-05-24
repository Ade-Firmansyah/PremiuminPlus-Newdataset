import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/premiuminpluus';
const dbName = process.env.MONGODB_DBNAME || process.env.MONGO_DBNAME || 'premiuminpluus';

const client = new MongoClient(uri, {
  // use recommended options for driver v5
  serverApi: {
    version: '1'
  }
});

let _connected = false;

export async function connectMongo() {
  if (_connected) return { client, db: client.db(dbName) };
  await client.connect();
  _connected = true;
  const db = client.db(dbName);
  return { client, db };
}

export function getDb() {
  if (!_connected) throw new Error('MongoDB not connected. Call connectMongo() first.');
  return client.db(dbName);
}

export function startSession() {
  if (!_connected) throw new Error('MongoDB not connected. Call connectMongo() first.');
  return client.startSession();
}

export async function closeMongo() {
  if (!_connected) return;
  await client.close();
  _connected = false;
}

export default {
  connectMongo,
  getDb,
  startSession,
  closeMongo
};
