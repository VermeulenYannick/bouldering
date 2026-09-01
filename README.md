# Bouldering Training Log

## Project structure

The frontend is intentionally split into small modules so `src/main.jsx` only mounts the app.

```text
src/
├── main.jsx                 # React entry point
├── App.jsx                  # Auth, routing, shared state orchestration
├── components/
│   ├── Calendar.jsx         # Calendar screen
│   ├── Entry.jsx            # Single-day screen
│   ├── ClimbingForm.jsx     # Bouldering workout editor
│   ├── StrengthForm.jsx     # Strength workout/editor plan
│   ├── StrengthExerciseCard.jsx
│   ├── ExercisePicker.jsx
│   └── auth/
│       ├── PinScreen.jsx
│       ├── PasskeyLogin.jsx
│       └── PasskeySetup.jsx
├── constants/
│   └── app.js               # Browser configuration and UI definitions
├── hooks/
│   └── useTrainingSync.js   # Local-first, debounced server synchronization
└── utils/
    ├── api.js               # Backend request wrapper
    ├── data.js              # Generic data helpers
    ├── dates.js             # Date/time-zone helpers
    ├── exercises.js         # Exercise/problem normalization helpers
    ├── routing.js           # URL-based SPA routing
    └── storage.js           # localStorage access
```

Workout templates and exercise catalog data remain database-backed. Strength workout definitions now include `exerciseId` values matching the exercise catalog, so the frontend no longer needs a hard-coded exercise-name-to-ID dictionary.

## Database migration

Run the existing migrations as appropriate, then run:

```bash
npm run migrate:exercises
npm run migrate:exercise-ids
```

`migrate:exercise-ids` is a data migration that adds catalog IDs to the existing strength workout templates. It should not be confused with per-day exercise replacement: replacing or adding an exercise still writes only to that day's training log.
