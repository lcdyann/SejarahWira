import db from '../config/db.js';

/**
 * ============================================================================
 * avatarController.js  (Application tier - BCE)   -> backend/controllers/
 * UC-02: Customize Avatar (avatar.html)
 *
 *   Avatar   loadAvatarAsset()     GET  /api/avatar/options?studentID=
 *   Avatar   saveCustomization()   POST /api/avatar/save   { studentID, avatarID }
 *
 * Tables: Avatar (avatarID, avatarName, asset) and Student.avatarID (FK, nullable).
 * NOTE: IDs come from the request like the rest of the project, so any caller can change
 * any student's avatar. Real protection needs your login/session middleware
 * (take studentID from the logged-in user, not from the request).
 * ============================================================================
 */

const DEFAULT_AVATAR = '../assets/gameAsset/avatar/avatar_melayu_lelaki.png';

/** Prefix a bare filename with its asset folder; leave full paths/URLs alone. */
const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

const toAvatar = (r) => ({
  avatarID: r.avatarID,
  avatarName: r.avatarName,
  asset: resolveAsset(r.asset, 'avatar', DEFAULT_AVATAR)
});

/**
 * Avatar.loadAvatarAsset()              GET /api/avatar/options?studentID=
 * Every avatar the student can pick, plus the one currently equipped (from the database,
 * not from the browser's localStorage which can be stale).
 */
export const loadAvatarAsset = async (req, res) => {
  try {
    const { studentID } = req.query;
    if (!studentID) {
      return res.status(400).json({ success: false, message: 'studentID diperlukan.' });
    }

    const [students] = await db.query(
      `SELECT avatarID FROM Student WHERE studentID = ? LIMIT 1`,
      [studentID]
    );
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai.' });
    }

    const [rows] = await db.query(
      `SELECT avatarID, avatarName, asset FROM Avatar ORDER BY avatarID ASC`
    );

    return res.status(200).json({
      success: true,
      equippedAvatarID: students[0].avatarID,
      avatars: rows.map(toAvatar)
    });
  } catch (err) {
    console.error('loadAvatarAsset error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memuatkan sumber avatar.' });
  }
};

/**
 * Avatar.saveCustomization()            POST /api/avatar/save
 * body: studentID, avatarID
 * Only an avatar that really exists can be equipped (no blind FK errors).
 */
export const saveCustomization = async (req, res) => {
  try {
    const { studentID, avatarID } = req.body;
    if (!studentID || avatarID === undefined || avatarID === null || avatarID === '') {
      return res.status(400).json({ success: false, message: 'studentID dan avatarID diperlukan.' });
    }

    const [students] = await db.query(`SELECT studentID FROM Student WHERE studentID = ? LIMIT 1`, [studentID]);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai.' });
    }

    const [avatars] = await db.query(
      `SELECT avatarID, avatarName, asset FROM Avatar WHERE avatarID = ? LIMIT 1`,
      [avatarID]
    );
    if (avatars.length === 0) {
      return res.status(404).json({ success: false, message: 'Avatar tidak dijumpai.' });
    }

    await db.query(`UPDATE Student SET avatarID = ? WHERE studentID = ?`, [avatars[0].avatarID, studentID]);

    return res.status(200).json({
      success: true,
      message: 'Tetapan avatar berjaya disimpan.',
      avatar: toAvatar(avatars[0])
    });
  } catch (err) {
    console.error('saveCustomization error:', err);
    return res.status(500).json({ success: false, message: 'Tetapan avatar tidak dapat disimpan.' });
  }
};