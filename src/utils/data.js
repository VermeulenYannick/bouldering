import { localDateFromKey } from './dates.js';

/** Deep-clone JSON-compatible application state. */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Determine whether a value contains anything meaningful enough to count as
 * user-entered training data. Empty strings, zeroes, nulls and empty objects
 * are treated as empty; true values and non-zero numbers count as meaningful.
 */
export function hasMeaningfulData(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return value === true || value !== 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulData);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulData);
  return false;
}

/**
 * Build a blank log for a date using that weekday's scheduled template.
 * A missing date entry therefore displays the normal planned workout without
 * creating a database record until the user actually changes something.
 */
export function emptyLog(key, workouts) {
  const workout = workouts.find((item) => item.dayOfWeek === localDateFromKey(key).getDay());
  return {
    date: key,
    workoutId: workout?._id ?? null,
    workoutVersion: workout?.version ?? 1,
    data: {},
    updatedAt: 0,
  };
}
