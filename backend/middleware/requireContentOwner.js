import db from '../config/db.js';
import { contentLocked, requireAdmin } from './requireAdmin.js';

/**
 * ============================================================================
 * middleware/requireContentOwner.js     PEMILIKAN KANDUNGAN (use AFTER requireTeacher)
 *
 * Peraturan apabila CONTENT_ADMIN_ONLY=true:
 *   - Bacaan (GET) sentiasa dibenarkan.
 *   - Admin boleh mengubah apa sahaja (kandungan tetap, ownerTeacherID kosong).
 *   - Guru biasa HANYA boleh mengubah NARATIF MILIKNYA (Narrative.ownerTeacherID = guru itu):
 *     naratif itu, babak, dialog, misi dan peranan pelajar di dalamnya. Cipta naratif baharu = dibenarkan.
 *   - Soalan: guru boleh tambah soalan ke bank era dan ubah / padam soalan MILIKNYA (Question.ownerTeacherID).
 *   - NPC, suara Pendekar Bayang dan gambar: admin sahaja (kandungan dikongsi semua).
 * Pelayan menyemak ini, bukan skrin, jadi guru tidak boleh memintas dengan menukar URL.
 * ============================================================================
 */

const toID = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const deny = (res) => res.status(403).json({
  success: false,
  message: 'Kandungan tetap hanya boleh diubah oleh admin. Anda boleh mengubah naratif yang anda cipta sendiri, atau menulis Nota Guru pada kandungan tetap.'
});

/** Which narrative does this write touch? null = not a story write; 0 = unknown / invalid. */
const narrativeOf = async (req) => {
  const p = req.path;
  let m;
  if ((m = p.match(/^\/questions\/(\d+)$/))) return { question: toID(m[1]) || 0 };
  if (p.startsWith('/notes')) return 'new';                              // Nota Guru: setiap guru menulis nota miliknya sendiri
  if (p === '/narratives' && req.method === 'POST') return 'new';
  if (p === '/questions' && req.method === 'POST') return 'new';        // soalan baharu: milik penciptanya
  if ((m = p.match(/^\/narratives\/(\d+)(\/|$)/))) return toID(m[1]) || 0;
  if (p === '/scenes' && req.method === 'POST') return toID(req.body && req.body.narrativeID) || 0;
  if ((m = p.match(/^\/scenes\/([^/]+)/))) {
    const [r] = await db.query('SELECT narrativeID FROM Scene WHERE sceneID = ?', [m[1]]);
    return r[0] ? Number(r[0].narrativeID) : 0;
  }
  if (p === '/quests' && req.method === 'POST') {
    const [r] = await db.query('SELECT narrativeID FROM Scene WHERE sceneID = ?', [String((req.body && req.body.sceneID) || '')]);
    return r[0] ? Number(r[0].narrativeID) : 0;
  }
  if ((m = p.match(/^\/quests\/(\d+)$/))) {
    const [r] = await db.query('SELECT s.narrativeID FROM Quest q JOIN Scene s ON s.sceneID = q.sceneID WHERE q.questID = ?', [toID(m[1])]);
    return r[0] ? Number(r[0].narrativeID) : 0;
  }
  return null;
};

export const guardContentWrites = async (req, res, next) => {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (!contentLocked() || req.teacher.isAdmin) return next();

    const target = await narrativeOf(req);
    if (target === null) return requireAdmin(req, res, next);      // NPC, gambar, suara Pendekar Bayang
    // Suis admin dibuka untuk guru ini: dia boleh mengubah semua naratif + soalan seperti admin
    if (req.teacher.canEditFixed) return next();
    if (target === 'new') return next();
    if (typeof target === 'object' && target.question) {                // ubah / padam soalan: hanya soalan milik sendiri
      const [q] = await db.query('SELECT ownerTeacherID FROM Question WHERE questionID = ?', [target.question]);
      if (q.length === 0 || (q[0].ownerTeacherID && q[0].ownerTeacherID === req.teacher.teacherID)) return next();
      return deny(res);
    }                           // naratif baharu: pemiliknya ialah penciptanya
    if (target === 0 || (typeof target === 'object' && !target.question)) return next();                               // tidak dijumpai: pengawal akan menjawab 404 / 400

    const [rows] = await db.query('SELECT ownerTeacherID FROM Narrative WHERE narrativeID = ?', [target]);
    if (rows.length === 0) return next();
    if (rows[0].ownerTeacherID && rows[0].ownerTeacherID === req.teacher.teacherID) return next();
    return deny(res);
  } catch (err) {
    console.error('guardContentWrites error:', err);
    return res.status(500).json({ success: false, message: 'Semakan akses gagal. Tiada perubahan dibuat.' });
  }
};
