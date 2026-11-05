import db from '../config/db.js';
import { failServer } from '../utils/dbError.js';
import { isAdminUsername } from '../utils/adminUtil.js';
import { saveChanges } from './contentController.js';

/**
 * ============================================================================
 * teacherPermissionController.js     SUIS KEBENARAN GURU (admin sahaja)
 *
 * Teacher.canEditFixed = 1  =>  guru itu boleh mengubah SEMUA naratif + soalan seperti admin
 * (antara mukanya pun sama seperti admin: tiada kunci kelabu). Perubahan terpakai untuk semua kelas
 * kerana kandungan tetap dikongsi. NPC, gambar dan suara tetap admin sahaja.
 *
 *   GET /api/content/teacher-permissions                    (admin)
 *   PUT /api/content/teacher-permissions/:teacherID         body { canEditFixed: true|false }   (admin)
 * Semakan akses sebenar ada dalam middleware/requireContentOwner.js.
 * ============================================================================
 */

const fail = (res, code, message) => res.status(code).json({ success: false, message });

/* ------------------------------------------------------------------------ */
/* SUIS KEBENARAN (admin sahaja)                                            */
/* ------------------------------------------------------------------------ */
export const listPermissions = async (req, res) => {
  try {
    if (!req.teacher.isAdmin) return fail(res, 403, 'Hanya admin boleh melihat kebenaran guru.');
    const [rows] = await db.query(
      `SELECT t.teacherID, t.teacherName, t.canEditFixed, u.username,
              (SELECT COUNT(*) FROM Class c WHERE c.teacherID = t.teacherID) AS classCount
       FROM Teacher t JOIN User u ON u.userID = t.userID
       WHERE t.teacherID <> 'T-PUBLIC' ORDER BY t.teacherName`);
    return res.status(200).json({
      success: true,
      teachers: rows.filter((r) => !isAdminUsername(r.username))
        .map((r) => ({ teacherID: r.teacherID, name: r.teacherName, canEditFixed: Boolean(r.canEditFixed), classCount: Number(r.classCount) }))
    });
  } catch (err) {
    console.error('listPermissions error:', err);
    return failServer(res, err, 'Senarai guru tidak dapat dimuatkan.');
  }
};

export const setPermission = async (req, res) => {
  try {
    if (!req.teacher.isAdmin) return fail(res, 403, 'Hanya admin boleh menukar kebenaran guru.');
    const teacherID = String(req.params.teacherID || '');
    const on = req.body && req.body.canEditFixed === true;
    const [r] = await db.query(`UPDATE Teacher SET canEditFixed = ? WHERE teacherID = ? AND teacherID <> 'T-PUBLIC'`, [on ? 1 : 0, teacherID]);
    if (r.affectedRows === 0) return fail(res, 404, 'Guru tidak dijumpai.');
    await saveChanges(req.teacher, null, on ? 'Buka suis ubah kandungan' : 'Tutup suis ubah kandungan', `Guru ${teacherID}`);
    return res.status(200).json({ success: true, message: on ? 'Suis dibuka: guru ini boleh mengubah semua naratif dan soalan (sama seperti admin).' : 'Suis ditutup.', canEditFixed: on });
  } catch (err) {
    console.error('setPermission error:', err);
    return failServer(res, err, 'Suis gagal disimpan.');
  }
};
