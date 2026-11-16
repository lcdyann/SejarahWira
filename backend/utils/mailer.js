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
 *
 * CARA 2 (untuk hos percuma seperti Render yang MENYEKAT port SMTP 25/465/587): guna API HTTP Brevo.
 *   BREVO_API_KEY=kunci-api-dari-brevo
 *   MAIL_FROM="SejarahWira <emel-yang-disahkan-di-brevo>"   (WAJIB; alamat ini mesti didaftar sebagai Sender di Brevo)
 * Jika BREVO_API_KEY ditetapkan, cara ini dipakai dahulu. Jika tidak, cara SMTP di atas dipakai seperti biasa.
 *
 * Jika tetapan tiada, e-mel tidak dihantar dan pelayan hanya mencatat amaran (laman tetap berjalan).
 * Pakej "nodemailer" dimuatkan hanya apabila perlu:  npm install
 * ============================================================================
 */
const guaBrevo = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
export const mailReady = () => guaBrevo() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/** pecahkan  "Nama <emel@contoh.com>"  kepada { name, email } (juga menerima emel sahaja) */
function pecahPengirim(nilai) {
  const m = String(nilai).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || 'SejarahWira', email: m[2].trim() } : { name: 'SejarahWira', email: String(nilai).trim() };
}

/** hantar melalui API HTTP Brevo (HTTPS port 443, tidak disekat hos percuma) */
async function hantarBrevo({ to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: pecahPengirim(process.env.MAIL_FROM),
      to: [{ email: to }],
      subject,
      ...(html ? { htmlContent: html } : {}),
      ...(text ? { textContent: text } : {})
    })
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

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
    if (guaBrevo()) { await hantarBrevo({ to, subject, text, html }); return true; }
    const t = await getTransport();
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mel] gagal hantar:', err.message);
    return false;
  }
}
