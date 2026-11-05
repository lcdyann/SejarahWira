/**
 * ============================================================================
 * contentGuide.js  -  "Cara ia berfungsi": a short step-by-step guide for teachers
 *
 *   - the button "Cara ia berfungsi" (top of the page) opens it any time
 *   - it opens by itself the FIRST time a teacher visits this page
 *     (the "seen" flag is only a convenience kept in the browser; the page works without it)
 * Plain words, no software terms. Uses the Dialog and h() helpers of the content manager.
 * ============================================================================
 */
const GUIDE_FLAG = 'sejarahwira_cm_guide_seen';

const guideSeen = () => { try { return window.localStorage.getItem(GUIDE_FLAG) === '1'; } catch { return false; } };
const markGuideSeen = () => { try { window.localStorage.setItem(GUIDE_FLAG, '1'); } catch { /* fine */ } };

class ContentGuide {
  constructor(app) {
    this.app = app;
    this.index = 0;
    this.steps = this.buildQuickSteps();      // panduan ringkas untuk guru baharu
  }

  /**
   * PANDUAN RINGKAS (dibuka dahulu): bahasa mudah, satu idea setiap langkah.
   * Panduan terperinci (cara menulis dialog, misi, Giliran Anda dan lain-lain) ada pada butang
   * "Panduan terperinci" di langkah terakhir; isinya ialah buildSteps() di bawah.
   */
  buildQuickSteps() {
    const li = (strong, text) => h('li', {}, h('strong', { text: `${strong} ` }), text);
    const tag = (text) => h('span', { class: 'story-flow-step', text });
    const arrow = () => h('i', { class: 'fas fa-arrow-right' });
    const flow = (...labels) => h('div', { class: 'story-flow guide-flow' }, labels.flatMap((l, i) => (i ? [arrow(), tag(l)] : [tag(l)])));
    return [
      {
        title: 'Dua jenis cerita',
        body: [
          h('ul', { class: 'guide-list' },
            li('🔒 Tetap:', 'cerita rasmi untuk semua murid. Anda boleh melihat, memainkannya dan menulis Nota Guru. Anda tidak boleh mengubahnya.'),
            li('✏️ Milik saya:', 'cerita yang anda cipta sendiri. Anda boleh mengubah semuanya.')),
          h('p', { class: 'cm-muted', text: 'Murid di semua kelas anda nampak kedua-duanya. Murid guru lain tidak nampak cerita dan soalan anda.' })
        ]
      },
      {
        title: 'Cara mencari cerita',
        body: [
          flow('Pilih era', 'Pilih naratif', 'Pilih babak'),
          h('p', { text: 'Setiap kad naratif ada tanda "Tetap" atau "Milik saya". Klik kad itu, kemudian klik satu babak untuk melihat isinya.' })
        ]
      },
      {
        title: 'Tulis Nota Guru pada cerita tetap',
        body: [
          h('p', { text: 'Mahu menambah penerangan pada cerita tetap? Tulis nota.' }),
          h('ol', { class: 'guide-list' },
            li('1.', 'Buka naratif bertanda "Tetap", pilih satu babak.'),
            li('2.', 'Di bawah setiap baris dialog ada kotak "Nota Guru". Tulis nota anda.'),
            li('3.', 'Tekan "Simpan nota". Siap.')),
          h('p', { class: 'cm-muted', text: 'Murid anda akan nampak buku kecil bercahaya di atas kotak dialog pada baris itu. Mereka tekan buku itu untuk membaca nota anda. Contoh nota: "Ingat tarikh ini, ia selalu keluar dalam peperiksaan."' })
        ]
      },
      {
        title: 'Cipta cerita sendiri',
        body: [
          h('ol', { class: 'guide-list' },
            li('1.', 'Tekan "Naratif Baharu" dan isi tajuk serta ringkasan.'),
            li('2.', 'Tambah babak: pilih gambar latar dan tulis apa yang berlaku.'),
            li('3.', 'Tulis dialog, kemudian tambah misi (permainan) pada babak.'),
            li('4.', 'Tekan "Main Naratif" untuk mencuba. Tiada apa yang disimpan semasa anda main.')),
          h('p', { class: 'cm-muted', text: 'Satu naratif perlu sekurang-kurangnya 3 babak yang ada misi. Cerita anda akan muncul secara rawak bersama cerita tetap apabila murid anda bermain era itu.' })
        ]
      },
      {
        title: 'Tambah soalan sendiri',
        body: [
          h('p', { text: 'Buka tab "Soalan" dan tekan "Tambah Soalan". Soalan anda dicampur dengan soalan tetap dalam latihan dan ujian murid anda sahaja.' }),
          h('p', { class: 'cm-muted', text: 'Soalan tetap berwarna kelabu dan tidak boleh diubah. Soalan yang anda tambah ditanda "Soalan saya" dan boleh diubah atau dipadam.' })
        ]
      },
      {
        title: 'Rekod anda',
        body: [
          h('p', { text: 'Bahagian "Perubahan Terkini" menunjukkan perubahan yang anda buat sendiri. Guru lain tidak nampaknya.' }),
          h('p', { class: 'cm-muted', text: 'Panduan ini boleh dibuka semula bila-bila masa dengan butang "Cara ia berfungsi" di atas halaman.' })
        ]
      }
    ];
  }

