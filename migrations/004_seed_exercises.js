import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bouldering_log';

const liftingExercises = [
  { _id: "back_squat", name: "Back squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "front_squat", name: "Front squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "goblet_squat", name: "Goblet squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "hack_squat", name: "Hack squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "leg_press", name: "Leg press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "bulgarian_split_squat", name: "Bulgarian split squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "reverse_lunge", name: "Reverse lunge", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "walking_lunge", name: "Walking lunge", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "step_up", name: "Step-up", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "front_foot_elevated_split_squat", name: "Front-foot elevated split squat", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "hip_thrust", name: "Hip thrust", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "barbell_glute_bridge", name: "Barbell glute bridge", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "romanian_deadlift", name: "Romanian deadlift", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "stiff_leg_deadlift", name: "Stiff-leg deadlift", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "conventional_deadlift", name: "Conventional deadlift", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "trap_bar_deadlift", name: "Trap-bar deadlift", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "sumo_deadlift", name: "Sumo deadlift", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "good_morning", name: "Good morning", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "hamstring_curl", name: "Hamstring curl", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "nordic_curl", name: "Nordic hamstring curl", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "back_extension", name: "Back extension", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "calf_raise", name: "Standing calf raise", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "seated_calf_raise", name: "Seated calf raise", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "bench_press", name: "Bench press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "incline_bench_press", name: "Incline bench press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "dumbbell_bench_press", name: "Dumbbell bench press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "dumbbell_incline_press", name: "Dumbbell incline press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "overhead_press", name: "Overhead press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "seated_dumbbell_press", name: "Seated dumbbell press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "landmine_press", name: "Landmine press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "push_up", name: "Push-up", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "dip", name: "Dip", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "close_grip_bench", name: "Close-grip bench press", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "cable_fly", name: "Cable fly", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "dumbbell_fly", name: "Dumbbell fly", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "pull_up", name: "Pull-up", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "neutral_grip_pull_up", name: "Neutral-grip pull-up", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "chin_up", name: "Chin-up", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "lat_pulldown", name: "Lat pulldown", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "chest_supported_row", name: "Chest-supported row", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "cable_row", name: "Seated cable row", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "one_arm_dumbbell_row", name: "One-arm dumbbell row", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "barbell_row", name: "Barbell row", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "face_pull", name: "Face pull", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "rear_delt_fly", name: "Rear-delt fly", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "lateral_raise", name: "Lateral raise", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "cable_lateral_raise", name: "Cable lateral raise", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "biceps_curl", name: "Biceps curl", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "hammer_curl", name: "Hammer curl", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "triceps_pushdown", name: "Triceps pushdown", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "overhead_triceps_extension", name: "Overhead triceps extension", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "ab_wheel", name: "Ab wheel", type: 'lifting', defaultSets: 3, unit: 'kg' },
  { _id: "hanging_knee_raise", name: "Hanging knee raise", type: 'lifting', defaultSets: 3, unit: 'kg' },
];

const climbingExercises = [
  { _id: "half_crimp_max_hang", name: "Half-crimp max hang", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "open_hand_max_hang", name: "Open-hand max hang", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "three_finger_drag_max_hang", name: "Three-finger drag max hang", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "pinch_block_hold", name: "Pinch block hold", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "pinch_lift", name: "Pinch lift", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "repeaters_half_crimp", name: "Half-crimp repeaters", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "repeaters_open_hand", name: "Open-hand repeaters", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "finger_extensor_band", name: "Finger extensor band opens", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "wrist_curl", name: "Wrist curl", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "reverse_wrist_curl", name: "Reverse wrist curl", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "rice_bucket", name: "Rice-bucket hand work", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "scapular_pull_up", name: "Scapular pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "scapular_push_up", name: "Scapular push-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "serratus_wall_slide", name: "Serratus wall slide", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "band_pull_apart", name: "Band pull-apart", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "face_pull_climbing", name: "Face pull", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "external_rotation_band", name: "Band external rotation", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "prone_y_raise", name: "Prone Y raise", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "prone_t_raise", name: "Prone T raise", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "dead_hang", name: "Dead hang", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "active_hang", name: "Active hang", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "lock_off_90", name: "90-degree lock-off", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "lock_off_120", name: "120-degree lock-off", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "one_arm_lock_off", name: "One-arm lock-off", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "assisted_one_arm_pull_up", name: "Assisted one-arm pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "weighted_pull_up", name: "Weighted pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "strict_pull_up", name: "Strict pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "chest_to_bar_pull_up", name: "Chest-to-bar pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "archer_pull_up", name: "Archer pull-up", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "campus_ladder", name: "Campus ladder", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "campus_max_reach", name: "Campus max reach", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "campus_bumps", name: "Campus bumps", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "campus_double_dynos", name: "Campus double dynos", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "campus_touch_go", name: "Campus touch-and-go", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "foot_on_campus", name: "Foot-on campus", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "board_limit_bouldering", name: "Board limit bouldering", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "spray_wall_limit", name: "Spray wall limit bouldering", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "spray_wall_volume", name: "Spray wall volume", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "system_wall_power", name: "System wall power", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "system_wall_power_endurance", name: "System wall power-endurance", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "four_by_four", name: "4x4 bouldering", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "density_bouldering", name: "Density bouldering", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "arc_style_climbing", name: "ARC-style easy climbing", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "silent_feet_drill", name: "Silent feet drill", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "downclimb_drill", name: "Downclimb drill", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "hover_hand_drill", name: "Hover-hand drill", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "one_move_repeat", name: "One-move repeat drill", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "limit_move_repeats", name: "Limit move repeats", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "core_bodyline", name: "Hollow-body hold", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "dead_bug", name: "Dead bug", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "pallof_press", name: "Pallof press", type: 'climbing', defaultSets: 3, unit: 'reps' },
  { _id: "side_plank", name: "Side plank", type: 'climbing', defaultSets: 3, unit: 'reps' },
];

async function main(){
  if(!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const client = await MongoClient.connect(MONGODB_URI);
  try {
    const db = client.db(DB_NAME);
    for (const [name, docs] of [['lifting_exercises', liftingExercises], ['climbing_exercises', climbingExercises]]) {
      const collection = db.collection(name);
      await collection.createIndex({ name: 1 });
      await collection.createIndex({ name: 1, _id: 1 });
      for (const doc of docs) {
        await collection.updateOne({ _id: doc._id }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      }
      console.log(`${name}: ${docs.length} exercises seeded`);
    }
  } finally { await client.close(); }
}
main().catch(err=>{ console.error(err); process.exit(1); });
