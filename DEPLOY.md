# SejarahWira - Senarai semak hosting (untuk ujian)

## 1. Apa yang perlu ada
- Hos Node 22 (Render / Railway / VPS) **atau** Docker (`docker build -t sejarahwira .`). Satu bekas melayan laman + API (port 5000).
- Pangkalan data MySQL/MariaDB (hos terurus atau sendiri).
- Domain + HTTPS (disediakan oleh hos; tetapkan `TRUST_PROXY=1`).

## 2. Pangkalan data
1. Cipta pengguna DB khas (BUKAN root) dengan kata laluan kuat, hak hanya pada `sejarahwira_db`.
2. Import `database/sejarahwira_db.sql` (sudah termasuk Nota Guru, lajur pemilik naratif/soalan dan suis guru). Fail ini memadam & membina semula semua jadual. Selepas import, hash kata laluan admin sudah ada dalam fail; akaun lain guna kata laluan asal, tukar sebelum digunakan.
3. Jangan import `uji_epilog.sql` di pelayan sebenar.
4. Akaun uji `student / 123456` masih ada untuk ujian anda. **Padam sebelum pelajar sebenar guna** (pelayan memberi amaran dalam log).

## 3. Pembolehubah persekitaran (isi pada panel hos, bukan dalam fail)
| Nama | Nilai |
|---|---|
| NODE_ENV | production |
| TRUST_PROXY | 1 |
| AUTH_SECRET | teks rawak panjang (WAJIB, jangan guna semula yang lain) |
| ADMIN_USERNAMES | diyananadra |
| CONTENT_ADMIN_ONLY | true  (kandungan tetap terkunci; guru tulis Nota Guru + cipta naratif/soalan sendiri) |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | ikut DB hos |
| DB_SSL | true (jika DB terurus) |
| APP_URL | https://domain-anda |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | perlu untuk pendaftaran guru & lupa kata laluan |
| ENABLE_SIGNUP | true (tukar false selepas guru ujian mendaftar) |
| TEACHER_SIGNUP_CODE / TEACHER_EMAIL_DOMAINS | pilihan, untuk hadkan pendaftaran guru |

Jana AUTH_SECRET: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 4. Selepas deploy, semak
- `https://domain-anda/api/health` menjawab OK.
- Log masuk guru admin -> Urus Kandungan boleh diubah penuh. Guru biasa -> kandungan tetap kelabu (baca + Nota Guru), naratif/soalan sendiri boleh diubah; hidupkan suis guru (panel admin) untuk membuka semua.
- Pelajar dalam kelas guru nampak ikon buku (kanan atas, di luar kotak dialog) pada baris yang ada nota; pelajar awam tidak.
- Cuba main satu era hingga tamat + Ulang Prolog / Ulang Epilog.

## 5. Peraturan data (ringkas)
- Kandungan tetap (ownerTeacherID kosong): hanya admin ubah, kecuali guru yang suisnya DIBUKA admin (boleh ubah semua naratif + soalan; perubahan dilihat semua kelas).
- Naratif dan soalan tambahan guru: milik guru itu sahaja; hanya pelajar dalam kelas guru itu nampak, dan masuk undian rawak era.
- Nota Guru: satu guru = satu lapisan sendiri; dilihat pelajar semua kelas guru itu sahaja.
- NPC dan Suara Pendekar Bayang: admin sahaja (dikongsi semua kelas). Tab Suara Pendekar Bayang tidak dipaparkan kepada guru.
- Gambar: tiada muat naik oleh guru. Gambar baharu diletak admin dalam `assets/gameAsset/background` atau `npc` sebelum deploy.
- Sandaran: eksport DB sebelum setiap sesi ujian.
