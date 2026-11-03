/**
 * assets/game/quests/timeline.js  -  TimelineQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc, shuffle, sleep } from '../core/core.js';
import { QuestMechanic } from './base.js';

/* ========================================================================== */
/* 1. Susun Garis Masa  ->  "Rantaian Sebab dan Akibat"                       */
/*   The dates are HIDDEN. The student must know WHAT happens next, one link  */
/*   at a time. A right card locks in, its date is stamped on, and the        */
/*   teacher's "why" line explains the link. A wrong card breaks the chain    */
/*   (a drop of water). "Intai tarikh" shows the YEARS ON THE SLOTS (never on  */
/*   the cards), so the student must read each card to match it to a year.    */
/* ========================================================================== */
/**
 * Tarikh dipaparkan tiga baris dalam kotak sempit: "16 September 1963" -> 16 / September / 1963.
 * Tahun sahaja ("1963") kekal satu baris. Lebih tiga perkataan: yang lebihnya digabungkan pada baris akhir.
 */
function tarikhBaris(teks) {
  const kata = String(teks || '').trim().split(/\s+/).filter(Boolean);
  if (kata.length > 3) kata.splice(2, kata.length - 2, kata.slice(2).join(' '));
  return kata.map((k) => `<span class="tkh">${esc(k)}</span>`).join('');
}


export class TimelineQuest extends QuestMechanic {
  constructor(quest, opts) {
    super(quest, { ...opts, maxMistakes: 3 });
    const items = (quest.content && quest.content.timelineItems) || [];
    this.correct = [...items].sort((a, b) => Number(a.id) - Number(b.id));
    let order = shuffle(items);
    for (let t = 0; t < 6 && order.every((it, i) => it.id === this.correct[i].id); t++) order = shuffle(items);
    this.tray = order;
    this.slots = new Array(items.length).fill(null);   // locked cards, in order
    this.selected = null;
    this.peeked = false;
    this.link = '';
    this.justLocked = null;
  }

  /** index of the next open link of the chain */
  get next() { return this.slots.findIndex((s) => s === null); }

  build() {
    this.root.classList.add('q-timeline');
    this.field.innerHTML = `
      <div class="tl-board px parchment">
        <div class="tl-rope"></div>
        <div class="tl-slots"></div>
      </div>
      <div class="tl-deck">
        <button type="button" class="tl-arrow prev" title="Kad sebelum">\u25C0</button>
        <div class="tl-tray"></div>
        <button type="button" class="tl-arrow next" title="Kad seterusnya">\u25B6</button>
      </div>
      <div class="tl-link px" aria-live="polite">
        <button type="button" class="tl-link-toggle" title="Sembunyikan / tunjuk petunjuk">▼ Sembunyi</button>
        <span class="tl-link-text"></span>
      </div>`;
    this.peekBtn = el('button', 'btn-px small tl-peek', '\u{1F50D} Tunjuk tarikh pada petak (\u22121 titisan)');
    this.peekBtn.type = 'button';
    const top = this.root.querySelector('.quest-top');
    top.insertBefore(this.peekBtn, this.inkEl);
    this.slotsEl = this.field.querySelector('.tl-slots');
    this.trayEl = this.field.querySelector('.tl-tray');
    this.linkEl = this.field.querySelector('.tl-link');
    // dek kad: barisan yang boleh digelongsor dengan anak panah (muat berapa pun kad dan sepanjang mana pun teksnya)
    this.arrowPrev = this.field.querySelector('.tl-arrow.prev');
    this.arrowNext = this.field.querySelector('.tl-arrow.next');
    const gelongsor = (arah) => this.trayEl.scrollBy({ left: arah * Math.max(160, this.trayEl.clientWidth * 0.75), behavior: 'smooth' });
    this.arrowPrev.addEventListener('click', () => gelongsor(-1));
    this.arrowNext.addEventListener('click', () => gelongsor(1));
    this.trayEl.addEventListener('scroll', () => this.paintArrows());
    this.linkText = this.field.querySelector('.tl-link-text');      // teks petunjuk sahaja (butang kekal)
    this.linkToggle = this.field.querySelector('.tl-link-toggle');
    // butang sembunyi / tunjuk: kotak petunjuk menutup kad jika terlalu banyak, jadi murid boleh sembunyikannya
    this.linkToggle.addEventListener('click', () => {
      const closed = this.linkEl.classList.toggle('closed');
      this.linkEl.classList.remove('has-new');
      this.linkToggle.textContent = closed ? '\u{1F4AC} Petunjuk' : '\u25BC Sembunyi';
    });
    this.peekBtn.addEventListener('click', () => this.peek());
    this.paint();
  }

  /** anak panah dek kad: disembunyikan jika semua kad sudah muat, malap di hujung barisan */
  paintArrows() {
    const t = this.trayEl;
    const lebih = t.scrollWidth > t.clientWidth + 2;
    this.arrowPrev.style.visibility = this.arrowNext.style.visibility = lebih ? 'visible' : 'hidden';
    this.arrowPrev.disabled = t.scrollLeft <= 2;
    this.arrowNext.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
  }

