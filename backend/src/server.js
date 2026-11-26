import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === 'production';
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const cookieName = process.env.SESSION_COOKIE_NAME || 'rt_session';
const sessions = new Map();
const states = new Map();
const STATE_TTL = 10 * 60 * 1000;
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use((req, _res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  })); next();
});
app.use('/api/keka', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
function config() {
  const { KEKA_ENVIRONMENT, KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, KEKA_REDIRECT_URI } = process.env;
  if (![KEKA_ENVIRONMENT, KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, KEKA_REDIRECT_URI].every(Boolean)) {
    const e = new Error('Keka OAuth is not configured. Set the KEKA_* environment variables.'); e.status = 503; throw e;
  }
  return { environment: KEKA_ENVIRONMENT, clientId: KEKA_CLIENT_ID, clientSecret: KEKA_CLIENT_SECRET, redirectUri: KEKA_REDIRECT_URI };
}
function sessionFor(req, create = false) {
  const id = req.cookies[cookieName];
  if (id && sessions.has(id)) return { id, data: sessions.get(id) };
  if (!create) return null;
  const newId = crypto.randomBytes(32).toString('base64url'); const data = { keka: null }; sessions.set(newId, data); return { id: newId, data };
}
function cookie(res, id) { res.cookie(cookieName, id, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 }); }
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/keka/connect', (req, res, next) => {
  try {
    const c = config(); const session = sessionFor(req, true); cookie(res, session.id);
    const state = crypto.randomBytes(32).toString('base64url'); states.set(state, { sessionId: session.id, createdAt: Date.now() });
    const url = new URL('https://login.' + c.environment + '.com/connect/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: c.redirectUri, scope: 'openid profile offline_access', state }).toString();
    res.redirect(url.toString());
  } catch (e) { next(e); }
});
app.get('/api/keka/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const saved = states.get(state); states.delete(state);
    if (!code || !saved || Date.now() - saved.createdAt > STATE_TTL) return res.status(400).send('Invalid or expired Keka authorization. Please reconnect.');
    const c = config();
    const response = await fetch('https://login.' + c.environment + '.com/connect/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, code, scope: 'openid profile offline_access' }),
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) { console.error('Keka token exchange HTTP status:', response.status); return res.status(502).send('Keka token exchange failed; check server config and Keka app settings.'); }
    const session = sessions.get(saved.sessionId); if (!session) return res.status(400).send('Session expired. Please reconnect.');
    session.keka = { accessToken: payload.access_token, refreshToken: payload.refresh_token || null, expiresAt: Date.now() + Number(payload.expires_in || 86400) * 1000, connectedAt: new Date().toISOString() };
    const target = new URL(frontendOrigin); target.searchParams.set('keka', 'connected'); res.redirect(target.toString());
  } catch (e) { next(e); }
});
app.get('/api/keka/status', (req, res) => {
  const k = sessionFor(req)?.data.keka;
  res.json({ connected: Boolean(k), connectedAt: k?.connectedAt || null, accessTokenExpiresAt: k ? new Date(k.expiresAt).toISOString() : null });
});
app.post('/api/keka/disconnect', (req, res) => {
  const session = sessionFor(req); if (session) sessions.delete(session.id);
  res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'lax', path: '/' }); res.status(204).end();
});
app.use((err, _req, res, _next) => { const status = Number(err.status) || 500; if (status === 500) console.error(err.message); res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message }); });
app.listen(port, () => console.log('Remaining Time API listening on port ' + port));
