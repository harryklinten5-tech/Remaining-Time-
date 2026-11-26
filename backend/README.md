# Remaining Time API — Keka OAuth starter

Node.js 20+ / Express backend for the React shift tracker.

## Local setup

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

Set the Keka OAuth values in `.env`. Never commit `.env` or expose the client secret/tokens through Vite variables. The Keka App Portal redirect URI must exactly match `KEKA_REDIRECT_URI`. Set `FRONTEND_ORIGIN` to the frontend origin.

## Routes

- `GET /health` — liveness check.
- `GET /api/keka/connect` — starts authorization-code flow.
- `GET /api/keka/callback` — validates state and exchanges the code server-side.
- `GET /api/keka/status` — connection metadata only; never returns credentials.
- `POST /api/keka/disconnect` — clears the local connection.

## Not production-ready yet

This is a backend starter, not completed attendance sync. Attendance API documentation/permissions were not provided, so no attendance endpoint is called. Verify the exact authorization URL, scopes, and tenant-specific host against Keka App Portal before live use.

Session and OAuth state are stored in process memory. Restarting the server loses the connection; multiple instances do not share sessions. Before production, replace these maps with a shared durable session/token store, encrypt tokens at rest, implement refresh-token rotation, add CSRF protection to state-changing routes, and use HTTPS. Do not deploy this memory-backed session implementation as a multi-instance production service.

The token endpoint uses the host pattern from the provided Keka docs. Confirm both OAuth endpoints and the exact scopes against your tenant configuration.