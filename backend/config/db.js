import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * ============================================================================
 * config/db.js  -  the MySQL connection (works on your PC and on a host)
 *
 * Either give ONE address:        DATABASE_URL=mysql://user:password@host:3306/dbname
 * or the separate settings:       DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * Hosted MySQL (Railway, Aiven, TiDB, PlanetScale, AWS RDS ...) usually needs encryption:
 *                                 DB_SSL=true            (use DB_SSL=insecure only for a quick test)
 * Pool size:                      DB_POOL=10
 * ============================================================================
 */
const ssl = (() => {
  const v = String(process.env.DB_SSL || '').toLowerCase();
  if (v === 'true' || v === '1') return { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (v === 'insecure') return { rejectUnauthorized: false };
  return undefined;
})();

const common = {
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  connectTimeout: 15000,
  enableKeepAlive: true,
  ssl
};

const pool = process.env.DATABASE_URL
  ? mysql.createPool({ uri: process.env.DATABASE_URL, ...common })
  : mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sejarahwira_db',
    ...common
  });

export default pool;
