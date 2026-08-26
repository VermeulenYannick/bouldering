import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { workouts } from './workout_definitions.js';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'bouldering_log';

if (!uri) {
  console.error('MONGODB_URI is not configured. Add it to .env first.');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection('workout_definitions');

  await collection.createIndex({ dayOfWeek: 1 });
  await collection.createIndex({ active: 1 });

  for (const workout of workouts) {
    await collection.updateOne(
      { _id: workout._id },
      {
        $set: { ...workout, active: true, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
  }

  console.log(`Seeded ${workouts.length} workout definitions into ${dbName}.workout_definitions`);
  console.log('Existing records with the same _id were updated; no duplicates were created.');
} finally {
  await client.close();
}
