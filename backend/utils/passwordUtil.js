import crypto from 'node:crypto';

/**
 * ============================================================================
 * utils/passwordUtil.js
 * New students must be stored in the SAME password format your login (models/User.js
 * verifyPassword) expects. Instead of guessing, the format is detected from an existing
 * account: the logged-in teacher's own User.password.
 *
 *   starts with $2a$ / $2b$ / $2y$  -> bcrypt   (needs the 'bcryptjs' or 'bcrypt' package, whichever
 *                                               your project already uses)
 *   anything else                   -> plain text (login compares the typed password directly)
 *
 * To force a format, set PASSWORD_STORAGE=bcrypt or PASSWORD_STORAGE=plain in .env.
 * ============================================================================
 */
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;
let cached = null;

async function loadBcrypt() {
  for (const name of ['bcryptjs', 'bcrypt']) {
    try { const mod = await import(name); return mod.default || mod; } catch { /* try next */ }
  }
  throw new Error('Pakej bcryptjs / bcrypt tidak dijumpai. Jalankan: npm install bcryptjs');
}

export async function detectMode(db, userID) {
  const forced = String(process.env.PASSWORD_STORAGE || '').toLowerCase();
  if (forced === 'bcrypt' || forced === 'plain') return forced;
  // Default: salted scrypt (built into Node, no package). Old plain-text and bcrypt accounts keep working
  // and plain-text ones are upgraded the first time they log in.
  if (forced === 'scrypt' || !forced) return 'scrypt';
  if (cached) return cached;
  const [[row]] = await db.query('SELECT password FROM User WHERE userID = ? LIMIT 1', [userID]);
  cached = row && BCRYPT_RE.test(String(row.password)) ? 'bcrypt' : 'plain';
  return cached;
}

const SCRYPT_RE = /^scrypt\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;
const SCRYPT_N = 16384;

function scryptHash(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, 32, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** true when `stored` is in a protected format (not plain text) */
export const isHashed = (stored) => SCRYPT_RE.test(String(stored)) || BCRYPT_RE.test(String(stored));

/** Compare a typed password with what the database holds (scrypt, bcrypt or legacy plain text). */
export async function checkPassword(plain, stored) {
  const typed = String(plain ?? '');
  const saved = String(stored ?? '');
  if (SCRYPT_RE.test(saved)) {
    const [, n, salt, hash] = saved.split('$');
    const expected = Buffer.from(hash, 'base64url');
    const got = crypto.scryptSync(typed, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n) });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  }
  if (BCRYPT_RE.test(saved)) {
    const bcrypt = await loadBcrypt();
    return bcrypt.compare(typed, saved);
  }
  const a = Buffer.from(typed);
  const b = Buffer.from(saved);
  return a.length === b.length && crypto.timingSafeEqual(a, b);       // legacy plain text
}

export async function hashPassword(plain, mode) {
  if (mode === 'scrypt') return scryptHash(plain);
  if (mode === 'bcrypt') {
    const bcrypt = await loadBcrypt();
    return bcrypt.hash(plain, 10);
  }
  return plain;
}

export function resetModeCache() { cached = null; }

/**
 * Kata laluan rawak yang mudah dibaca (tiada 0/O/1/l/I). Sentiasa ada huruf besar, huruf kecil
 * dan nombor, supaya memenuhi peraturan kata laluan (utils/passwordPolicy.js).
 */
export function generatePassword(length = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const n = Math.max(8, length);
  for (;;) {
    const pw = Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join('');
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}