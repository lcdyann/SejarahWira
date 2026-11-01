/**
 * ============================================================================
 * utils/dbError.js  -  menerangkan ralat pelayan / pangkalan data dalam bahasa yang jelas.
 *
 * Sebelum ini ralat tidak dijangka hanya menjawab "gagal disimpan". Kini jawapan menyatakan
 * PUNCA yang boleh diketahui (contoh: teks terlalu panjang bagi ruangan X, rekod masih
 * digunakan, sambungan pangkalan data terputus). Mesej mentah MySQL TIDAK dihantar ke
 * pelayar (ia boleh mendedahkan nama jadual); ia hanya dicatat dalam log pelayan.
 * ============================================================================
 */

/** @returns {{status:number, code:string, detail:string}} */
export function explainError(err) {
  const code = (err && (err.code || err.errno)) || '';
  const msg = String((err && err.sqlMessage) || (err && err.message) || '');
  const column = (msg.match(/column '([^']+)'/i) || msg.match(/for column `?([A-Za-z0-9_]+)`?/i) || [])[1];

  switch (code) {
    case 'ER_DATA_TOO_LONG':
    case 1406:
      return { status: 422, code: 'DB_DATA_TOO_LONG', detail: `Teks terlalu panjang untuk disimpan${column ? ` dalam ruangan "${column}"` : ''}. Pendekkan teks itu.` };
    case 'ER_DUP_ENTRY':
    case 1062:
      return { status: 409, code: 'DB_DUPLICATE', detail: 'Rekod yang sama sudah wujud (nilai itu mesti unik). Gunakan nama atau nilai yang lain.' };
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
    case 1451:
      return { status: 409, code: 'DB_IN_USE', detail: 'Rekod ini masih digunakan oleh data lain (contoh: dialog, misi atau kemajuan pelajar), jadi tidak boleh dipadam atau diubah begitu.' };
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
    case 1452:
      return { status: 422, code: 'DB_MISSING_PARENT', detail: 'Data yang dirujuk tidak wujud lagi (mungkin sudah dipadam oleh guru lain). Muat semula halaman dan cuba lagi.' };
    case 'ER_BAD_NULL_ERROR':
    case 1048:
      return { status: 422, code: 'DB_REQUIRED', detail: `Satu ruangan wajib tidak diisi${column ? ` ("${column}")` : ''}.` };
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_WARN_DATA_OUT_OF_RANGE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 1366:
      return { status: 422, code: 'DB_BAD_VALUE', detail: `Nilai tidak sesuai untuk disimpan${column ? ` dalam ruangan "${column}"` : ''}. Semak jenis dan aksara yang digunakan (contoh: emoji tidak disokong).` };
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
    case 1213:
    case 1205:
      return { status: 503, code: 'DB_BUSY', detail: 'Pangkalan data sedang sibuk (guru lain sedang menyimpan). Tunggu sebentar dan cuba lagi.' };
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
    case 'ER_CON_COUNT_ERROR':
      return { status: 503, code: 'DB_UNREACHABLE', detail: 'Pelayan tidak dapat menghubungi pangkalan data. Pastikan MySQL sedang berjalan, kemudian cuba lagi.' };
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
    case 'ER_NO_SUCH_TABLE':
    case 1146:
      return { status: 500, code: 'DB_SETUP', detail: 'Pangkalan data belum disediakan dengan betul (jadual atau akaun tiada). Jalankan semula seed.sql dan semak fail .env.' };
    default:
      return { status: 500, code: 'SERVER_ERROR', detail: 'Ralat tidak dijangka di pelayan. Butiran dicatat dalam log pelayan; beritahu admin jika berulang.' };
  }
}

/**
 * Jawab dengan JSON yang menyatakan apa yang gagal dan mengapa.
 * @param {object} res
 * @param {Error}  err
 * @param {string} message  ayat tindakan, contoh: 'Babak gagal disimpan. Tiada perubahan dibuat.'
 * @param {string} [where]  bahagian (contoh: 'Menyimpan babak')
 */
export function failServer(res, err, message, where = '') {
  const { status, code, detail } = explainError(err);
  return res.status(status).json({ success: false, message, detail, code, ...(where ? { where } : {}) });
}