  /** PANDUAN TERPERINCI: cara menulis dialog, misi, Giliran Anda dan lain-lain (untuk yang mencipta cerita sendiri). */
  buildSteps() {
    const tag = (text) => h('span', { class: 'story-flow-step', text });
    const arrow = () => h('i', { class: 'fas fa-arrow-right' });
    const flow = (...labels) => h('div', { class: 'story-flow guide-flow' }, labels.flatMap((l, i) => (i ? [arrow(), tag(l)] : [tag(l)])));
    const li = (strong, text) => h('li', {}, h('strong', { text: `${strong} ` }), text);
    const types = Object.values(QuestRules.TYPES || {});

    return [
      {
        title: 'Cerita dibina dalam lapisan',
        body: [
          h('p', { text: 'Setiap era ada beberapa naratif (versi cerita). Setiap naratif terdiri daripada babak, dan setiap babak ialah satu peristiwa sejarah.' }),
          flow('Era', 'Naratif', 'Babak', 'Misi + Dialog'),
          h('p', { class: 'cm-muted', text: 'Contoh: Era Kesultanan Melaka, naratif "Serangan Portugis", babak 1 ialah 24 Ogos 1511 di Melaka.' }),
          h('p', { text: 'Pada halaman era, anda bekerja dari kiri ke kanan: pilih naratif (1), pilih babak (2), kemudian edit isi babak (3).' })
        ]
      },
      {
        title: 'Satu babak dimainkan dalam tiga langkah',
        body: [
          flow('1 Kad garis masa', '2 Cerita + Giliran Anda', '3 Misi'),
          h('ul', { class: 'guide-list' },
            li('1 Kad garis masa:', 'apa, bila dan di mana. Pelajar membacanya dahulu.'),
            li('2 Cerita:', 'dialog antara beberapa watak. Pada baris tertentu watak berpaling kepada pelajar dan pelajar memilih apa yang hendak dikatakan (Giliran Anda). Pelajar tidak boleh menekan Enter sahaja.'),
            li('3 Misi:', 'permainan yang mengukuhkan apa yang baru diceritakan. Jika salah, cerita rosak dan misi diulang. Butang Petunjuk (mentol) hanya ada semasa misi. Selepas gagal kali kedua butang Bantuan (?) bersinar dan petunjuk dibisikkan; selepas kali ketiga petunjuk menjadi lebih jelas (tidak pernah jawapan).')),
          h('p', { class: 'cm-muted', text: 'Babak yang tiada Giliran Anda dimainkan seperti dahulu: kad, misi, kemudian dialog selepas misi. Babak tanpa misi ialah cerita biasa. Jika sebuah babak ada lebih daripada satu misi, satu sahaja dimainkan secara rawak.' })
        ]
      },
      {
        title: 'Cerita mesti membawa kepada misi',
        body: [
          h('p', { text: 'Murid belajar apabila cerita dan misi bersambung. Misi bukan kuiz yang berasingan; ia kelanjutan apa yang baru diceritakan.' }),
          h('ul', { class: 'guide-list' },
            li('Baris dialog terakhir:', 'baris sebelum misi mesti membawa terus ke misi. Contoh: watak berkata "Sekarang tunjukkan kepada kami siapa yang menjalankan tinjauan itu", dan misi menanyakan perkara itu.'),
            li('Jawapan ada dalam cerita:', 'jawapan misi mesti boleh dijumpai oleh murid dengan membaca kad garis masa atau dialog babak itu. Sistem memberi AMARAN dalam Kesediaan Era jika jawapan betul misi Bantu Tokoh atau Nyahkod Clue tidak ditemui dalam cerita.'),
            li('Kad garis masa berkait dengan misi:', 'teks kad juga dibaca semula sebagai "Apa yang berlaku?" dalam butang Bantuan murid, jadi ia mesti menerangkan peristiwa yang ditanya misi.'),
            li('Dialog ialah suara watak sahaja:', 'tulis apa yang watak katakan, bukan huraian seperti "(tersenyum)" atau "Tunku berjalan ke hadapan".'),
            li('Petunjuk yang membantu:', 'tunjukkan di mana dalam cerita jawapan itu boleh dijumpai, tanpa menyebut jawapannya. Sistem memberi amaran jika sesebuah misi tiada petunjuk.'))
        ]
      },
      {
        title: 'Butang yang murid ada semasa bermain',
        body: [
          h('ul', { class: 'guide-list' },
            li('Catatan:', 'membaca semula dialog babak semasa. Ia hanya muncul selepas ada dialog yang dibaca (jawapan Giliran Anda tidak dicatat).'),
            li('Bantuan (?):', 'satu skrin ringkas: apa yang berlaku (kad garis masa dan baris dialog terakhir), apa yang perlu dibuat, dan demo bergerak cara bermain jenis misi itu. Ia bersinar bila murid diam 25 saat atau gagal dua kali. Demo juga dipaparkan sendiri sekali bagi setiap jenis misi.'),
            li('Petunjuk (mentol):', 'hanya ada semasa misi. Ia memaparkan petunjuk yang anda tulis pada misi itu.'),
            li('Jeda:', 'membekukan permainan dan membawa murid ke Lompong Masa, ruang rehat dengan tiga permainan kecil. Dialog berhenti tepat di tempatnya dan disambung semula selepas itu. Murid juga boleh keluar ke peta dari sini.'),
            li('Antara babak:', 'halaman buku diselak dengan ayat "Kisah ini belum selesai...". Selepas setiap tahap, murid melalui Lompong Masa dengan peta kemajuan babak.'))
        ]
      },
      {
        title: 'Peranan pelajar: pelajar ialah watak itu',
        body: [
          h('p', { text: 'Dalam setiap naratif, jiwa pelajar merasuk ke dalam jasad SATU watak sejarah (contoh: Tunku Abdul Rahman). Pelajar tidak lagi menonton cerita. Dia berada di dalamnya.' }),
          h('ul', { class: 'guide-list' },
            li('Pilih peranan:', 'dalam kotak Naratif di bahagian atas papan cerita ada kad biru "KAU KINI IALAH". Pilih watak daripada senarai (setiap naratif ada wataknya sendiri) dan tekan "Ayat peranan" untuk menulis tugas bersejarahnya. Kad ini dimainkan sebelum kad garis masa babak 1. Naratif tanpa peranan diberi amaran.'),
            li('Pengenalan:', 'sebelum babak 1, skrin menunjukkan avatar pelajar bertukar menjadi watak itu, dan Pendekar Bayang berkata siapa dia sekarang.'),
            li('Baris "Pemain":', 'dipaparkan dengan nama dan gambar watak peranan, bukan avatar. Balasan pelajar dalam Giliran Anda juga disebut sebagai watak itu.'),
            li('Watak lain bercakap kepada "kau":', 'tulis dialog seolah-olah watak lain memandang terus kepada pelajar. Contoh: "Tunku, kau nampak apa yang kami nampak?" Elakkan dialog yang hanya memaparkan cerita tanpa menyebut pemain.'),
            li('Kad garis masa dalam "kau":', '"24 Ogos 1511. Kau berdiri di tembok kota. Layar Portugis memenuhi laut."'),
            li('Penutup era:', 'watak yang dimainkan menerangkan tugas bersejarahnya (apa yang perlu dilakukan supaya sejarah berlaku dan mengapa ia penting), dan dia juga yang membuka pengajaran moral. Tulis kedua-dua dalam suara watak itu.')),
          h('p', { class: 'cm-muted', text: 'Jangan masukkan watak peranan sebagai penutur lain dalam naratif yang sama. Baris pelajar ditulis dengan penutur "Pemain" (kosong).' })
        ]
      },
      {
        title: 'Giliran Anda: pelajar bercakap dalam cerita',
        body: [
          h('p', { text: 'Ini yang menjadikan cerita sebuah permainan, bukan bacaan. Satu Giliran Anda terdiri daripada:' }),
          h('ul', { class: 'guide-list' },
            li('Soalan:', 'satu baris dialog daripada seorang watak, ditulis sebagai soalan kepada pelajar.'),
            li('Balasan:', '2 atau 3 perkara yang boleh dikatakan pelajar. Satu betul. Setiap balasan ada reaksi watak.'),
            li('Balasan salah:', 'tulis kesannya dalam cerita ("Kalau Borneo rasa diambil alih, mereka akan menolak."), bukan "Salah!". Pendekar Bayang berbisik petunjuk, skrin diputar semula dan watak bertanya semula. Hanya perbualan itu yang diulang, bukan seluruh babak.'),
            li('Petunjuk:', 'rujukan kepada dialog sebelumnya yang boleh dijumpai pelajar. Jangan tulis jawapannya.')),
          h('p', { class: 'cm-muted', text: 'Cara menambah: buka babak. Panel "Isi Babak" ada 3 baris: (1) kad garis masa dan latar, (2) dialog dan Giliran Anda, (3) misi. Dalam baris 2, di bawah setiap baris dialog ada butang bertitik "+ Giliran Anda selepas baris ini". Tekan untuk menambah. Untuk mengubah, tekan kotak biru Giliran Anda yang sedia ada. Tetingkap yang terbuka ada 3 langkah bernombor: siapa bertanya, apa yang boleh dibalas, petunjuk jika tersilap. Cadangan 1 hingga 3 setiap babak. Giliran Anda disimpan bersama misi babak itu, jadi babak mesti ada misi. Tulis reaksi balasan salah sebagai kemungkinan yang watak bimbangkan, bukan sebagai fakta tentang apa yang pasti berlaku.' })
        ]
      },
      {
        title: 'Kad garis masa dan misi garis masa: dua perkara berbeza',
        body: [
          h('ul', { class: 'guide-list' },
            li('Kad garis masa', 'ialah teks pengenalan sebuah babak (tarikh, tempat, satu ayat). Ia bukan permainan.'),
            li('Misi', 'ialah permainan dalam babak. "Susun Garis Masa" hanyalah salah satu daripada lima jenis misi:')),
          h('ul', { class: 'guide-types' }, types.map((t) => h('li', {}, h('strong', { text: `${t.label}: ` }), t.help))),
          h('p', { class: 'cm-muted', text: 'Susun Garis Masa menyembunyikan tarikh. Pelajar menyusun peristiwa satu pautan demi satu pautan, dan tarikh dicap pada kad apabila ia betul. Setiap kad (selepas yang pertama) memerlukan baris "mengapa" yang menerangkan sebab ia berlaku selepas kad sebelumnya. Pelajar boleh "Intai tarikh" dengan membayar satu titisan dakwat. Kad disusun dalam satu barisan yang boleh digelongsor, jadi bilangan kad dan panjang teks tidak menjadi masalah. Tulis tarikh penuh seperti "16 September 1963"; ia dipaparkan tiga baris (hari, bulan, tahun) dalam kotak.' }),
          h('p', { class: 'cm-muted', text: 'Pratonton di sebelah borang misi ialah permainan sebenar yang dimainkan pelajar. Ia muncul apabila borang lengkap.' })
        ]
      },
      {
        title: 'Akibat jika salah: tunjukkan apa yang berlaku',
        body: [
          h('p', { text: 'Apabila pelajar gagal dalam misi, mereka tidak dimarahi. Mereka melihat sebuah adegan pendek: gambar menjadi kelabu, benang sejarah terputus, dan akibatnya ditaip di skrin. Selepas itu Pendekar Bayang menerangkan sebabnya dengan tenang dan babak diputar semula.' }),
          h('ul', { class: 'guide-list' },
            li('Akibat jika salah:', 'satu medan pada setiap misi. Tulis apa yang BERLAKU dalam cerita, dalam satu atau dua ayat. Contoh: "Tanpa kerjasama, kota Melaka jatuh ke tangan Portugis dalam sehari."'),
            li('Bagi misi pilihan (Bantu NPC, Nyahkod Clue):', 'setiap pilihan salah boleh ada akibat sendiri. Tulis di bawah pilihan itu. Jika kosong, akibat umum misi digunakan.'),
            li('Jika dibiarkan kosong:', 'permainan memaparkan ayat umum, tetapi akibat yang ditulis sendiri jauh lebih berkesan.')),
          h('p', { class: 'cm-muted', text: 'Elakkan "Salah!" atau nada menghukum. Tunjukkan sebab dan akibat sejarah supaya pelajar faham mengapa pilihan itu tidak membawa kepada peristiwa sebenar.' })
        ]
      },
      {
        title: 'Menyusun semula babak',
        body: [
          h('p', { text: 'Babak dimainkan dari atas ke bawah. Untuk menukar urutan, seret ikon di sebelah kiri baris babak ke atas atau ke bawah. Garis menunjukkan tempat ia akan diletakkan.' }),
          h('p', { text: 'Anda juga boleh menekan butang anak panah atas atau bawah dalam panel "Isi Babak". Misi dan dialog bergerak bersama babaknya, jadi tiada apa yang perlu disusun semula secara berasingan.' }),
          h('p', { class: 'cm-muted', text: 'Sebab itu satu peristiwa sejarah = satu babak. Susunan babak ialah susunan sejarah.' })
        ]
      },
      {
        title: 'Cuba dahulu, dan peraturan penting',
        body: [
          h('ul', { class: 'guide-list' },
            li('Main:', '"Main Naratif" dan "Main Babak Ini" menjalankan permainan sebenar yang dimainkan pelajar: kad garis masa, cerita dengan Giliran Anda, taklimat Pendekar Bayang, misi dan catatan diari. Klik pada permainan, tekan Enter untuk mula. Tiada apa disimpan. Misi yang belum lengkap dilangkau dan diberi amaran.'),
            li('Sekurang-kurangnya 3 babak bermisi:', 'sistem tidak membenarkan memadam misi atau babak jika baki babak bermisi kurang daripada 3.'),
            li('Padam:', 'memadam babak turut memadam dialog, misi dan Giliran Anda di dalamnya. Sistem akan bertanya dahulu.'),
            li('Rekod perubahan:', 'senarai Perubahan Terkini ialah rekod peribadi anda sendiri.'))
        ]
      },
      {
        title: 'Tab lain',
        body: [
          h('ul', { class: 'guide-list' },
            li('Bank Soalan:', 'soalan pentaksiran. Wira Training Grounds ialah pertarungan nyawa: pelajar menang atau kalah bergantung pada siapa kehabisan nyawa dahulu (tiada markah atau bilangan soalan dipaparkan, dan tiada apa disimpan). The Great Siege ialah ujian bermarkah dan markahnya disimpan.'),
            li('Suara Pendekar Bayang:', 'kata-kata Pendekar Bayang pada saat tertentu, seperti taklimat dan pujian.'),
            li('Rekod Perubahan:', 'siapa mengubah apa dan bila.')),
          h('p', { class: 'cm-muted', text: 'Anda boleh membuka panduan ini semula bila-bila masa melalui butang "Cara ia berfungsi" di bahagian atas halaman.' })
        ]
      }
    ];
  }

