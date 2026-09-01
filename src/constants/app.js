/**
 * Client-side configuration and static UI definitions.
 *
 * Values that affect the browser UI live here rather than inside React
 * components, so changing the app configuration does not require hunting
 * through rendering code.
 */
export const STORAGE_KEY = 'bouldering-log-v1';
export const SAVE_DEBOUNCE_MS = 1500;
export const PIN_LENGTH = 6;
export const TIME_ZONE = 'Asia/Tokyo';

/** The mobility checklist shown on every workout day. */
export const MOBILITY_ITEMS = [
  'Hamstrings',
  '90/90 / hip opening',
  'Hip flexors',
  'Cossack / adductors',
  'Ankles',
  'Serratus / thoracic',
];

/** Fallback bouldering schema used only when a workout does not define one. */
export const DEFAULT_BOULDER_SCHEMA = {
  version: 1,
  grades: ['8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級', '初段', '二段'],
  results: [
    { value: 'fail', label: 'Fail' },
    { value: 'project', label: 'Project' },
    { value: 'send', label: 'Send' },
    { value: 'flash', label: 'Flash' },
  ],
};

/** Maps workout intensity values to the short label shown in calendar cells. */
export const INTENSITY_LABELS = {
  red: 'HARD',
  yellow: 'MOD',
  green: 'EASY',
};

/** Fixed Monday-first labels used by the calendar header. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Human-readable labels for workout types used in badges and accessibility text. */
export const WORKOUT_TYPE_LABELS = {
  strength: 'Gym',
  climbing: 'Bouldering',
};

/** Exercise catalog types understood by the replace/add picker. */
export const EXERCISE_TYPES = {
  LIFTING: 'lifting',
  CLIMBING: 'climbing',
};
