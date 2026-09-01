import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bouldering_log';

/**
 * Create the independent weekly schedule collection and seed it from the
 * existing workout_definitions.dayOfWeek values. The migration is additive:
 * no workout template or training log is deleted or rewritten.
 */
async function migrate() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const database = client.db(DB_NAME);
    const schedule = database.collection('workout_schedule');
    await schedule.createIndex({ dayOfWeek: 1 }, { unique: true });
    await schedule.createIndex({ workoutId: 1 });

    const count = await schedule.countDocuments();
    if (count === 0) {
      const legacy = await database.collection('workout_definitions')
        .find({ active: { $ne: false }, dayOfWeek: { $exists: true } })
        .toArray();

      for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
        const workout = legacy.find((item) => Number(item.dayOfWeek) === dayOfWeek);
        await schedule.updateOne(
          { _id: `weekday_${dayOfWeek}` },
          {
            $set: {
              dayOfWeek,
              workoutId: workout?._id || null,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
      }
      console.log('Seeded weekly schedule from existing workout templates.');
    } else {
      console.log('Weekly schedule already exists; no seed changes made.');
    }
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
