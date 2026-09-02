/** Infer a sensible default number of sets from a catalog entry or target string. */
export function inferDefaultSets(exercise) {
  if (Number.isFinite(exercise?.defaultSets) && exercise.defaultSets > 0) return exercise.defaultSets;
  const match = String(exercise?.target || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 3;
}

/** Normalize a stored strength set so every set always has weight and reps fields. */
export function normalizeSet(set) {
  if (set && typeof set === 'object') return { weight: set.weight ?? '', reps: set.reps ?? '' };
  if (set === undefined || set === null || set === '') return { weight: '', reps: '' };
  return { weight: set, reps: '' };
}

/** Normalize a bouldering problem record to the fields supported by the editor. */
export function normalizeProblem(problem) {
  return {
    grade: problem?.grade ?? '',
    result: problem?.result ?? '',
    tries: problem?.tries ?? '',
    notes: problem?.notes ?? '',
  };
}

/** Resolve a result value into the human-readable label from a workout schema. */
export function resultLabel(value, results) {
  return results.find((result) => result.value === value)?.label || '—';
}

/** Return true only when an exercise entry carries a stable catalog identifier. */
export function hasStableExerciseId(entry) {
  return Boolean(entry && typeof entry.exerciseId === 'string' && entry.exerciseId.trim());
}
