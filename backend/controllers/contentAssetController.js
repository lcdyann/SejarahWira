import { failServer } from '../utils/dbError.js';
import fs from 'fs';
import path from 'path';
import db from '../config/db.js';
import {
  FOLDERS, MAX_UPLOAD_BYTES, folderOf, isAssetType, listFiles, assetExists,
  urlOf, prettifyName, detectImage, saveUpload, fileOf
} from '../utils/assetStore.js';
import { saveChanges } from './contentController.js';

/**
 * ============================================================================
 * contentAssetController.js  (Application tier - BCE)          UC-10 (images + NPCs)
 *
 *   ContentManager   listAssets()     GET  /api/content/assets?type=background|npc
 *   ContentManager   uploadAsset()    POST /api/content/assets/upload?type=&name=   (raw image bytes)
 *   ContentManager   renameAsset()    PUT  /api/content/assets/:assetID
 *   NPC              listNpcs(), addNpc(), editNpc(), removeNpc()
 *
 * Teachers pick images by NAME + preview; the database stores the plain file name.
 * Files already in the folders are listed automatically (name made from the file name,
 * renameable). Uploads: PNG / JPG / WEBP, max 2 MB, the real file type is checked from the
 * first bytes, and the file is saved under a random name. SVG is refused.
 * ============================================================================
 */

const ENTITY_LOCKED = 'Pendekar Bayang ialah penjaga kitab dan tidak boleh diubah nama atau dipadam. Ayatnya diubah di tab "Suara Pendekar Bayang".';
const MARKUP = /[<>]/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const toID = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });

const validName = (value, label, max = 100) => {
  const v = str(value);
  if (!v) return { error: `${label} wajib diisi.` };
  if (v.length > max) return { error: `${label} terlalu panjang (maksimum ${max} aksara).` };
  if (MARKUP.test(v)) return { error: 'Aksara < dan > tidak dibenarkan.' };
  return { value: v };
};

/* ------------------------------------------------------------------------ */
/* IMAGE LIBRARY                                                            */
/* ------------------------------------------------------------------------ */

/** Makes sure every file in the folder has a readable name in MediaAsset, then returns the list. */
const syncAssets = async (type) => {
  const files = listFiles(type);
  const [known] = await db.query(`SELECT filePath FROM MediaAsset WHERE assetType = ?`, [type]);
  const have = new Set(known.map((r) => r.filePath));
  for (const file of files) {
    if (!have.has(file)) {
      await db.query(`INSERT IGNORE INTO MediaAsset (assetType, displayName, filePath) VALUES (?, ?, ?)`,
        [type, prettifyName(file).slice(0, 100), file]);
    }
  }

  const [rows] = await db.query(
    `SELECT a.assetID, a.displayName, a.filePath, t.teacherName AS uploadedBy
     FROM MediaAsset a LEFT JOIN Teacher t ON a.uploadedBy = t.teacherID
     WHERE a.assetType = ? ORDER BY a.displayName ASC`, [type]);
  const onDisk = new Set(files);
  return rows
    .filter((r) => onDisk.has(r.filePath))
    .map((r) => ({
      assetID: r.assetID,
      displayName: r.displayName,
      file: r.filePath,
      url: urlOf(type, r.filePath),
      uploadedBy: r.uploadedBy || null
    }));
};

export const listAssets = async (req, res) => {
  try {
    const type = req.query.type;
    if (!isAssetType(type)) return fail(res, 400, 'Jenis gambar tidak sah.');
    return res.status(200).json({ success: true, type, assets: await syncAssets(type) });
  } catch (err) {
    console.error('listAssets error:', err);
    return failServer(res, err, 'Senarai gambar tidak dapat dimuatkan.');
  }
};