  card(item, where, locked) {
    const showDate = locked;                         // kad tidak pernah menunjukkan tarikh sebelum dikunci (elak menyusun nombor sahaja)
    const panjang = String(item.text || '').length;      // teks panjang: huruf mengecil supaya kad tidak melimpah
    const saiz = panjang > 110 ? ' teks-kecil' : panjang > 60 ? ' teks-sederhana' : '';
    const c = el('div', `seal-card${saiz}${this.selected === item.id ? ' sel' : ''}${this.clueId === item.id ? ' clue' : ''}${locked ? ' locked' : ''}`);
    c.draggable = !locked;
    c.dataset.id = item.id;
    c.title = item.text || '';
    const year = showDate ? tarikhBaris(item.year) : '?';
    c.innerHTML = `<span class="wax"></span><div class="sc-year${showDate ? '' : ' hidden-date'}${this.justLocked === item.id ? ' stamp-in' : ''}">${year}</div><div class="sc-text">${esc(item.text)}</div>`;
    if (!locked) {
      c.addEventListener('click', (e) => { e.stopPropagation(); this.onCard(item); });
      c.addEventListener('dragstart', (e) => { this.selected = item.id; try { e.dataTransfer.setData('text/plain', String(item.id)); } catch { /* ignore */ } });
    }
    return c;
  }

  onCard(item) {
    if (this.isSettled) return;
    this.selected = this.selected === item.id ? null : item.id;
    this.paint();
  }

  /** the student tries the selected card as the next link of the chain */
  place(slotIdx) {
    if (this.isSettled || this.selected === null || slotIdx !== this.next) return;
    const item = this.tray.find((t) => t.id === this.selected);
    if (!item) return;
    const slot = this.slotsEl.children[slotIdx];
    if (Number(item.id) === Number(this.correct[slotIdx].id)) {
      this.tray = this.tray.filter((t) => t.id !== item.id);
      this.slots[slotIdx] = item;
      this.markRight();
      this.selected = null;
      this.justLocked = item.id;
      this.link = String(item.why || '').trim();
      this.paint();
      if (this.next === -1) {
        this.root.classList.add('chain-done');
        sleep(1400).then(() => this.succeed());           // time to read the last link
      }
      return;
    }
    // wrong: the chain breaks here
    const prev = slotIdx > 0 ? this.slots[slotIdx - 1] : null;
    this.link = prev
      ? `Pautan putus. Apa yang berlaku selepas: ${prev.text}?`
      : 'Pautan putus. Peristiwa manakah yang bermula dahulu?';
    this.selected = null;
    if (slot) { slot.classList.add('bad'); setTimeout(() => slot.classList.remove('bad'), 500); }
    this.justLocked = null;
    const ruined = this.registerMistake();
    this.paint();
    if (ruined) this.fail();
  }

  /** costs one drop of water; the remaining chance is never spent by peeking */
  peek() {
    if (this.isSettled || this.peeked || this.mistakes + 1 >= this.maxMistakes) return;
    this.registerMistake(true);                       // intai: kos titisan sahaja, bukan bunyi salah
    this.peeked = true;
    this.paint();
  }

  paint() {
    const n = this.next;
    this.slotsEl.innerHTML = '';
    this.slotsEl.classList.toggle('padat', this.slots.length > 6);          // banyak petak: huruf dalam petak dikecilkan
    this.slotsEl.classList.toggle('lebih-padat', this.slots.length > 9);
    this.slots.forEach((it, i) => {
      const s = el('div', `tl-slot${it ? ' filled' : ''}${i === n ? ' next' : ''}`);
      s.dataset.slot = i;
      s.innerHTML = `<span class="tl-no">${i + 1}</span>`;
      // Selepas "Intai tarikh": tahun dipaparkan pada PETAK kosong, bukan pada kad
      const year = this.correct[i] && String(this.correct[i].year || '').trim();
      if (!it && this.peeked && year) s.innerHTML += `<span class="tl-slot-year">${tarikhBaris(year)}</span>`;
      if (it) s.appendChild(this.card(it, 'slot', true));
      s.addEventListener('click', () => this.place(i));
      s.addEventListener('dragover', (e) => e.preventDefault());
      s.addEventListener('drop', (e) => { e.preventDefault(); this.place(i); });
      this.slotsEl.appendChild(s);
    });
    const kiri = this.trayEl.scrollLeft;                  // innerHTML menetapkan semula gelongsor: simpan dan pulihkan
    this.trayEl.innerHTML = '';
    this.tray.forEach((it) => this.trayEl.appendChild(this.card(it, 'tray', false)));
    this.trayEl.scrollLeft = kiri;
    this.paintArrows();
    const dipilih = this.trayEl.querySelector('.seal-card.sel');
    if (dipilih) dipilih.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const before = this.linkText.textContent;
    this.linkEl.classList.toggle('empty', !this.link);
    if (this.link) {
      const broken = this.link.startsWith('Pautan putus');
      this.linkEl.classList.toggle('broken', broken);
      this.linkText.textContent = broken ? this.link : `\u21B3 ${this.link}`;
    } else {
      this.linkEl.classList.remove('broken');
      this.linkText.textContent = n === 0 ? 'Mana satu bermula dahulu? Pilih kad, kemudian letakkannya pada petak yang bersinar.' : '';
      this.linkEl.classList.toggle('empty', !this.linkText.textContent);
    }
    // petunjuk baharu semasa kotak disembunyikan: butang berdenyut supaya murid tahu
    if (this.linkText.textContent && this.linkText.textContent !== before && this.linkEl.classList.contains('closed')) {
      this.linkEl.classList.add('has-new');
    }
    this.peekBtn.disabled = this.peeked || this.isSettled || this.mistakes + 1 >= this.maxMistakes;
    this.peekBtn.classList.toggle('hidden', this.peeked);
  }

  applyAssist(level) {
    super.applyAssist(level);
    if (level >= 2 && this.correct.length) {          // a clearer clue: slot years shown free + a star on the NEXT event
      this.peeked = true;
      const n = this.next;
      if (n >= 0) this.clueId = this.correct[n].id;
      if (this.slotsEl) this.paint();
    }
  }
}
