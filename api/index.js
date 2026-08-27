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
async function db() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect().then((c) => c.db(DB_NAME));
  }
  return clientPromise;
}

function makeId() {
  return crypto.randomBytes(32).toString('hex');
}
function userIdBytes() {
  return crypto.createHash('sha256').update('owner-training-log').digest();
}
function cookie(name, value, maxAge, { httpOnly = true, sameSite = 'Lax', secure = IS_SECURE } = {}) {
  return `${name}=${value}; Path=/; ${httpOnly ? 'HttpOnly; ' : ''}${secure ? 'Secure; ' : ''}SameSite=${sameSite}; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`;
}
function clearCookie(name, { httpOnly = true, sameSite = 'Lax', secure = IS_SECURE } = {}) {
  return cookie(name, '', 0, { httpOnly, sameSite, secure });
}
function parseCookie(req, name) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : null;
}

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

async function requireAuth(req, res, next) {
  try {
    req.session = await getSession(req, true);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

async function requirePreauth(req) {
  const id = parseCookie(req, 'preauth');
  if (!id) throw new Error('PASSKEY_REQUIRED');
  const database = await db();
  const session = await database.collection('sessions').findOne({ _id: id, type: 'preauth', expiresAt: { $gt: new Date() } });
  if (!session) throw new Error('PASSKEY_REQUIRED');
  return session;
}

async function getPasskeys(database) {
  return database.collection('passkeys').find({ owner: 'owner' }).toArray();
}

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

app.get('/auth/me', async (req, res) => {
  try {
    const session = await getSession(req, true);
    return res.json({ ok: true, expiresAt: session.expiresAt.getTime() });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

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

app.get('/workouts', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const workouts = await database.collection('workout_definitions').find({ active: { $ne: false } }).sort({ dayOfWeek: 1, version: 1 }).toArray();
    return res.json(workouts);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

app.get('/logs/latest', requireAuth, async (req, res) => {
  try {
    const database = await db();
    const doc = await database.collection('training_logs').findOne({ _id: 'owner_latest' });
    return res.json(doc?.payload || null);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

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

app.get('/logs/exercise/:exerciseId', requireAuth, async (req, res) => {
  const { exerciseId } = req.params;
  const before = String(req.query.before || '9999-12-31');
  try {
    const database = await db();
    const latest = await database.collection('training_logs').findOne({ _id: 'owner_latest' });
    const logs = latest?.payload?.logs || {};
    const matches = Object.entries(logs).filter(([date, log]) => date < before && log?.data?.exercises?.[exerciseId]).sort(([a], [b]) => b.localeCompare(a));
    if (!matches.length) return res.json(null);
    const [date, log] = matches[0];
    return res.json({ date, workoutId: log.workoutId, workoutVersion: log.workoutVersion, entry: log.data.exercises[exerciseId] });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Database error' }); }
});

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
