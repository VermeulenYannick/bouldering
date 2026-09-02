import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bouldering_log';

/**
 * Backfill a stable semantic intensity onto existing workout templates.
 *
 * This migration never modifies training logs. It only ensures every existing
 * workout template has `intensity` so historical comparisons can distinguish
 * hard, moderate, and easy sessions without relying on presentation colors.
 */
async function migrate() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const database = client.db(DB_NAME);
    const collection = database.collection('workout_definitions');
    const mapping = { red: 'hard', yellow: 'moderate', green: 'easy' };

    const workouts = await collection.find({ intensity: { $exists: false } }).toArray();
    for (const workout of workouts) {
      const intensity = mapping[workout.color];
      if (!intensity) continue;
      await collection.updateOne(
        { _id: workout._id },
        { $set: { intensity, updatedAt: new Date() } },
      );
      console.log(`Added ${intensity} intensity to ${workout._id}`);
    }

    console.log('Workout intensity migration complete. Historical training logs were not modified.');
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
