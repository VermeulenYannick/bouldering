import express from 'express';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();

// Vercel routes /api/* to this Express function. Strip the /api prefix
// when it is still present so the existing Express routes continue to match.
app.use((req, _res, next) => {
  if (req.url === '/api') {
    req.url = '/';
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4);
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

const PIN = process.env.APP_PIN;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bouldering_log';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Training Log';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PREAUTH_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const IS_SECURE = ORIGIN.startsWith('https://') || process.env.NODE_ENV === 'production';

let clientPromise;
/** Lazily create and reuse the MongoDB connection for this serverless instance. */
async function db() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect().then((c) => c.db(DB_NAME));
  }
  return clientPromise;
}

/** Generate a cryptographically random identifier for sessions and WebAuthn transactions. */
function makeId() {
  return crypto.randomBytes(32).toString('hex');
}
/** Produce the stable internal WebAuthn user identifier for the single app owner. */
function userIdBytes() {
  return crypto.createHash('sha256').update('owner-training-log').digest();
}
/** Build a Set-Cookie header with the security flags used by the application. */
function cookie(name, value, maxAge, { httpOnly = true, sameSite = 'Lax', secure = IS_SECURE } = {}) {
  return `${name}=${value}; Path=/; ${httpOnly ? 'HttpOnly; ' : ''}${secure ? 'Secure; ' : ''}SameSite=${sameSite}; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`;
}
/** Build an expired cookie header that removes an existing application cookie. */
function clearCookie(name, { httpOnly = true, sameSite = 'Lax', secure = IS_SECURE } = {}) {
  return cookie(name, '', 0, { httpOnly, sameSite, secure });
}
/** Extract one named cookie from the incoming request's Cookie header. */
function parseCookie(req, name) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : null;
}

/** Load and optionally require a valid authenticated session from MongoDB. */
async function getSession(req, required = true) {
  const id = parseCookie(req, 'session');
  if (!id) {
    if (required) throw new Error('UNAUTHORIZED');
    return null;
  }
  const database = await db();
  const session = await database.collection('sessions').findOne({ _id: id, type: 'auth', expiresAt: { $gt: new Date() } });
  if (!session) {
    if (required) throw new Error('UNAUTHORIZED');
    return null;
  }
  return session;
}

