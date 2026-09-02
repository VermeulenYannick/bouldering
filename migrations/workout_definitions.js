import 'dotenv/config';


const STANDARD_BOULDERING_SCHEMA = {
  version: 1,
  grades: ['8級','7級','6級','5級','4級','3級','2級','1級','初段','二段'],
  results: [
    { value: 'fail', label: 'Fail' },
    { value: 'project', label: 'Project' },
    { value: 'send', label: 'Send' },
    { value: 'flash', label: 'Flash' }
  ]
};

const workouts = [
  {
    _id: 'spray_limit_v1', version: 1, dayOfWeek: 1, day: 'Monday', title: 'Spray Wall — Limit', type: 'climbing', color: 'red', intensity: 'hard', description: 'Limit bouldering + finger strength',
    blocks: [
      { id: 'warmup', title: 'Warm-up', kind: 'notes', fields: [{ id: 'notes', label: 'Notes', type: 'textarea' }] },
      { id: 'limit', title: 'Limit problems', kind: 'problems', count: 5, problemSchema: STANDARD_BOULDERING_SCHEMA },
      { id: 'maxhang', title: 'Half-crimp max hangs', kind: 'sets', target: '4 × 10 sec / 3 min rest', fields: ['weight', 'duration', 'notes'] }
    ]
  },
  {
    _id: 'full_body_a_v1', version: 1, dayOfWeek: 2, day: 'Tuesday', title: 'Full Body A', type: 'strength', color: 'yellow', intensity: 'moderate', description: 'Full-body strength',
    exercises: [
      { id: 'squat', exerciseId: 'back_squat', name: 'Back squat', target: '3 × 4–6', unit: 'kg' },
      { id: 'bench', exerciseId: 'bench_press', name: 'Bench press', target: '3 × 4–6', unit: 'kg' },
      { id: 'rdl', exerciseId: 'romanian_deadlift', name: 'Romanian deadlift', target: '3 × 6–8', unit: 'kg' },
      { id: 'bulgarian', exerciseId: 'bulgarian_split_squat', name: 'Bulgarian split squat', target: '2 × 6–8 / leg', unit: 'kg' },
      { id: 'row', exerciseId: 'chest_supported_row', name: 'Chest-supported row', target: '2 × 8–10', unit: 'kg' },
      { id: 'pushup_plus', exerciseId: 'push_up', name: 'Push-up plus', target: '3 × 10–15', unit: 'reps' },
      { id: 'abwheel', exerciseId: 'ab_wheel', name: 'Ab wheel', target: '3 × 6–12', unit: 'reps' }
    ]
  },
  {
    _id: 'full_body_b_v1', version: 1, dayOfWeek: 4, day: 'Thursday', title: 'Full Body B', type: 'strength', color: 'yellow', intensity: 'moderate', description: 'Full-body strength',
    exercises: [
      { id: 'deadlift', exerciseId: 'conventional_deadlift', name: 'Deadlift / RDL', target: '2 × 3–5', unit: 'kg' },
      { id: 'ohp', exerciseId: 'overhead_press', name: 'Overhead press', target: '3 × 5–8', unit: 'kg' },
      { id: 'ff_split', exerciseId: 'front_foot_elevated_split_squat', name: 'Front-foot elevated split squat', target: '3 × 6–8 / leg', unit: 'kg' },
      { id: 'pullup', exerciseId: 'neutral_grip_pull_up', name: 'Neutral-grip pull-up', target: '3 × 4–6', unit: 'kg' },
      { id: 'hamcurl', exerciseId: 'hamstring_curl', name: 'Hamstring curl', target: '3 × 8–12', unit: 'kg' },
      { id: 'wallslide', exerciseId: 'serratus_wall_slide', name: 'Serratus wall slide', target: '2 × 8–10', unit: 'reps' },
      { id: 'kneeraise', exerciseId: 'hanging_knee_raise', name: 'Hanging knee raise', target: '3 × 8–12', unit: 'reps' }
    ]
  },
  {
    _id: 'set_moderate_v1', version: 1, dayOfWeek: 5, day: 'Friday', title: 'Set Bouldering — Moderate', type: 'climbing', color: 'yellow', intensity: 'moderate', description: 'Technique / moderate volume',
    blocks: [
      { id: 'warmup', title: 'Warm-up', kind: 'problems', count: 6, problemSchema: STANDARD_BOULDERING_SCHEMA },
      { id: 'technique', title: 'Technique problems', kind: 'problems', count: 8, problemSchema: STANDARD_BOULDERING_SCHEMA },
      { id: 'moderate', title: 'Moderate problems', kind: 'problems', count: 4, problemSchema: STANDARD_BOULDERING_SCHEMA }
    ]
  },
  {
    _id: 'set_light_v1', version: 1, dayOfWeek: 6, day: 'Saturday', title: 'Set Bouldering — Light', type: 'climbing', color: 'green', intensity: 'easy', description: 'Easy volume / movement',
    blocks: [
      { id: 'warmup', title: 'Warm-up', kind: 'problems', count: 5, problemSchema: STANDARD_BOULDERING_SCHEMA },
      { id: 'volume', title: 'Easy / moderate volume', kind: 'problems', count: 12, problemSchema: STANDARD_BOULDERING_SCHEMA },
      { id: 'fun', title: 'Optional fun problems', kind: 'problems', count: 2, problemSchema: STANDARD_BOULDERING_SCHEMA }
    ]
  }
];

export { workouts, STANDARD_BOULDERING_SCHEMA };