/** Body = the raw image bytes (route uses express.raw). Name comes in the query string. */
export const uploadAsset = async (req, res) => {
  try {
    const type = req.query.type;
    if (!isAssetType(type)) return fail(res, 400, 'Jenis gambar tidak sah.');

    const name = validName(req.query.name, 'Nama gambar');
    if (name.error) return fail(res, 422, name.error, { errors: { name: name.error } });

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return fail(res, 415, 'Fail gambar tidak diterima. Gunakan PNG, JPG atau WEBP.');
    }
    if (buf.length > MAX_UPLOAD_BYTES) return fail(res, 413, 'Fail terlalu besar (maksimum 2 MB).');

    const image = detectImage(buf);
    if (!image) return fail(res, 415, 'Format fail tidak disokong. Gunakan PNG, JPG atau WEBP.');

    const file = saveUpload(type, buf, image.ext);
    try {
      const [ins] = await db.query(
        `INSERT INTO MediaAsset (assetType, displayName, filePath, uploadedBy) VALUES (?, ?, ?, ?)`,
        [type, name.value, file, req.teacher.teacherID]);
      await saveChanges(req.teacher, null, 'Muat naik gambar',
        `${type === 'npc' ? 'Gambar NPC' : 'Gambar latar'} baharu: "${name.value}"`);
      return res.status(201).json({
        success: true,
        message: 'Gambar berjaya dimuat naik.',
        asset: { assetID: ins.insertId, displayName: name.value, file, url: urlOf(type, file) }
      });
    } catch (dbErr) {
      fs.rmSync(path.join(folderOf(type), file), { force: true });   // no orphan file when the record fails
      throw dbErr;
    }
  } catch (err) {
    console.error('uploadAsset error:', err);
    return failServer(res, err, 'Gambar gagal dimuat naik. Sila cuba lagi.');
  }
};

export const renameAsset = async (req, res) => {
  try {
    const assetID = toID(req.params.assetID);
    if (!assetID) return fail(res, 400, 'Gambar tidak sah.');
    const [rows] = await db.query(`SELECT assetID, displayName FROM MediaAsset WHERE assetID = ?`, [assetID]);
    if (rows.length === 0) return fail(res, 404, 'Gambar tidak dijumpai.');

    const name = validName(req.body.displayName, 'Nama gambar');
    if (name.error) return fail(res, 422, name.error, { errors: { displayName: name.error } });

    await db.query(`UPDATE MediaAsset SET displayName = ? WHERE assetID = ?`, [name.value, assetID]);
    await saveChanges(req.teacher, null, 'Namakan semula gambar', `"${rows[0].displayName}" \u2192 "${name.value}"`);
    return res.status(200).json({ success: true, message: 'Nama gambar dikemas kini.' });
  } catch (err) {
    console.error('renameAsset error:', err);
    return failServer(res, err, 'Nama gambar gagal disimpan.');
  }
};

/* ------------------------------------------------------------------------ */
/* NPC LIBRARY                                                              */
/* ------------------------------------------------------------------------ */

const validateNpc = (b = {}) => {
  const errors = {};
  const name = validName(b.name, 'Nama NPC');
  if (name.error) errors.name = name.error;

  const value = { name: name.value || '', biography: str(b.biography), contribution: str(b.contribution), asset: fileOf(str(b.asset)) };
  ['biography', 'contribution'].forEach((f) => {
    if (value[f].length > 2000) errors[f] = 'Terlalu panjang (maksimum 2000 aksara).';
    else if (MARKUP.test(value[f])) errors[f] = 'Aksara < dan > tidak dibenarkan.';
  });
  if (!value.asset) errors.asset = 'Sila pilih gambar NPC.';
  else if (!assetExists('npc', value.asset)) errors.asset = 'Gambar NPC tidak dijumpai. Sila pilih semula.';
  return { valid: Object.keys(errors).length === 0, errors, value };
};

