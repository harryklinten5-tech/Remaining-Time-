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
const cookieName = process.env.SESSION_COOKIE_NAME || 'rt_keka_session';
const stateCookieName = cookieName + '_state';
const STATE_TTL = 10 * 60 * 1000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use((req, _res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
  next();
});
app.use('/api/keka', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

function config() {
  const { KEKA_SSO_AUTHORITY, KEKA_SSO_CLIENT_ID, KEKA_SSO_CLIENT_SECRET, KEKA_SSO_REDIRECT_URI, KEKA_SESSION_SECRET } = process.env;
  if (![KEKA_SSO_AUTHORITY, KEKA_SSO_CLIENT_ID, KEKA_SSO_CLIENT_SECRET, KEKA_SSO_REDIRECT_URI, KEKA_SESSION_SECRET].every(Boolean)) {
    const e = new Error('Keka SSO is not configured. Set the required KEKA_SSO_* environment variables.'); e.status = 503; throw e;
  }
  let authority;
  try {
    const parsed = new URL(KEKA_SSO_AUTHORITY);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    authority = parsed.origin;
  } catch {
    const e = new Error('KEKA_SSO_AUTHORITY must be an HTTPS origin, for example https://login.keka.com.'); e.status = 503; throw e;
  }
  if (!/^[a-f0-9]{64}$/i.test(KEKA_SESSION_SECRET)) {
    const e = new Error('KEKA_SESSION_SECRET must be 64 hexadecimal characters.'); e.status = 503; throw e;
  }
  return {
    authority,
    clientId: KEKA_SSO_CLIENT_ID,
    clientSecret: KEKA_SSO_CLIENT_SECRET,
    redirectUri: KEKA_SSO_REDIRECT_URI,
    sessionKey: Buffer.from(KEKA_SESSION_SECRET, 'hex')
  };
}
function seal(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function unseal(value, key) {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { return null; }
}
function cookieOptions(maxAge) {
  return { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge };
}
function setSealedCookie(res, name, value, key, maxAge) {
  const encoded = seal(value, key);
  if (encoded.length > 3800) {
    const e = new Error('Keka token response is too large to store securely in a browser session.'); e.status = 502; throw e;
  }
  res.cookie(name, encoded, cookieOptions(maxAge));
}
function clearCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
}
function sessionFrom(req, key) {
  return unseal(req.cookies[cookieName], key);
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/keka/connect', (req, res, next) => {
  try {
    const c = config();
    const state = crypto.randomBytes(32).toString('base64url');
    setSealedCookie(res, stateCookieName, { state, createdAt: Date.now() }, c.sessionKey, STATE_TTL);
    const url = new URL('/connect/authorize', c.authority);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      scope: 'openid',
      state
    }).toString();
    res.redirect(url.toString());
  } catch (e) { next(e); }
});

app.get('/api/keka/callback', async (req, res, next) => {
  try {
    const c = config();
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const saved = unseal(req.cookies[stateCookieName], c.sessionKey);
    clearCookie(res, stateCookieName);
    if (!code || !state || !saved || saved.state !== state || Date.now() - saved.createdAt > STATE_TTL) {
      return res.status(400).send('Invalid or expired Keka authorization. Please reconnect.');
    }

    const response = await fetch(new URL('/connect/token', c.authority), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: c.redirectUri,
        code,
        scope: 'openid'
      }),
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      console.error('Keka token exchange HTTP status:', response.status);
      return res.status(502).send('Keka token exchange failed. Check the OAuth app settings and callback URL.');
    }

    const profileResponse = await fetch(new URL('/connect/userinfo', c.authority), {
      headers: { authorization: `Bearer ${payload.access_token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || typeof profile.sub !== 'string' || !profile.sub) {
      console.error('Keka SSO userinfo HTTP status:', profileResponse.status);
      return res.status(502).send('Keka sign-in succeeded but the user profile could not be verified.');
    }
    const session = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || null,
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
      connectedAt: new Date().toISOString(),
      user: { sub: profile.sub, email: typeof profile.email === 'string' ? profile.email : null, name: typeof profile.name === 'string' ? profile.name : null }
    };
    setSealedCookie(res, cookieName, session, c.sessionKey, Math.min(Number(payload.expires_in || 86400) * 1000, 7 * 86400000));
    const target = new URL(frontendOrigin);
    target.searchParams.set('keka', 'connected');
    res.redirect(target.toString());
  } catch (e) { next(e); }
});

app.get('/api/keka/status', (req, res, next) => {
  try {
    const c = config();
    const session = sessionFrom(req, c.sessionKey);
    const connected = Boolean(session?.accessToken && session.expiresAt > Date.now());
    res.json({ connected, connectedAt: connected ? session.connectedAt : null, user: connected ? session.user : null, accessTokenExpiresAt: connected ? new Date(session.expiresAt).toISOString() : null });
  } catch (e) { next(e); }
});

app.post('/api/keka/disconnect', (_req, res) => {
  clearCookie(res, cookieName);
  clearCookie(res, stateCookieName);
  res.status(204).end();
});

app.use((err, _req, res, _next) => {
  const status = Number(err.status) || 500;
  if (status === 500) console.error(err.message);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

export default app;
if (!process.env.VERCEL) {
  app.listen(port, () => console.log('Remaining Time API listening on port ' + port));
}
