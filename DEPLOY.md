# SejarahWira - Senarai semak hosting (untuk ujian)

## 1. Apa yang perlu ada
- Hos Node 22 (Render / Railway / VPS) **atau** Docker (`docker build -t sejarahwira .`). Satu bekas melayan laman + API (port 5000).
- Pangkalan data MySQL/MariaDB (hos terurus atau sendiri).
- Domain + HTTPS (disediakan oleh hos; tetapkan `TRUST_PROXY=1`).

## 2. Pangkalan data
1. Cipta pengguna DB khas (BUKAN root) dengan kata laluan kuat, hak hanya pada `sejarahwira_db`.
2. Import `database/sejarahwira_db.sql` (sudah termasuk `teachernote` dan lajur pemilik naratif). Jika DB lama: jalankan `database/tambah_nota_guru.sql`. Fail ini memadam & membina semula semua jadual.
3. Jangan import `uji_epilog.sql` di pelayan sebenar.
4. Akaun uji `student / 123456` masih ada untuk ujian anda. **Padam sebelum pelajar sebenar guna** (pelayan memberi amaran dalam log).

## 3. Pembolehubah persekitaran (isi pada panel hos, bukan dalam fail)
| Nama | Nilai |
|---|---|
| NODE_ENV | production |
| TRUST_PROXY | 1 |
| AUTH_SECRET | teks rawak panjang (WAJIB, jangan guna semula yang lain) |
| ADMIN_USERNAMES | diyananadra |
| CONTENT_ADMIN_ONLY | true  (kandungan tetap terkunci; guru hanya tulis Nota Guru) |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | ikut DB hos |
| DB_SSL | true (jika DB terurus) |
| APP_URL | https://domain-anda |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | perlu untuk pendaftaran guru & lupa kata laluan |
| ENABLE_SIGNUP | true (tukar false selepas guru ujian mendaftar) |
| TEACHER_SIGNUP_CODE / TEACHER_EMAIL_DOMAINS | pilihan, untuk hadkan pendaftaran guru |

Jana AUTH_SECRET: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 4. Selepas deploy, semak
- `https://domain-anda/api/health` menjawab OK.
- Log masuk guru admin -> Urus Kandungan boleh diubah; guru biasa -> Urus Kandungan baca sahaja, **Nota Guru** boleh ditulis.
- Pelajar dalam kelas guru nampak ikon buku (kanan atas, di luar kotak dialog) pada baris yang ada nota; pelajar awam tidak.
- Cuba main satu era hingga tamat + Ulang Prolog / Ulang Epilog.

## 5. Peraturan data (ringkas)
- Kandungan tetap (ownerTeacherID kosong): hanya admin ubah (`CONTENT_ADMIN_ONLY=true`).
- Naratif tambahan guru: guru boleh cipta/ubah naratif, babak, dialog dan misi MILIKNYA sahaja; hanya pelajar dalam kelas guru itu nampak, dan masuk undian rawak era.
- Soalan, NPC, suara Pendekar Bayang: admin sahaja (dikongsi semua).
- Gambar: tiada muat naik oleh guru. Gambar baharu diletak admin dalam `assets/gameAsset/background` atau `npc` sebelum deploy.
- Nota guru: satu guru = satu lapisan sendiri; dilihat pelajar semua kelas guru itu sahaja.
- Sandaran: eksport DB sebelum setiap sesi ujian.
