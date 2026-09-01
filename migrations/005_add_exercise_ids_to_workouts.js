import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { workouts } from './workout_definitions.js';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bouldering_log';

/**
 * Backfill catalog exercise IDs onto existing strength workout templates.
 *
 * This is a one-time schema/data migration. It updates the workout definition
 * records themselves so the application no longer needs a fragile name-to-ID
 * mapping in the browser. Future per-day replacements continue to live only
 * inside that day's training log.
 */
async function migrate() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const database = client.db(DB_NAME);
    const collection = database.collection('workout_definitions');

    for (const workout of workouts.filter((item) => item.type === 'strength')) {
      await collection.updateOne(
        { _id: workout._id },
        {
          $set: {
            exercises: workout.exercises,
            updatedAt: new Date(),
          },
        },
      );
      console.log(`Updated exercise catalog IDs for ${workout._id}`);
    }

    console.log('Workout exercise ID migration complete.');
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
