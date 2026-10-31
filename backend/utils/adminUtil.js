/**
 * ============================================================================
 * utils/adminUtil.js
 * The admin is an ordinary teacher account whose USERNAME is listed in ADMIN_USERNAMES
 * (comma separated, in .env). No database column is needed.
 * Admin = same pages as every teacher, plus: can edit the fixed / public learning content
 * and can see the public students (class PUBLIC/0000) in progress and analytics.
 * Default when the setting is empty: the seed account "teacher".
 * ============================================================================
 */
const list = () => String(process.env.ADMIN_USERNAMES || 'teacher')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const isAdminUsername = (username) => list().includes(String(username || '').toLowerCase());
