import { closeDatabase, connectDatabase, getDatabase, getMongoClient, startDatabaseSession } from './database.js';

export async function connectMongo() {
  return connectDatabase();
}

export function getDb() {
  return getDatabase();
}

export function startSession() {
  return startDatabaseSession();
}

export async function closeMongo() {
  await closeDatabase();
}

export default {
  connectMongo,
  getDb,
  startSession,
  closeMongo
};
