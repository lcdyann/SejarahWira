/**
 * Set (or change) a password from the command line, stored as a salted hash.
 *   node scripts/set-password.js <username> <new password>
 * Use it once after the first deploy to replace the seed password of the admin teacher
 * ("teacher" / 123456), and any time somebody (including you) is locked out.
 */
import db from '../config/db.js';
import { hashPassword } from '../utils/passwordUtil.js';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Use:  node scripts/set-password.js <username> <password of at least 8 characters>');
  process.exit(1);
}

try {
  const [r] = await db.query('UPDATE User SET password = ? WHERE username = ?', [await hashPassword(password, 'scrypt'), username.toLowerCase()]);
  console.log(r.affectedRows ? `Password changed for "${username}".` : `No user named "${username}".`);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