/** Express middleware that blocks protected routes unless a valid session exists. */
async function requireAuth(req, res, next) {
  try {
    req.session = await getSession(req, true);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/** Require the short-lived session created immediately after successful passkey verification. */
async function requirePreauth(req) {
  const id = parseCookie(req, 'preauth');
  if (!id) throw new Error('PASSKEY_REQUIRED');
  const database = await db();
  const session = await database.collection('sessions').findOne({ _id: id, type: 'preauth', expiresAt: { $gt: new Date() } });
  if (!session) throw new Error('PASSKEY_REQUIRED');
  return session;
}

/** Load all registered passkey credentials for the single app owner. */
async function getPasskeys(database) {
  return database.collection('passkeys').find({ owner: 'owner' }).toArray();
}

/** Report authentication state so the frontend can choose the correct security gate. */
app.get('/auth/status', async (req, res) => {
  try {
    const database = await db();
    const passkeys = await getPasskeys(database);
    const session = await getSession(req, false);
    res.json({ authenticated: Boolean(session), passkeyConfigured: passkeys.length > 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auth status unavailable' });
  }
});

/** Return the current authenticated session metadata to the client. */
app.get('/auth/me', async (req, res) => {
  try {
    const session = await getSession(req, true);
    return res.json({ ok: true, expiresAt: session.expiresAt.getTime() });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

/** Verify the PIN after passkey pre-auth and create a long-lived authenticated session. */
app.post('/auth/login', async (req, res) => {
  if (!PIN) return res.status(500).json({ error: 'APP_PIN is not configured' });
  const supplied = String(req.body?.pin || '');
  if (supplied.length !== PIN.length || supplied !== PIN) return res.status(401).json({ error: 'Wrong PIN' });

  try {
    const database = await db();
    const passkeys = await getPasskeys(database);

    if (passkeys.length > 0) {
      await requirePreauth(req);
    }

    const sessionId = makeId();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await database.collection('sessions').insertOne({ _id: sessionId, type: 'auth', owner: 'owner', createdAt: new Date(), expiresAt });

    const headers = [cookie('session', sessionId, SESSION_TTL_MS), clearCookie('preauth')];
    res.setHeader('Set-Cookie', headers);
    return res.json({ ok: true, needsPasskeySetup: passkeys.length === 0, expiresAt: expiresAt.getTime() });
  } catch (e) {
    if (e.message === 'PASSKEY_REQUIRED') return res.status(401).json({ error: 'Passkey authentication required' });
    console.error(e);
    return res.status(500).json({ error: 'Auth error' });
  }
});

/** Revoke the current authenticated session and clear auth cookies. */
app.post('/auth/logout', async (req, res) => {
  try {
    const id = parseCookie(req, 'session');
    if (id) {
      const database = await db();
      await database.collection('sessions').deleteOne({ _id: id, type: 'auth' });
    }
  } catch (e) { console.error(e); }
  res.setHeader('Set-Cookie', [clearCookie('session'), clearCookie('preauth')]);
  res.json({ ok: true });
});

/** Create and store the WebAuthn challenge used to start passkey authentication. */
app.get('/auth/passkey/login/options', async (req, res) => {
  try {
    const database = await db();
    const passkeys = await getPasskeys(database);
    if (!passkeys.length) return res.status(409).json({ error: 'No passkey is registered yet' });
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: passkeys.map((p) => ({ id: p._id, transports: p.transports || undefined })),
    });
    const txId = makeId();
    await database.collection('webauthn_challenges').insertOne({ _id: txId, type: 'authentication', challenge: options.challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
    res.setHeader('Set-Cookie', cookie('webauthn_tx', txId, CHALLENGE_TTL_MS, { sameSite: 'Strict' }));
    res.json(options);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Could not start passkey login' });
  }
});

/** Verify a WebAuthn assertion and convert it into a short-lived pre-auth session. */
app.post('/auth/passkey/login/verify', async (req, res) => {
  try {
    const txId = parseCookie(req, 'webauthn_tx');
    if (!txId) return res.status(400).json({ error: 'Passkey challenge expired' });
    const database = await db();
    const challengeDoc = await database.collection('webauthn_challenges').findOne({ _id: txId, type: 'authentication', expiresAt: { $gt: new Date() } });
    if (!challengeDoc) return res.status(400).json({ error: 'Passkey challenge expired' });

    const credentialId = req.body?.id;
    const stored = credentialId ? await database.collection('passkeys').findOne({ _id: credentialId, owner: 'owner' }) : null;
    if (!stored) return res.status(401).json({ error: 'Unknown passkey' });

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: stored._id,
        publicKey: Buffer.from(stored.publicKey, 'base64'),
        counter: stored.counter,
        transports: stored.transports || undefined,
      },
    });

    if (!verification.verified) return res.status(401).json({ error: 'Passkey verification failed' });
    await database.collection('passkeys').updateOne({ _id: stored._id }, { $set: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    await database.collection('webauthn_challenges').deleteOne({ _id: txId });

    const preauthId = makeId();
    await database.collection('sessions').insertOne({ _id: preauthId, type: 'preauth', owner: 'owner', auth: 'passkey', createdAt: new Date(), expiresAt: new Date(Date.now() + PREAUTH_TTL_MS) });
    res.setHeader('Set-Cookie', [cookie('preauth', preauthId, PREAUTH_TTL_MS), clearCookie('webauthn_tx', { sameSite: 'Strict' })]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: e.message || 'Passkey authentication failed' });
  }
});

/** Create the WebAuthn registration challenge for adding a new owner credential. */
app.get('/auth/passkey/register/options', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const passkeys = await getPasskeys(database);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new Uint8Array(userIdBytes()),
      userName: 'owner',
      userDisplayName: 'Training Log Owner',
      attestationType: 'none',
      excludeCredentials: passkeys.map((p) => ({ id: p._id, transports: p.transports || undefined })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    const txId = makeId();
    await database.collection('webauthn_challenges').insertOne({ _id: txId, type: 'registration', challenge: options.challenge, owner: 'owner', expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
    res.setHeader('Set-Cookie', cookie('webauthn_tx', txId, CHALLENGE_TTL_MS, { sameSite: 'Strict' }));
    res.json(options);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Could not start passkey registration' });
  }
});

/** Verify and persist a newly registered passkey credential. */
app.post('/auth/passkey/register/verify', requireAuth, async (req, res) => {
  try {
    const txId = parseCookie(req, 'webauthn_tx');
    if (!txId) return res.status(400).json({ error: 'Passkey registration challenge expired' });
    const database = await db();
    const challengeDoc = await database.collection('webauthn_challenges').findOne({ _id: txId, type: 'registration', owner: 'owner', expiresAt: { $gt: new Date() } });
    if (!challengeDoc) return res.status(400).json({ error: 'Passkey registration challenge expired' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) return res.status(400).json({ error: 'Passkey registration failed' });

    const info = verification.registrationInfo;
    const credentialId = info.credential.id;
    const publicKey = Buffer.from(info.credential.publicKey).toString('base64');
    await database.collection('passkeys').updateOne(
      { _id: credentialId },
      { $set: {
        owner: 'owner',
        publicKey,
        counter: info.credential.counter,
        transports: req.body?.response?.transports || [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        updatedAt: new Date(),
      }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    await database.collection('webauthn_challenges').deleteOne({ _id: txId });
    res.setHeader('Set-Cookie', clearCookie('webauthn_tx', { sameSite: 'Strict' }));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Passkey registration failed' });
  }
});

/** Query the appropriate exercise catalog for the replace/add exercise picker. */
app.get('/exercises', requireAuth, async (req, res) => {
  try {
    const type = String(req.query.type || 'lifting').toLowerCase();
    const q = String(req.query.q || '').trim();
    const collectionName = type === 'climbing' ? 'climbing_exercises' : 'lifting_exercises';
    const database = await db();
    const filter = q ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
    const exercises = await database.collection(collectionName).find(filter).sort({ name: 1 }).limit(100).toArray();
    res.json(exercises);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Exercise catalog unavailable' }); }
});

/**
 * Return the reusable workout templates used by management screens.
 * Schedule information is included only as metadata and does not mutate the template.
 */
app.get('/workout-templates', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const workouts = await database.collection('workout_definitions')
      .find({ active: { $ne: false } })
      .sort({ title: 1 })
      .toArray();
    return res.json(workouts);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

/** Load one reusable workout template for the editor. */
app.get('/workout-templates/:id', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const workout = await database.collection('workout_definitions').findOne({ _id: String(req.params.id), active: { $ne: false } });
    if (!workout) return res.status(404).json({ error: 'Workout template not found' });
    return res.json(workout);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

/** Validate that every exercise in a workout template carries a stable catalog ID. */
function validateExerciseIds(type, exercises) {
  if (!Array.isArray(exercises)) return { ok: true };
  if (type !== 'strength') return { ok: true };
  const invalid = exercises.find((exercise) => !exercise?.exerciseId || typeof exercise.exerciseId !== 'string' || !exercise.exerciseId.trim());
  return invalid ? { ok: false, error: 'Every gym exercise must have a catalog exerciseId.' } : { ok: true };
}

/** Create a new reusable workout template. */
app.post('/workout-templates', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const title = String(req.body?.title || '').trim();
    const type = req.body?.type === 'climbing' ? 'climbing' : 'strength';
    if (!title) return res.status(400).json({ error: 'Workout name is required' });
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];
    const exerciseValidation = validateExerciseIds(type, exercises);
    if (!exerciseValidation.ok) return res.status(400).json({ error: exerciseValidation.error });

    const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'workout'}_${makeId().slice(0, 10)}`;
    const doc = {
      _id: id,
      version: 1,
      title,
      type,
      color: ['red', 'yellow', 'green'].includes(req.body?.color) ? req.body.color : 'yellow',
      intensity: ['hard', 'moderate', 'easy'].includes(req.body?.intensity) ? req.body.intensity : ({ red: 'hard', yellow: 'moderate', green: 'easy' }[req.body?.color] || 'moderate'),
      description: String(req.body?.description || ''),
      exercises,
      blocks: Array.isArray(req.body?.blocks) ? req.body.blocks : [],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await database.collection('workout_definitions').insertOne(doc);
    return res.status(201).json(doc);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Could not create workout template' }); }
});

/** Update a reusable workout template without touching any date-specific logs. */
app.put('/workout-templates/:id', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const id = String(req.params.id);
    const current = await database.collection('workout_definitions').findOne({ _id: id, active: { $ne: false } });
    if (!current) return res.status(404).json({ error: 'Workout template not found' });

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Workout name is required' });
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];
    const type = req.body?.type === 'climbing' ? 'climbing' : 'strength';
    const exerciseValidation = validateExerciseIds(type, exercises);
    if (!exerciseValidation.ok) return res.status(400).json({ error: exerciseValidation.error });

    const patch = {
      title,
      type,
      color: ['red', 'yellow', 'green'].includes(req.body?.color) ? req.body.color : 'yellow',
      intensity: ['hard', 'moderate', 'easy'].includes(req.body?.intensity) ? req.body.intensity : ({ red: 'hard', yellow: 'moderate', green: 'easy' }[req.body?.color] || 'moderate'),
      description: String(req.body?.description || ''),
      exercises,
      blocks: Array.isArray(req.body?.blocks) ? req.body.blocks : [],
      version: Number(current.version || 1) + 1,
      updatedAt: new Date(),
    };
    await database.collection('workout_definitions').updateOne({ _id: id }, { $set: patch });
    return res.json({ ...current, ...patch });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Could not update workout template' }); }
});

/** Archive a reusable workout and remove it from all weekly schedule slots. */
app.delete('/workout-templates/:id', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const id = String(req.params.id);
    const result = await database.collection('workout_definitions').updateOne({ _id: id }, { $set: { active: false, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Workout template not found' });
    await database.collection('workout_schedule').updateMany({ workoutId: id }, { $set: { workoutId: null, updatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Could not archive workout template' }); }
});

/**
 * Return the current Monday-Sunday schedule. If the schedule collection has
 * not been migrated yet, derive the initial schedule from legacy dayOfWeek fields.
 */
app.get('/workout-schedule', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const collection = database.collection('workout_schedule');
    const saved = await collection.find({}).sort({ dayOfWeek: 1 }).toArray();
    if (!saved.length) {
      const legacy = await database.collection('workout_definitions').find({ active: { $ne: false }, dayOfWeek: { $exists: true } }).toArray();
      return res.json(Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        workoutId: legacy.find((workout) => Number(workout.dayOfWeek) === dayOfWeek)?._id || null,
      })));
    }
    const byDay = new Map(saved.map((item) => [Number(item.dayOfWeek), item.workoutId || null]));
    return res.json(Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, workoutId: byDay.get(dayOfWeek) || null })));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Could not load workout schedule' }); }
});

/** Assign one reusable workout template (or rest) to a weekday. */
app.put('/workout-schedule/:dayOfWeek', requireAuth, async (req, res) => {
  try {
    const dayOfWeek = Number(req.params.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return res.status(400).json({ error: 'Invalid weekday' });
    const workoutId = req.body?.workoutId ? String(req.body.workoutId) : null;
    const database = await db();
    if (workoutId) {
      const workout = await database.collection('workout_definitions').findOne({ _id: workoutId, active: { $ne: false } });
      if (!workout) return res.status(400).json({ error: 'Workout template not found' });
    }
    await database.collection('workout_schedule').updateOne(
      { _id: `weekday_${dayOfWeek}` },
      { $set: { dayOfWeek, workoutId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return res.json({ dayOfWeek, workoutId });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Could not save workout schedule' }); }
});

/** Return active templates with the schedule days on which each is assigned. */
app.get('/workouts', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const templates = await database.collection('workout_definitions').find({ active: { $ne: false } }).sort({ title: 1 }).toArray();
    const saved = await database.collection('workout_schedule').find({}).toArray();
    const scheduleDays = new Map();
    saved.forEach((item) => {
      if (item.workoutId) {
        const days = scheduleDays.get(item.workoutId) || [];
        days.push(Number(item.dayOfWeek));
        scheduleDays.set(item.workoutId, days);
      }
    });
    const hasSchedule = saved.length > 0;
    return res.json(templates.map((template) => {
      const days = hasSchedule ? (scheduleDays.get(template._id) || []) : (template.dayOfWeek === undefined ? [] : [Number(template.dayOfWeek)]);
      return { ...template, scheduleDays: days, dayOfWeek: days[0] };
    }));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

/** Return the latest complete owner training log used for synchronization. */
app.get('/logs/latest', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const doc = await database.collection('training_logs').findOne({ _id: 'owner_latest' });
    return res.json(doc?.payload || null);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

/** Find the most recent previous bouldering entry for a specific workout template. */
app.get('/logs/bouldering/:workoutId', requireAuth, async (req, res) => {
  const { workoutId } = req.params;
  const before = String(req.query.before || '9999-12-31');
  try {
    const database = await db();
    const latest = await database.collection('training_logs').findOne({ _id: 'owner_latest' });
    const logs = latest?.payload?.logs || {};
    const matches = Object.entries(logs).filter(([date, log]) => date < before && log?.workoutId === workoutId).sort(([a], [b]) => b.localeCompare(a));
    if (!matches.length) return res.json(null);
    const [date, log] = matches[0];
    const blocks = Object.entries(log.data?.blocks || {}).map(([id, block]) => ({ id, ...block })).filter((block) => Array.isArray(block.problems));
    return res.json({ date, workoutId: log.workoutId, workoutVersion: log.workoutVersion, blocks });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

/**
 * Find the most recent previous strength entry for a specific catalog exercise
 * at the same workout intensity as the current session.
 *
 * Historical logs that do not contain a stable exerciseId are intentionally
 * ignored. This prevents accidental comparisons caused by renamed exercises,
 * old slot keys, or fuzzy name matching. The workout intensity is resolved
 * from the logged workout template, so a hard squat is never compared with a
 * moderate/easy squat.
 */
app.get('/logs/exercise/:exerciseId', requireAuth, async (req, res) => {
  const { exerciseId } = req.params;
  const before = String(req.query.before || '9999-12-31');
  const requestedIntensity = String(req.query.intensity || '').trim().toLowerCase();

  if (!exerciseId) return res.status(400).json({ error: 'Exercise ID is required' });

  try {
    const database = await db();
    const latest = await database.collection('training_logs').findOne({ _id: 'owner_latest' });
    const logs = latest?.payload?.logs || {};

    // Resolve the intensity of every workout template that appears in the log.
    // Intensity is a first-class template property; color is only retained as
    // a legacy fallback for older templates that pre-date the intensity field.
    const workoutIds = [...new Set(Object.values(logs)
      .map((log) => log?.workoutId)
      .filter(Boolean)
      .map(String))];

    const definitions = workoutIds.length
      ? await database.collection('workout_definitions')
          .find({ _id: { $in: workoutIds }, type: 'strength' })
          .project({ _id: 1, intensity: 1, color: 1 })
          .toArray()
      : [];

    const intensityByWorkoutId = new Map(definitions.map((workout) => [
      String(workout._id),
      String(workout.intensity || ({ red: 'hard', yellow: 'moderate', green: 'easy' }[workout.color] || '')).toLowerCase(),
    ]));

    const matches = Object.entries(logs)
      .filter(([date, log]) => {
        if (date >= before || !log || log.workoutId == null) return false;

        // Only compare against strength workouts at the requested intensity.
        const logIntensity = intensityByWorkoutId.get(String(log.workoutId));
        if (!logIntensity || !requestedIntensity || logIntensity !== requestedIntensity) return false;

        const exercises = log.data?.exercises;
        if (!exercises || typeof exercises !== 'object') return false;

        // Stable-ID-only comparison. Legacy entries without exerciseId are ignored.
        return Object.values(exercises).some((entry) => entry?.exerciseId === exerciseId);
      })
      .sort(([a], [b]) => b.localeCompare(a));

    if (!matches.length) return res.json(null);

    const [date, log] = matches[0];
    const entry = Object.values(log.data?.exercises || {})
      .find((item) => item?.exerciseId === exerciseId);

    if (!entry) return res.json(null);

    return res.json({
      date,
      workoutId: log.workoutId,
      workoutVersion: log.workoutVersion,
      intensity: intensityByWorkoutId.get(String(log.workoutId)),
      entry,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Database error' });
  }
});

/** Persist the complete local training state when it is newer than the server copy. */
app.put('/logs', requireAuth, async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload.updatedAt !== 'number' || !payload.logs) return res.status(400).json({ error: 'Invalid payload' });
  try {
    const database = await db();
    const col = database.collection('training_logs');
    const current = await col.findOne({ _id: 'owner_latest' });
    if (current?.payload?.updatedAt && current.payload.updatedAt > payload.updatedAt) return res.json({ ok: true, updated: false, updatedAt: current.payload.updatedAt });
    await col.updateOne({ _id: 'owner_latest' }, { $set: { payload, savedAt: Date.now() } }, { upsert: true });
    return res.json({ ok: true, updated: true, updatedAt: payload.updatedAt });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

export default app;
