/**
 * ============================================================================
 * utils/inputGuard.js  -  penapis input pusat (kekangan SQL injection dan input berbahaya)
 *
 * Lapisan perlindungan:
 *   1. SEMUA pertanyaan SQL guna "?" (parameter). Itu perlindungan utama.
 *   2. Fail ini ialah lapisan KEDUA: menolak input yang jelas berniat jahat sebelum sampai ke pengawal.
 *        - aksara kawalan / NUL, kunci bahaya (__proto__), data terlalu dalam atau terlalu panjang
 *        - corak serangan SQL yang lazim (UNION SELECT, OR 1=1, '; DROP ...)
 *        - parameter laluan (ID) yang bukan nombor / bentuk ID yang dibenarkan
 *   3. Pengawal masih menyemak panjang, jenis dan format setiap ruangan.
 *
 * Mesej penolakan menyatakan RUANGAN mana yang bermasalah (contoh: "form.items[2].text").
 * Ruangan kata laluan tidak diperiksa corak SQL (kata laluan boleh mengandungi apa-apa aksara
 * dan tidak pernah dimasukkan ke dalam teks SQL, hanya sebagai parameter).
 * ============================================================================
 */

const MAX_DEPTH = 8;            // paras objek bersarang maksimum
const MAX_ITEMS = 500;          // bilangan item dalam satu senarai
const MAX_TEXT = 20000;         // panjang satu teks (teks panjang sebenar dihadkan lagi oleh pengawal)
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// kunci yang tidak diperiksa corak SQL (kata laluan, token)
const SKIP_SQL_KEYS = /pass|token|secret/i;

// aksara kawalan (kecuali baris baharu, tab, enter)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// corak serangan SQL yang lazim. Dipilih supaya ayat sejarah biasa TIDAK terkena.
const SQL_PATTERNS = [
  [/\bunion\b[\s/*]+(all[\s/*]+)?select\b/i, 'UNION SELECT'],
  [/['"`]\s*(;|(--|#|\/\*)\s*$)/, 'tanda petik diikuti pemisah arahan atau komen SQL di hujung'],
  [/;\s*(drop|alter|truncate|delete|insert|update|create|grant|revoke|exec)\b/i, 'arahan SQL selepas titik bertitik'],
  [/\b(or|and)\b\s*['"]?\s*\d+\s*['"]?\s*=\s*['"]?\s*\d+/i, 'syarat sentiasa benar (contoh: OR 1=1)'],
  [/['"]\s*\b(or|and)\b\s*['"]/i, "tanda petik diikuti OR / AND"],
  [/\b(sleep|benchmark|pg_sleep|load_file)\s*\(/i, 'fungsi SQL berbahaya'],
  [/\bwaitfor\s+delay\b/i, 'WAITFOR DELAY'],
  [/\binformation_schema\b/i, 'information_schema'],
  [/\binto\s+(out|dump)file\b/i, 'INTO OUTFILE'],
  [/\bxp_cmdshell\b/i, 'xp_cmdshell']
];

/** Mengembalikan nama corak jika teks kelihatan seperti serangan SQL, jika tidak null. */
export function sqlInjectionHit(text) {
  const s = String(text);
  for (const [re, name] of SQL_PATTERNS) if (re.test(s)) return name;
  return null;
}

const fieldName = (path) => path.replace(/^\./, '') || '(badan permintaan)';

/**
 * Menyemak satu nilai secara rekursif. Mengembalikan { path, message } bagi masalah pertama, atau null.
 */
function inspect(value, path, depth, where) {
  if (depth > MAX_DEPTH) return { path, message: 'Data terlalu dalam (bersarang lebih daripada 8 paras).' };

  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) return { path, message: `Teks terlalu panjang (lebih ${MAX_TEXT} aksara).` };
    if (CONTROL_CHARS.test(value)) return { path, message: 'Mengandungi aksara kawalan yang tidak dibenarkan.' };
    const key = path.split(/[.[\]]/).filter(Boolean).pop() || '';
    if (!SKIP_SQL_KEYS.test(key)) {
      const hit = sqlInjectionHit(value);
      if (hit) return { path, message: `Mengandungi corak arahan pangkalan data yang tidak dibenarkan (${hit}).`, sql: true };
    }
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) return { path, message: `Senarai terlalu panjang (lebih ${MAX_ITEMS} item).` };
    for (let i = 0; i < value.length; i++) {
      const p = inspect(value[i], `${path}[${i}]`, depth + 1, where);
      if (p) return p;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (BAD_KEYS.has(k)) return { path: `${path}.${k}`, message: 'Nama ruangan tidak dibenarkan.' };
      if (k.length > 60) return { path: `${path}.${k.slice(0, 20)}...`, message: 'Nama ruangan terlalu panjang.' };
      const p = inspect(value[k], `${path}.${k}`, depth + 1, where);
      if (p) return p;
    }
  }
  return null;
}

/**
 * Express middleware: semak req.body dan req.query. Letakkan SELEPAS express.json().
 * Menolak dengan 400 dan menyatakan ruangan yang bermasalah.
 */
export function guardRequest(req, res, next) {
  for (const [where, data] of [['body', req.body], ['query', req.query]]) {
    if (data === undefined || data === null) continue;
    const bad = inspect(data, '', 0, where);
    if (bad) {
      const field = fieldName(bad.path);
      if (bad.sql) console.warn(`[inputGuard] cubaan SQL injection ditolak: ${req.method} ${req.originalUrl} ruangan=${field} ip=${req.ip}`);
      return res.status(400).json({
        success: false,
        code: bad.sql ? 'INPUT_SQL_PATTERN' : 'INPUT_REJECTED',
        message: `Ruangan "${field}" ditolak: ${bad.message}`,
        field,
        errors: { [field]: bad.message }
      });
    }
  }
  return next();
}

/* ------------------------------------------------------------------------ */
/* PARAMETER LALUAN (ID)                                                    */
/* ------------------------------------------------------------------------ */

// bentuk yang dibenarkan bagi setiap parameter laluan
const PARAM_RULES = {
  classID: /^[A-Za-z0-9_-]{1,20}$/,      // contoh: C2026-1, PUBLIC-0000 (lajur classID ialah VARCHAR(20))
  narrativeID: /^\d{1,10}$/,
  questID: /^\d{1,10}$/,
  questionID: /^\d{1,10}$/,
  npcID: /^\d{1,10}$/,
  assetID: /^\d{1,10}$/,
  eraID: /^\d{1,10}$/,
  sceneID: /^[A-Za-z0-9_-]{1,40}$/,
  studentID: /^[A-Za-z0-9_.-]{1,30}$/
};

/**
 * Pasang pemeriksaan pada semua parameter laluan yang dikenali dalam satu router.
 * Contoh: protectParams(router). ID yang bukan nombor ditolak dengan 400 sebelum pengawal berjalan.
 */
export function protectParams(router) {
  Object.entries(PARAM_RULES).forEach(([name, re]) => {
    router.param(name, (req, res, next, value) => {
      if (!re.test(String(value))) {
        return res.status(400).json({
          success: false,
          code: 'PARAM_INVALID',
          message: `Pengenal "${name}" tidak sah. Hanya huruf, nombor, tanda - dan _ dibenarkan (nombor sahaja bagi ID jenis nombor).`,
          field: name
        });
      }
      return next();
    });
  });
  return router;
}

/** Nama jadual / lajur yang dimasukkan ke dalam teks SQL mesti datang daripada senarai ini. */
export function safeIdentifier(name, allowed) {
  if (!allowed.includes(name)) throw new Error(`Pengecam SQL tidak dibenarkan: ${name}`);
  return name;
}