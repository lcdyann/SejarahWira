/**
 * ============================================================================
 * contentPermissions.js  -  SUIS KEBENARAN GURU (admin sahaja)
 * Muncul di halaman "Pilih Era" untuk admin. Setiap guru ada satu suis:
 *   TUTUP (asal)  = guru hanya boleh lihat kandungan tetap + tulis Nota Guru + cipta kandungan sendiri.
 *   BUKA          = guru boleh mengubah SEMUA naratif + soalan seperti admin (tiada kunci kelabu).
 *                   Perubahan terpakai untuk semua kelas kerana kandungan tetap dikongsi.
 * Pelayan menyemak kebenaran (middleware/requireContentOwner.js), bukan skrin ini.
 * Uses: h(), setChildren() (contentManagerEngine.js)
 * ============================================================================
 */
class TeacherPermissions {
  constructor(app) { this.app = app; }

  async mount() {
    const host = this.app.$('view-eras');
    let box = host.querySelector('.cm-perm');
    if (!box) {
      box = h('section', { class: 'cm-perm', 'aria-labelledby': 'perm-title' });
      host.appendChild(box);
    }
    let teachers = [];
    try {
      teachers = (await this.app.api('/teacher-permissions')).teachers;
    } catch (err) {
      return;                                                 // bukan admin / gagal: panel tidak dipaparkan
    }

    const rows = teachers.length
      ? teachers.map((t) => this.row(t))
      : [h('p', { class: 'cm-muted', text: 'Belum ada guru lain yang mendaftar.' })];

    setChildren(box,
      h('h2', { class: 'cm-section-title', id: 'perm-title' }, h('i', { class: 'fas fa-toggle-on' }), ' Kebenaran Guru (admin)'),
      h('p', { class: 'cm-muted', text: 'Suis TUTUP: guru hanya boleh melihat kandungan tetap, menulis Nota Guru dan mencipta kandungan sendiri. Suis BUKA: guru itu boleh mengubah semua naratif dan soalan seperti admin. Perubahan dilihat oleh semua kelas. NPC, gambar dan Suara Pendekar Bayang kekal admin sahaja.' }),
      h('div', { class: 'cm-perm-list' }, rows));
  }

  row(t) {
    const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': `Benarkan ${t.name} mengubah semua naratif dan soalan` });
    input.checked = t.canEditFixed;
    const state = h('span', { class: 'cm-perm-state', text: t.canEditFixed ? 'BUKA' : 'TUTUP' });
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        const r = await this.app.api(`/teacher-permissions/${encodeURIComponent(t.teacherID)}`, { method: 'PUT', body: { canEditFixed: input.checked } });
        state.textContent = input.checked ? 'BUKA' : 'TUTUP';
        this.app.toast(r.message);
      } catch (err) {
        input.checked = !input.checked;                       // gagal: suis kembali seperti asal
        if (err.status !== 401) this.app.toast((err.data && err.data.message) || 'Suis gagal disimpan.', 'error');
      } finally {
        input.disabled = false;
      }
    });
    return h('label', { class: 'cm-perm-row' },
      h('span', { class: 'cm-perm-name', text: t.name }),
      h('small', { class: 'cm-muted', text: `${t.classCount} kelas` }),
      h('span', { class: 'cm-spacer' }),
      state, input);
  }
}
window.TeacherPermissions = TeacherPermissions;
