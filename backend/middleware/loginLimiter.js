/**
 * ============================================================================
 * middleware/loginLimiter.js
 * Slows down guessing and sign-up spam. Kept in memory (one server). If you later run
 * several servers, move the counters to a shared store (e.g. Redis).
 *
 *   loginLimiter      8 wrong logins per username + address, then 15 minutes wait
 *   registerLimiter   10 new accounts per address per hour
 * A good login clears its counter.
 * ============================================================================
 */
function createLimiter({ windowMs, max, key, countWhen }) {
  const hits = new Map();          // key -> { count, first }

  setInterval(() => {              // forget old entries so the map cannot grow forever
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.first > windowMs) hits.delete(k);
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const rec = hits.get(k);
    if (rec && now - rec.first > windowMs) hits.delete(k);

    const cur = hits.get(k);
    if (cur && cur.count >= max) {
      const wait = Math.ceil((windowMs - (now - cur.first)) / 60000);
      res.set('Retry-After', String(wait * 60));
      return res.status(429).json({ success: false, message: `Terlalu banyak cubaan. Cuba lagi dalam ${wait} minit.` });
    }

    res.on('finish', () => {
      if (countWhen(res.statusCode)) {
        const r = hits.get(k) || { count: 0, first: Date.now() };
        r.count += 1;
        hits.set(k, r);
      } else if (res.statusCode < 400 && max <= 20 && windowMs <= 30 * 60 * 1000) {
        hits.delete(k);            // a good login clears the wrong-password counter
      }
    });
    return next();
  };
}

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  key: (req) => `${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 50)}`,
  countWhen: (code) => code === 401
});

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  key: (req) => `reg|${req.ip}`,
  countWhen: (code) => code === 201
});

/** wrong class codes: 10 misses per student per 10 minutes (stops guessing other classes) */
export const joinClassLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  key: (req) => `join|${req.ip}|${req.student ? req.student.studentID : ''}`,
  countWhen: (code) => code === 404
});

/** wrong reset codes: 6 misses per username + address per 15 minutes (a code has 40 bits, this makes guessing hopeless) */
export const resetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  key: (req) => `reset|${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 50)}`,
  countWhen: (code) => code === 401
});

/** minta e-mel tetapan semula: 3 kali per e-mel + alamat setiap 15 minit (elak spam peti masuk orang lain) */
export const forgotLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  key: (req) => `forgot|${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 50)}`,
  countWhen: (code) => code === 200
});

/** tekaan kod pengesahan semasa daftar guru: 12 percubaan gagal per e-mel + alamat setiap 15 minit */
export const verifyTryLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  key: (req) => `verify|${req.ip}|${String((req.body && req.body.username) || '').toLowerCase().slice(0, 50)}`,
  countWhen: (code) => code === 422
});