  open() {
    this.index = 0;
    this.detail = false;
    this.steps = this.buildQuickSteps();
    this.dlg = new Dialog({ title: 'Cara ia berfungsi', size: 'wide', app: this.app });
    this.dlg.onClose = () => markGuideSeen();
    this.draw();
  }

  draw() {
    const step = this.steps[this.index];
    const last = this.index === this.steps.length - 1;
    const dots = h('div', { class: 'guide-dots', 'aria-hidden': 'true' },
      this.steps.map((_, i) => h('span', { class: `guide-dot${i === this.index ? ' is-on' : ''}` })));

    this.dlg.setTitle(`Cara ia berfungsi (${this.index + 1}/${this.steps.length})`);
    this.dlg.setBody(h('div', { class: 'guide-step' }, h('h4', { text: step.title }), step.body, dots));
    const quick = !this.detail;
    this.dlg.setFooter(
      uiButton('Langkau', 'cm-btn-ghost', () => this.dlg.close()),
      this.index > 0 ? uiButton('Sebelumnya', 'cm-btn-ghost', () => { this.index -= 1; this.draw(); }, 'fa-arrow-left') : null,
      last
        ? [quick ? uiButton('Panduan terperinci', 'cm-btn-ghost', () => { this.detail = true; this.steps = this.buildSteps(); this.index = 0; this.draw(); }, 'fa-book') : null,
          uiButton('Faham, mula', 'cm-btn-primary', () => this.dlg.close(), 'fa-check')]
        : uiButton('Seterusnya', 'cm-btn-primary', () => { this.index += 1; this.draw(); }, 'fa-arrow-right'));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-guide');
  const open = () => { if (window.contentApp) new ContentGuide(window.contentApp).open(); };
  if (btn) btn.addEventListener('click', open);

  // first visit: open once the page has loaded (and only when the teacher is allowed in)
  if (!guideSeen()) {
    setTimeout(() => {
      const denied = document.getElementById('cm-denied');
      if (denied && !denied.classList.contains('is-hidden')) return;
      if (!Dialog.stack.length) open();
    }, 900);
  }
});