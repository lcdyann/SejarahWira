import db from '../config/db.js';

/**
 * utils/dbTransaction.js   (backend/utils/)
 * Runs several queries as ONE unit: either all of them are saved or none.
 *   await withTransaction(async (conn) => { await conn.query(...); await conn.query(...); });
 */
export const withTransaction = async (work) => {
  if (typeof db.getConnection !== 'function') return work(db);   // pool without transaction support

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection already gone */ }
    throw err;
  } finally {
    conn.release();
  }
};