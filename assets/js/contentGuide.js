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
    this.steps = this.buildSteps();
  }

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
          flow('Era', 'Naratif', 'Babak', 'Quest + Dialog'),
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
            li('3 Misi:', 'quest (permainan) yang mengukuhkan apa yang baru diceritakan. Jika salah, cerita rosak dan misi diulang. Pelajar mendapat petunjuk selepas gagal kali kedua dan ketiga.')),
          h('p', { class: 'cm-muted', text: 'Babak yang tiada Giliran Anda dimainkan seperti dahulu: kad, misi, kemudian dialog selepas misi. Babak tanpa quest ialah cerita biasa. Jika sebuah babak ada lebih daripada satu quest, satu sahaja dimainkan secara rawak.' })
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
            li('Bisikan:', 'petunjuk yang boleh dijumpai pelajar dalam dialog sebelumnya. Jangan tulis jawapannya.')),
          h('p', { class: 'cm-muted', text: 'Cara menambah: buka babak. Panel "Isi Babak" ada 3 baris: (1) kad garis masa dan latar, (2) dialog dan Giliran Anda, (3) misi. Dalam baris 2, di bawah setiap baris dialog ada butang bertitik "+ Giliran Anda selepas baris ini". Tekan untuk menambah. Untuk mengubah, tekan kotak biru Giliran Anda yang sedia ada. Tetingkap yang terbuka ada 3 langkah bernombor: siapa bertanya, apa yang boleh dibalas, bisikan jika tersilap. Cadangan 1 hingga 3 setiap babak. Giliran Anda disimpan bersama quest babak itu, jadi babak mesti ada quest. Tulis reaksi balasan salah sebagai kemungkinan yang watak bimbangkan, bukan sebagai fakta tentang apa yang pasti berlaku.' })
        ]
      },
      {
        title: 'Kad garis masa dan quest garis masa: dua perkara berbeza',
        body: [
          h('ul', { class: 'guide-list' },
            li('Kad garis masa', 'ialah teks pengenalan sebuah babak (tarikh, tempat, satu ayat). Ia bukan permainan.'),
            li('Quest', 'ialah permainan dalam babak. "Susun Garis Masa" hanyalah salah satu daripada lima jenis quest:')),
          h('ul', { class: 'guide-types' }, types.map((t) => h('li', {}, h('strong', { text: `${t.label}: ` }), t.help))),
          h('p', { class: 'cm-muted', text: 'Susun Garis Masa menyembunyikan tarikh. Pelajar menyusun peristiwa satu pautan demi satu pautan, dan tarikh dicap pada kad apabila ia betul. Setiap kad (selepas yang pertama) memerlukan baris "mengapa" yang menerangkan sebab ia berlaku selepas kad sebelumnya. Pelajar boleh "Intai tarikh" dengan membayar satu titisan dakwat.' }),
          h('p', { class: 'cm-muted', text: 'Pratonton di sebelah borang quest ialah permainan sebenar yang dimainkan pelajar. Ia muncul apabila borang lengkap.' })
        ]
      },
      {
        title: 'Akibat jika salah: tunjukkan apa yang berlaku',
        body: [
          h('p', { text: 'Apabila pelajar gagal dalam quest, mereka tidak dimarahi. Mereka melihat sebuah adegan pendek: gambar menjadi kelabu, benang sejarah terputus, dan akibatnya ditaip di skrin. Selepas itu Pendekar Bayang menerangkan sebabnya dengan tenang dan babak diputar semula.' }),
          h('ul', { class: 'guide-list' },
            li('Akibat jika salah:', 'satu medan pada setiap quest. Tulis apa yang BERLAKU dalam cerita, dalam satu atau dua ayat. Contoh: "Tanpa kerjasama, kota Melaka jatuh ke tangan Portugis dalam sehari."'),
            li('Bagi quest pilihan (Bantu Tokoh, Nyahkod Clue):', 'setiap pilihan salah boleh ada akibat sendiri. Tulis di bawah pilihan itu. Jika kosong, akibat umum quest digunakan.'),
            li('Jika dibiarkan kosong:', 'permainan memaparkan ayat umum, tetapi akibat yang ditulis sendiri jauh lebih berkesan.')),
          h('p', { class: 'cm-muted', text: 'Elakkan "Salah!" atau nada menghukum. Tunjukkan sebab dan akibat sejarah supaya pelajar faham mengapa pilihan itu tidak membawa kepada peristiwa sebenar.' })
        ]
      },
      {
        title: 'Menyusun semula babak',
        body: [
          h('p', { text: 'Babak dimainkan dari atas ke bawah. Untuk menukar urutan, seret ikon di sebelah kiri baris babak ke atas atau ke bawah. Garis menunjukkan tempat ia akan diletakkan.' }),
          h('p', { text: 'Anda juga boleh menekan butang anak panah atas atau bawah dalam panel "Isi Babak". Quest dan dialog bergerak bersama babaknya, jadi tiada apa yang perlu disusun semula secara berasingan.' }),
          h('p', { class: 'cm-muted', text: 'Sebab itu satu peristiwa sejarah = satu babak. Susunan babak ialah susunan sejarah.' })
        ]
      },
      {
        title: 'Cuba dahulu, dan peraturan penting',
        body: [
          h('ul', { class: 'guide-list' },
            li('Main:', '"Main Naratif" dan "Main Babak Ini" menjalankan permainan sebenar yang dimainkan pelajar: kad garis masa, cerita dengan Giliran Anda, taklimat Pendekar Bayang, quest dan catatan diari. Klik pada permainan, tekan Enter untuk mula. Tiada apa disimpan. Quest yang belum lengkap dilangkau dan diberi amaran.'),
            li('Sekurang-kurangnya 3 babak berquest:', 'sistem tidak membenarkan memadam quest atau babak jika baki babak berquest kurang daripada 3.'),
            li('Padam:', 'memadam babak turut memadam dialog, quest dan Giliran Anda di dalamnya. Sistem akan bertanya dahulu.'),
            li('Rekod perubahan:', 'semua guru berkongsi kandungan yang sama, dan setiap perubahan direkodkan dengan nama guru.'))
        ]
      },
      {
        title: 'Tab lain',
        body: [
          h('ul', { class: 'guide-list' },
            li('Bank Soalan:', 'soalan pentaksiran (Wira Training Grounds dan The Great Siege).'),
            li('Suara Pendekar Bayang:', 'kata-kata Pendekar Bayang pada saat tertentu, seperti taklimat dan pujian.'),
            li('Rekod Perubahan:', 'siapa mengubah apa dan bila.')),
          h('p', { class: 'cm-muted', text: 'Anda boleh membuka panduan ini semula bila-bila masa melalui butang "Cara ia berfungsi" di bahagian atas halaman.' })
        ]
      }
    ];
  }

  open() {
    this.index = 0;
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
    this.dlg.setFooter(
      uiButton('Langkau', 'cm-btn-ghost', () => this.dlg.close()),
      this.index > 0 ? uiButton('Sebelumnya', 'cm-btn-ghost', () => { this.index -= 1; this.draw(); }, 'fa-arrow-left') : null,
      last
        ? uiButton('Faham, mula', 'cm-btn-primary', () => this.dlg.close(), 'fa-check')
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
