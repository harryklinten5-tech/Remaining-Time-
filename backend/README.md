# Remaining Time API — Keka OAuth starter

Node.js 20+ / Express backend for the React shift tracker. The root `index.js` is the Vercel Express entry point; local development uses `src/server.js`.

## Local setup

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

Set the Keka OAuth values in `.env`. Generate `KEKA_SESSION_SECRET` as 32 random bytes encoded as 64 hexadecimal characters. Never commit `.env` or expose the client secret/session secret/tokens through Vite variables. The Keka App Portal redirect URI must exactly match `KEKA_REDIRECT_URI`. Set `FRONTEND_ORIGIN` to the exact frontend origin.

## Vercel setup

Deploy this directory as a separate Vercel project with root directory `backend` and Node.js 20+. Set these server-side environment variables for Preview:
- `FRONTEND_ORIGIN`: exact Vercel frontend preview origin
- `KEKA_ENVIRONMENT`, `KEKA_CLIENT_ID`, `KEKA_CLIENT_SECRET`
- `KEKA_REDIRECT_URI`: `https://<backend-domain>/api/keka/callback`
- `KEKA_SESSION_SECRET`: 64 hexadecimal characters

Set the frontend Vercel Preview variable `VITE_KEKA_API_URL` to the backend deployment origin (no trailing slash), then redeploy the frontend. Register the exact backend callback URL in the Keka OAuth app. Do not put any secrets in `VITE_*` variables.

## Routes

- `GET /health` — liveness check.
- `GET /api/keka/connect` — starts authorization-code flow.
- `GET /api/keka/callback` — validates state and exchanges the code server-side.
- `GET /api/keka/status` — connection metadata only; never returns credentials.
- `POST /api/keka/disconnect` — clears the encrypted browser session.

## Important limitations

OAuth state and token data are encrypted into HttpOnly, Secure (in production), SameSite=Lax cookies so the flow does not depend on process-local memory across serverless invocations. Configure a strong unique `KEKA_SESSION_SECRET` and HTTPS. Tokens are not refreshed automatically yet, and no attendance API is called; attendance sync requires Keka's documented API endpoints and scopes. Confirm the authorization/token host pattern and scopes for your tenant before live use. This is a test integration, not production-ready payroll/attendance sync.
