# Bouldering Training Log

## Authentication

Production authentication is two-stage:

1. A registered WebAuthn/passkey must authenticate successfully.
2. The existing 6-digit PIN must then be entered.
3. The server creates a 30-day MongoDB-backed session stored behind an HttpOnly cookie.

On first setup, when no passkey exists yet, the PIN is accepted as the bootstrap factor and the app asks you to create the first passkey. After that, the passkey is required before the PIN on every new session.

### Required environment variables

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=bouldering_log
APP_PIN=123456
WEBAUTHN_RP_NAME=Training Log
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

For production replace `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` with your HTTPS domain.

### Security migration

Run once:

```bash
npm run migrate:init-security
```

It is safe to run repeatedly. It creates the TTL indexes/collections used by sessions, passkey credentials, and WebAuthn challenges. It does not delete workout or training data.

### Local run

```bash
npm install
npm run migrate:init-security
npm run build
npm start
```

Open `http://localhost:3000`.

The first run asks for the PIN and then creates the first passkey. Subsequent logins require the passkey first and then the PIN.


## Vercel deployment

This project is configured with an explicit Vercel Node function for `api/index.js` and a Vite static build.

Set these Production environment variables in Vercel:

- `MONGODB_URI`
- `MONGODB_DB`
- `APP_PIN`
- `WEBAUTHN_RP_NAME`
- `WEBAUTHN_RP_ID` (the Vercel hostname only, without `https://`)
- `WEBAUTHN_ORIGIN` (the full `https://...` origin)

After the first successful deployment, run `npm run migrate:init-security` locally against the same MongoDB Atlas database.
