# Remaining Time API — Keka SSO starter

Node.js 20+ / Express backend for the React shift tracker. The root `index.js` is the Vercel Express entry point; local development uses `src/server.js`.

## Local setup

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

Configure the Keka SSO values in `.env`. Keka's SSO client ID/secret are distinct from Keka API credentials and must be requested from Keka/your CSM. SSO access is currently documented as limited to privileged partners on request. Set `KEKA_SSO_AUTHORITY` to the HTTPS authority Keka confirms for your SSO client (the docs' production example is `https://login.keka.com`). Generate `KEKA_SESSION_SECRET` as 32 random bytes encoded as 64 hexadecimal characters. Never commit `.env` or expose secrets/tokens through Vite variables. The callback URI must exactly match the URI registered with Keka.

## Vercel setup

Deploy this directory as a separate Vercel project with root directory `backend` and Node.js 20+. Set these server-side environment variables:
- `FRONTEND_ORIGIN`: exact frontend deployment origin
- `KEKA_SSO_AUTHORITY`, `KEKA_SSO_CLIENT_ID`, `KEKA_SSO_CLIENT_SECRET`
- `KEKA_SSO_REDIRECT_URI`: `https://<backend-domain>/api/keka/callback`
- `KEKA_SESSION_SECRET`: 64 hexadecimal characters

Set frontend `VITE_KEKA_API_URL` to the backend origin (no trailing slash). Redeploy both deployments after changing environment variables. Do not put secrets in `VITE_*` variables.

## Routes

- `GET /health` — liveness check.
- `GET /api/keka/connect` — starts Keka SSO authorization-code sign-in.
- `GET /api/keka/callback` — validates state and exchanges the code server-side, then verifies the signed-in user through Keka's userinfo endpoint.
- `GET /api/keka/status` — connection status and limited profile fields; never returns credentials.
- `POST /api/keka/disconnect` — clears the encrypted browser session.

## Scope and limitations

This implements Keka SSO sign-in only. SSO authenticates the employee; it does not grant permission to read timesheets or attendance. No timesheet API is called. Confirm with Keka that this SSO client is enabled for your organization and separately confirm the supported employee-scoped timesheet authorization/API permissions before adding data access. This starter stores the encrypted session in an HttpOnly cookie and does not yet implement durable server-side sessions or automatic token refresh; do not treat it as production-ready for sensitive HR data.
