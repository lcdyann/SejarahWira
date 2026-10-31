/**
 * Create an admin teacher account from the command line (it is an ordinary teacher account whose
 * username is listed in ADMIN_USERNAMES). Public sign-up can never create these usernames.
 *   node scripts/create-admin.js <username> "<password, 8+ characters>" "<full name>"
 * Then add the username to ADMIN_USERNAMES in .env and restart.
 */
import db from '../config/db.js';
import { hashPassword } from '../utils/passwordUtil.js';

const [username, password, name] = process.argv.slice(2);
if (!username || !password || password.length < 8 || !name) {
  console.error('Use:  node scripts/create-admin.js <username> "<password of at least 8 characters>" "<full name>"');
  process.exit(1);
}

try {
  const user = username.toLowerCase();
  const [[have]] = await db.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [user]);
  if (have) throw new Error(`"${user}" already exists. Use set-password.js to change its password.`);
  const [[row]] = await db.query("SELECT MAX(CAST(SUBSTRING(teacherID, 2) AS UNSIGNED)) AS n FROM Teacher WHERE teacherID REGEXP '^T[0-9]+$'");
  const teacherID = `T${Math.max(1000, Number(row && row.n) || 0) + 1}`;
  const [u] = await db.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [user, 'Teacher', await hashPassword(password, 'scrypt')]);
  await db.query('INSERT INTO Teacher (teacherID, teacherName, userID) VALUES (?, ?, ?)', [teacherID, name, u.insertId]);
  console.log(`Created ${teacherID} "${user}". Add "${user}" to ADMIN_USERNAMES (.env) and restart the server.`);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
