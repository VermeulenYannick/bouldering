import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'bouldering_log';
if (!uri) throw new Error('MONGODB_URI is not configured');

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(dbName);
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('sessions').createIndex({ type: 1, owner: 1 });
  await db.collection('webauthn_challenges').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('passkeys').createIndex({ owner: 1 });
  console.log(`Security collections/indexes initialized in ${dbName}.`);
  console.log('This migration is safe to run repeatedly. It does not delete training data.');
} finally {
  await client.close();
}
