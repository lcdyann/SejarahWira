import crypto from 'crypto';

/**
 * ============================================================================
 * utils/authToken.js
 * Small signed login token (HMAC-SHA256, no extra packages).
 * Format:  base64url(payload) + "." + base64url(signature)
 * The payload carries { userID, role, teacherID | studentID, exp }.
 * Anyone can read it, but nobody can change it without the secret.
 *
 * Set AUTH_SECRET in the environment (long random string). Without it a random secret is
 * created at startup, so every server restart logs everyone out.
 * ============================================================================
 */

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) {
  console.warn('[auth] AUTH_SECRET is not set: using a temporary secret (logins reset on restart).');
}

const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

/** @param ttlSeconds token lifetime (default 8 hours) */
export const signToken = (payload, ttlSeconds = 8 * 60 * 60) => {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  })).toString('base64url');
  return `${body}.${sign(body)}`;
};

/** Returns the payload, or null when the token is missing, altered or expired. */
export const verifyToken = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

/**
 * Short readable code derived from the server secret (no database column needed).
 * Used for class join codes and password-reset codes: "K7Q2-M9XD".
 * Same input + same secret => same code. Without AUTH_SECRET in .env the codes change on every restart.
 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I, L, O, 0, 1 (easy to misread)
export const deriveCode = (label, text, length = 8) => {
  const digest = crypto.createHmac('sha256', SECRET).update(`${label}|${text}`).digest();
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_CHARS[digest[i] % CODE_CHARS.length];
  return out.length > 4 ? `${out.slice(0, 4)}-${out.slice(4)}` : out;
};

/** "k7q2 m9xd" -> "K7Q2M9XD" so people can type it any way */
export const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const sameCode = (a, b) => {
  const x = Buffer.from(cleanCode(a));
  const y = Buffer.from(cleanCode(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
