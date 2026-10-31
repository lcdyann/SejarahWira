/**
 * ============================================================================
 * utils/mailer.js        hantar e-mel (untuk kod tetapan semula kata laluan)
 *
 * Tetapan dalam .env (semua dari penyedia e-mel anda, contoh Gmail "App Password" atau SMTP sekolah):
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465            (465 = selamat terus; 587 = STARTTLS)
 *   SMTP_USER=emel.anda@gmail.com
 *   SMTP_PASS=kata-laluan-aplikasi
 *   MAIL_FROM="SejarahWira <emel.anda@gmail.com>"     (kosong = guna SMTP_USER)
 *   APP_URL=https://alamat-laman-anda                 (untuk pautan dalam e-mel)
 * Jika tetapan tiada, e-mel tidak dihantar dan pelayan hanya mencatat amaran (laman tetap berjalan).
 * Pakej "nodemailer" dimuatkan hanya apabila perlu:  npm install
 * ============================================================================
 */
export const mailReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport = null;
async function getTransport() {
  if (transport) return transport;
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT) || 465;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transport;
}

/** @returns true bila dihantar, false bila gagal / tidak ditetapkan (tidak pernah melempar ralat) */
export async function sendMail({ to, subject, text, html }) {
  if (!mailReady()) { console.warn('[mel] SMTP belum ditetapkan dalam .env: e-mel tidak dihantar.'); return false; }
  try {
    const t = await getTransport();
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mel] gagal hantar:', err.message);
    return false;
  }
}
