/**
 * ============================================================================
 * scripts/import-sql.js  -  masukkan fail .sql ke pangkalan data hos (tanpa perlu pasang klien MySQL)
 *
 * KEGUNAAN: import database/sejarahwira_db.sql ke TiDB Cloud / MySQL terurus.
 * AWAS: fail itu memadam dan membina semula semua jadual (data lama diganti).
 *
 * CARA (PowerShell, dalam folder backend). Tetapan hanya hidup dalam tetingkap ini, tidak disimpan dalam fail:
 *   $env:DB_HOST="gateway....tidbcloud.com"
 *   $env:DB_PORT="4000"
 *   $env:DB_USER="xxxxx.root"
 *   $env:DB_PASSWORD="kata-laluan-anda"
 *   $env:DB_SSL="true"
 *   node scripts/import-sql.js ../database/sejarahwira_db.sql
 *
 * Skrip membaca fail, memecahkannya kepada penyata SQL (sedar tanda petik dan komen),
 * lalu menjalankannya satu demi satu. Ia berhenti pada ralat pertama dan menyatakan penyata mana.
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

// pecahkan teks SQL pada ';' di luar petik / komen. Semua komen dibuang (termasuk komen bersyarat gaya phpMyAdmin).
export function pecahSql(teks) {
  const hasil = [];
  let semasa = '';
  let i = 0;
  const n = teks.length;
  while (i < n) {
    const c = teks[i];
    const d = teks[i + 1];
    // komen satu baris:  -- ...  (mesti diikuti ruang)  atau  # ...
    if ((c === '-' && d === '-' && /\s/.test(teks[i + 2] || ' ')) || c === '#') {
      while (i < n && teks[i] !== '\n') i += 1;
      continue;
    }
    // komen blok  /* ... */
    if (c === '/' && d === '*') {
      const tamat = teks.indexOf('*/', i + 2);
      i = tamat < 0 ? n : tamat + 2;
      continue;
    }
    // rentetan / nama dalam petik ('  "  `)
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (teks[j] === '\\' && c !== '`') { j += 2; continue; }
        if (teks[j] === c) {
          if (teks[j + 1] === c) { j += 2; continue; }        // petik berganda = petik biasa dalam rentetan
          break;
        }
        j += 1;
      }
      semasa += teks.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ';') {
      if (semasa.trim()) hasil.push(semasa.trim());
      semasa = '';
      i += 1;
      continue;
    }
    semasa += c;
    i += 1;
  }
  if (semasa.trim()) hasil.push(semasa.trim());
  return hasil;
}

// TiDB memeriksa kunci asing (FOREIGN KEY) sebaik sahaja jadual dicipta, tidak seperti MySQL/MariaDB yang
// membenarkannya bila FOREIGN_KEY_CHECKS=0. Jadual teachernote dalam fail SQL mempunyai kunci asing ke
// jadual yang BELUM ada (teacher, dialogueline), jadi kita tangguhkan: buang baris CONSTRAINT daripada
// CREATE TABLE, lalu tambah semula sebagai ALTER TABLE di penghujung (selepas semua jadual dan indeks wujud).
export function tangguhkanKunciAsing(penyata) {
  const tertangguh = [];
  const baharu = penyata.map((p) => {
    const nama = /^CREATE TABLE\s+`([^`]+)`/i.exec(p);
    if (!nama) return p;
    const baris = p.split('\n');
    const kekangan = baris.filter((b) => /^\s*CONSTRAINT\s+`[^`]+`\s+FOREIGN KEY/i.test(b));
    if (!kekangan.length) return p;
    const baki = baris.filter((b) => !kekangan.includes(b));
    // baris terakhir sebelum ")" tidak boleh berakhir dengan koma
    const tutup = baki.findIndex((b) => /^\)/.test(b));
    baki[tutup - 1] = baki[tutup - 1].replace(/,\s*$/, '');
    tertangguh.push(`ALTER TABLE \`${nama[1]}\`\n` + kekangan.map((b) => '  ADD ' + b.trim().replace(/,$/, '')).join(',\n'));
    return baki.join('\n');
  });
  return [...baharu, ...tertangguh];
}

