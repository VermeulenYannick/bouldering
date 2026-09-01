import { TIME_ZONE } from '../constants/app.js';

/**
 * Convert a Date into an ISO-like YYYY-MM-DD key in the app's configured time zone.
 * This keeps calendar and log keys stable for a Tokyo-based user.
 */
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Convert a YYYY-MM-DD log key back into a local Date at midday.
 * Noon is used to avoid daylight-saving/time-zone edge cases when displaying dates.
 */
export function localDateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
