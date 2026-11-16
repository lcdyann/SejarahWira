import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import eraRoutes from './routes/eraRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import rewardRoutes from './routes/rewardRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import teacherProgressRoutes from './routes/teacherProgressRoutes.js';
import teacherProfileRoutes from './routes/teacherProfileRoutes.js';
import classRoutes from './routes/classRoutes.js';
import avatarRoutes from './routes/avatarRoutes.js';
import teacherNoteRoutes from './routes/teacherNoteRoutes.js';   // nota guru (lapisan tambahan guru)
import entityRoutes from './routes/entityRoutes.js';       // Pendekar Bayang lines (student, read only)

import db from './config/db.js';
import { ClassModel } from './models/Class.js';
import { guardRequest } from './utils/inputGuard.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// The pages and the API come from this same server, so no cross-site access is needed.
// Only if you host the front end elsewhere: set CORS_ORIGIN=https://your-site (comma list allowed).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
}
// behind a proxy / host (Render, Nginx...) set TRUST_PROXY=1 so the real visitor address is used for the login limit
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});
app.use(express.json({ limit: '1mb' }));
// penapis input pusat: aksara kawalan, corak SQL injection, kunci bahaya (lihat utils/inputGuard.js)
app.use('/api', guardRequest);

// ---------------------------------------------------------------------------
// Static front-end (HTML, CSS, JS, images) from the project root, where
// student/, teacher/ and assets/ live.
// The project root also contains backend/ (source code, database config) and
// the .sql files, so those must never be downloadable.
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.join(__dirname, '../');
const BLOCKED = /^\/+(backend|database|node_modules|\.git)(\/|$)|^\/+(Dockerfile|DEPLOY\.md|\.dockerignore|\.gitignore)$|\.(sql|env|log)$/i;
 
const isBlockedPath = (rawPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);       // "%62ackend" is "backend"
  } catch {
    return true;                                 // malformed encoding: refuse
  }
  const normalized = path.posix.normalize(`/${decoded.replace(/\\/g, '/')}`); // "/./backend", "//backend"
  return BLOCKED.test(normalized);
};
 
app.use((req, res, next) => (isBlockedPath(req.path) ? res.status(404).end() : next()));
// Fail JS/CSS/HTML: pelayar WAJIB menyemak semula setiap kali (no-cache), supaya perubahan kod terus kelihatan
// tanpa perlu "hard refresh". Gambar dan bunyi masih boleh disimpan dalam cache.
app.use(express.static(PROJECT_ROOT, {
  setHeaders: (res, fail) => {
    if (/\.(js|css|html)$/i.test(fail)) res.setHeader('Cache-Control', 'no-cache');
    else if (/\.(png|jpe?g|webp|mp3|ogg|wav)$/i.test(fail)) res.setHeader('Cache-Control', 'public, max-age=86400');   // gambar dan bunyi: cache 1 hari
  }
}));

// Health check for the host (is the server up, and can it reach the database?)
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, status: 'ok' });
  } catch {
    res.status(503).json({ success: false, status: 'database tidak dapat dicapai' });
  }
});

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/era', eraRoutes);
app.use('/api/eras', eraRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/story', storyRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/reward',rewardRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/teacher-progress', teacherProgressRoutes);
app.use('/api/teacher-profile', teacherProfileRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/avatar', avatarRoutes);
app.use('/api/entity', entityRoutes);
app.use('/api/teacher-notes', teacherNoteRoutes);

// Unknown /api URLs answer with JSON, never an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Laluan API tidak dijumpai.' });
});
 
// Fallback route to serve main login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});
 
// Last-resort error handler (bad JSON body, unexpected crash): no stack trace to the browser
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Data permintaan tidak sah.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Fail terlalu besar (maksimum 2 MB).' });
  }
  console.error('Unhandled server error:', err);
  return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
});
 
// Start: make sure the public class PUBLIC/0000 exists (rows only), then listen.
// A database that is down at start-up does not stop the server; /api/health will say so.
async function start() {
  try {
    await ClassModel.ensurePublicClass();
    if (process.env.NODE_ENV === 'production') {
      const [[weak]] = await db.query("SELECT COUNT(*) AS n FROM User WHERE password = '123456'");
      if (weak.n > 0) console.warn(`[security] ${weak.n} account(s) still use the seed password 123456. Change them before going public.`);
    }
  } catch (err) {
    console.error('[start] could not prepare the public class:', err.message);
  }
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  const stop = () => server.close(() => db.end().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
start();