// TiDB TIDAK membenarkan menambah AUTO_INCREMENT pada lajur yang sudah wujud (ALTER ... MODIFY ... AUTO_INCREMENT),
// sedangkan fail SQL (gaya phpMyAdmin) mencipta jadual dahulu, kemudian menambah kunci utama, kemudian AUTO_INCREMENT.
// Jadi kita susun semula: letak AUTO_INCREMENT dan PRIMARY KEY terus dalam CREATE TABLE, buang ADD PRIMARY KEY
// dan MODIFY yang berkaitan, dan tetapkan nombor seterusnya dengan ALTER TABLE ... AUTO_INCREMENT = N di penghujung.
export function letakAutoIncrementDalamCipta(penyata) {
  const MODIFY = /^ALTER TABLE\s+`([^`]+)`\s+MODIFY\s+`([^`]+)`[^]*?\bAUTO_INCREMENT(?:\s*,\s*AUTO_INCREMENT\s*=\s*(\d+))?\s*$/i;
  const rancangan = new Map();                       // jadual -> { lajur, seterusnya }
  for (const p of penyata) {
    const m = MODIFY.exec(p);
    if (m) rancangan.set(m[1], { lajur: m[2], seterusnya: m[3] || null });
  }
  const akhir = [];
  const hasil = [];
  for (const p of penyata) {
    if (MODIFY.test(p)) continue;                    // MODIFY dibuang (digantikan dalam CREATE TABLE)
    const cipta = /^CREATE TABLE\s+`([^`]+)`/i.exec(p);
    if (cipta && rancangan.has(cipta[1])) {
      const { lajur } = rancangan.get(cipta[1]);
      const baris = p.split('\n');
      const i = baris.findIndex((b) => b.trim().startsWith(`\`${lajur}\``));
      if (i < 0) throw new Error(`Lajur ${lajur} tiada dalam CREATE TABLE ${cipta[1]}`);
      baris[i] = baris[i].replace(/,?\s*$/, ' AUTO_INCREMENT,');
      const tutup = baris.findIndex((b) => /^\)/.test(b));
      baris[tutup - 1] = baris[tutup - 1].replace(/,?\s*$/, ',');
      baris.splice(tutup, 0, `  PRIMARY KEY (\`${lajur}\`)`);
      hasil.push(baris.join('\n'));
      continue;
    }
    const ubah = /^ALTER TABLE\s+`([^`]+)`\s+([^]*)$/i.exec(p);
    if (ubah && rancangan.has(ubah[1]) && /ADD PRIMARY KEY/i.test(ubah[2])) {
      const { lajur } = rancangan.get(ubah[1]);
      const klausa = ubah[2].split(/,\s*(?=ADD\s)/i).map((k) => k.trim());
      const pk = klausa.findIndex((k) => /^ADD PRIMARY KEY/i.test(k));
      if (klausa[pk].replace(/\s+/g, '') !== `ADDPRIMARYKEY(\`${lajur}\`)`) {
        throw new Error(`Kunci utama ${ubah[1]} bukan hanya ${lajur}: ${klausa[pk]}`);
      }
      klausa.splice(pk, 1);                          // PRIMARY KEY sudah ada dalam CREATE TABLE
      if (klausa.length) hasil.push(`ALTER TABLE \`${ubah[1]}\`\n  ` + klausa.join(',\n  '));
      continue;
    }
    hasil.push(p);
  }
  for (const [jadual, { seterusnya }] of rancangan) {
    if (seterusnya) akhir.push(`ALTER TABLE \`${jadual}\` AUTO_INCREMENT = ${seterusnya}`);
  }
  return [...hasil, ...akhir];
}

// ralat sambungan terputus (TiDB awam memutuskan sambungan yang lama / diam): sambung semula dan cuba lagi
const RALAT_SAMBUNGAN = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED'];
// ralat "sudah ada" bermaksud penyata itu sebenarnya sudah berjaya sebelum sambungan terputus: langkau
const RALAT_SUDAH_ADA = [1060, 1061, 1068, 1826, 1022];

async function utama() {
  const fail = process.argv[2];
  if (!fail) { console.error('Guna:  node scripts/import-sql.js <fail.sql>'); process.exit(1); }
  const penyata = letakAutoIncrementDalamCipta(tangguhkanKunciAsing(pecahSql(fs.readFileSync(path.resolve(fail), 'utf8'))));
  console.log(`[import] ${penyata.length} penyata dalam ${fail}`);

  const v = String(process.env.DB_SSL || '').toLowerCase();
  const ssl = v === 'true' || v === '1' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    : v === 'insecure' ? { rejectUnauthorized: false } : undefined;

  let sambung = null;
  let pangkalanSemasa = null;                 // nama pangkalan data daripada penyata USE terakhir

  /** buka sambungan baharu dan pulihkan tetapan sesi (USE, kunci asing dimatikan) */
  const buka = async () => {
    if (sambung) { try { sambung.destroy(); } catch { /* abaikan */ } }
    sambung = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      charset: 'utf8mb4', ssl, connectTimeout: 20000, enableKeepAlive: true, keepAliveInitialDelay: 10000
    });
    await sambung.query('SET FOREIGN_KEY_CHECKS = 0');
    if (pangkalanSemasa) await sambung.query(`USE \`${pangkalanSemasa}\``);
  };

  await buka();
  console.log('[import] bersambung ke', process.env.DB_HOST);

  for (let k = 0; k < penyata.length; k += 1) {
    const guna = /^USE\s+`([^`]+)`/i.exec(penyata[k]);
    if (guna) pangkalanSemasa = guna[1];
    let percubaan = 0;
    for (;;) {
      try {
        await sambung.query(penyata[k]);
        break;
      } catch (err) {
        if (RALAT_SAMBUNGAN.includes(err.code) || err.fatal) {
          percubaan += 1;
          if (percubaan > 4) { console.error(`\n[import] GAGAL pada penyata ${k + 1}/${penyata.length}: ${err.message} (sambungan putus berulang kali)`); process.exit(1); }
          console.log(`[import] sambungan terputus pada penyata ${k + 1}, menyambung semula (percubaan ${percubaan})...`);
          await new Promise((r) => setTimeout(r, 2000 * percubaan));
          await buka();
          continue;
        }
        if (percubaan > 0 && RALAT_SUDAH_ADA.includes(err.errno)) {
          console.log(`[import] penyata ${k + 1} sudah berjaya sebelum sambungan putus, dilangkau.`);
          break;
        }
        console.error(`\n[import] GAGAL pada penyata ${k + 1}/${penyata.length}: ${err.message}`);
        console.error('Penyata:', penyata[k].slice(0, 300));
        await sambung.end().catch(() => {});
        process.exit(1);
      }
    }
    if ((k + 1) % 20 === 0) console.log(`[import] ${k + 1}/${penyata.length}`);
  }
  await sambung.end();
  console.log('[import] SELESAI tanpa ralat.');
}

// hanya jalan bila dipanggil terus (bukan bila diimport)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  utama().catch((err) => { console.error('[import] ralat:', err.message); process.exit(1); });
}