export const listNpcs = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.npcID, n.name, n.biography, n.contribution, n.asset,
              (SELECT COUNT(*) FROM DialogueLine d WHERE d.npcID = n.npcID) AS lineCount
       FROM NPC n ORDER BY n.name ASC`);
    return res.status(200).json({
      success: true,
      npcs: rows.map((r) => ({
        npcID: r.npcID,
        name: r.name,
        biography: r.biography || '',
        contribution: r.contribution || '',
        asset: fileOf(r.asset),
        url: urlOf('npc', r.asset),
        missing: !assetExists('npc', r.asset),
        lineCount: Number(r.lineCount)
      }))
    });
  } catch (err) {
    console.error('listNpcs error:', err);
    return failServer(res, err, 'Senarai NPC tidak dapat dimuatkan.');
  }
};

export const addNpc = async (req, res) => {
  try {
    const { valid, errors, value } = validateNpc(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat NPC.', { errors });

    const [ins] = await db.query(
      `INSERT INTO NPC (name, biography, contribution, asset) VALUES (?, ?, ?, ?)`,
      [value.name, value.biography || null, value.contribution || null, value.asset]);
    await saveChanges(req.teacher, null, 'Tambah NPC', `NPC baharu: "${value.name}"`);
    return res.status(201).json({ success: true, message: 'NPC berjaya ditambah.', npcID: ins.insertId });
  } catch (err) {
    console.error('addNpc error:', err);
    return failServer(res, err, 'NPC gagal disimpan. Tiada perubahan dibuat.');
  }
};

export const editNpc = async (req, res) => {
  try {
    const npcID = toID(req.params.npcID);
    if (!npcID) return fail(res, 400, 'NPC tidak sah.');
    const [rows] = await db.query(`SELECT npcID, name FROM NPC WHERE npcID = ?`, [npcID]);
    if (rows.length === 0) return fail(res, 404, 'NPC tidak dijumpai.');
    if (rows[0].name === 'Pendekar Bayang') return fail(res, 409, ENTITY_LOCKED);

    const { valid, errors, value } = validateNpc(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat NPC.', { errors });

    await db.query(`UPDATE NPC SET name = ?, biography = ?, contribution = ?, asset = ? WHERE npcID = ?`,
      [value.name, value.biography || null, value.contribution || null, value.asset, npcID]);
    await saveChanges(req.teacher, null, 'Kemas kini NPC', `NPC: "${rows[0].name}" \u2192 "${value.name}"`);
    return res.status(200).json({ success: true, message: 'NPC berjaya dikemas kini.' });
  } catch (err) {
    console.error('editNpc error:', err);
    return failServer(res, err, 'NPC gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** An NPC that still speaks in a scene cannot be deleted (its lines would turn into the player's). */
export const removeNpc = async (req, res) => {
  try {
    const npcID = toID(req.params.npcID);
    if (!npcID) return fail(res, 400, 'NPC tidak sah.');
    const [rows] = await db.query(`SELECT npcID, name FROM NPC WHERE npcID = ?`, [npcID]);
    if (rows.length === 0) return fail(res, 404, 'NPC tidak dijumpai.');
    if (rows[0].name === 'Pendekar Bayang') return fail(res, 409, ENTITY_LOCKED);

    const used = Number((await db.query(`SELECT COUNT(*) AS c FROM DialogueLine WHERE npcID = ?`, [npcID]))[0][0].c);
    if (used > 0) {
      return fail(res, 409, `NPC ini masih digunakan dalam ${used} baris dialog. Tukar penutur baris tersebut dahulu.`);
    }

    await db.query(`DELETE FROM NPC WHERE npcID = ?`, [npcID]);
    await saveChanges(req.teacher, null, 'Padam NPC', `NPC dipadam: "${rows[0].name}"`);
    return res.status(200).json({ success: true, message: 'NPC berjaya dipadam.' });
  } catch (err) {
    console.error('removeNpc error:', err);
    return failServer(res, err, 'NPC gagal dipadam. Tiada perubahan dibuat.');
  }
};