import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

/**
 * ============================================================================
 * utils/assetStore.js   (backend/utils/)
 * Reads and writes the image folders:  <project>/assets/gameAsset/background  and  .../npc
 * Set ASSETS_DIR to override the location of the gameAsset folder.
 *
 * What is stored in the database is the plain FILE NAME (e.g. "village.jpg"),
 * the readable name teachers see lives in MediaAsset.displayName.
 * ============================================================================
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSETS_ROOT = process.env.ASSETS_DIR
  ? path.resolve(process.env.ASSETS_DIR)
  : path.resolve(__dirname, '../../assets/gameAsset');

export const FOLDERS = { background: 'background', npc: 'npc' };
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Plain file name only: no slashes, no "..", image extensions only. */
export const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.\-]*\.(png|jpe?g|webp|gif)$/i;

export const isAssetType = (type) => Object.prototype.hasOwnProperty.call(FOLDERS, type);
export const folderOf = (type) => path.join(ASSETS_ROOT, FOLDERS[type]);

/**
 * The database may hold a bare file name ("village.jpg", what the content manager saves) or an older full path
 * ("../assets/gameAsset/background/village.jpg", what seed files used). Both mean the same picture, so every
 * lookup goes through fileOf() and the two spellings can never disagree.
 */
export const fileOf = (value) => (typeof value === 'string' ? value.trim().split(/[\\/]/).pop() : value);

/** Path that pages inside student/ or teacher/ use to show the image. */
export const urlOf = (type, file) => `../assets/gameAsset/${FOLDERS[type]}/${fileOf(file)}`;

export const listFiles = (type) => {
  try {
    return fs.readdirSync(folderOf(type)).filter((f) => SAFE_NAME.test(f)).sort();
  } catch {
    return [];
  }
};

export const assetExists = (type, file) => {
  const name = fileOf(file);
  return typeof name === 'string' && SAFE_NAME.test(name) && fs.existsSync(path.join(folderOf(type), name));
};

/** "tunku_abdul_rahman.png" -> "Tunku Abdul Rahman" (a starting name teachers can rename). */
export const prettifyName = (file) =>
  file.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || file;

/** Real image type from the first bytes (the browser-sent type is not trusted). SVG is refused on purpose. */
export const detectImage = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp' };
  return null;
};

/** Writes the image under a random name and returns that file name. */
export const saveUpload = (type, buf, ext) => {
  const dir = folderOf(type);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${type === 'npc' ? 'npc' : 'bg'}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf, { flag: 'wx' });
  return name;
};