/**
 * assets/game/story/missionScene.js  -  MissionScene: story, dialogue, quests
 * MODULE: story  (Mission scene: story + dialogue + quests, HUD, aftermath, pieces, book end)
 * USE CASE: UC-03   CLASS DIAGRAM: Narrative, Scene, DialogueLine, Quest, QuestCompletion
 */
/**
 * ============================================================================
 * missionScene.js  -  MissionScene: one narrative played as missions (UC-03)
 *
 * For every scene of the narrative:
 *   1. timeline card (what / when / where) + tap a character for biography
 *   2. Pendekar Bayang's briefing (taklimat)
 *   3. the full-screen quest (only for the scenes the "hanger" switched on)
 *        wrong  -> the story is ruined: back to the START OF THE SCENE (same quest, new shuffle)
 *                  after the 2nd ruin he whispers the hint, after the 3rd a clearer clue
 *        right  -> praise (pujian), the quest is saved (verifyCompletion)
 *   4. "Cerita selepas misi": the scene's dialogue, then the Catatan Diari (sticky note on a diary page)
 *
 * POSSESSION (the role): the student's soul enters the body of the narrative's role (a real figure).
 *   Before the first scene Pendekar Bayang says who the student is now. From then on the "Pemain" lines and the
 *   student's replies in "Giliran Anda" are spoken AS that character (name + portrait), and the other characters
 *   talk straight to "kau". The same character thanks the student at the end of the era. No role = the avatar.
 *
 * GILIRAN ANDA (turns): a quest may carry up to 3 "your turn" moments (questContent.turns).
 *   When a scene has them the STORY is played FIRST (instead of after the mission): at a turn the
 *   character who just spoke turns to the player, who answers by choosing what to SAY.
 *   right -> the character answers and the story goes on
 *   wrong -> the character reacts with the in-story consequence, Pendekar Bayang whispers the clue,
 *            the screen rewinds and the same character asks again (only that exchange, never the babak;
 *            after the 2nd wrong reply one wrong choice is removed)
 *   The story is not replayed if the mission itself is ruined later.
 * A scene without a quest is a plain story scene (the quest is the gameplay of the scenes that have one). Between scenes the soul is pulled on.
 * After the last scene: badge reveal -> the role's badge line -> the two doors.
 *
 * Nothing is saved on a failed attempt.
 * ============================================================================
 */
import { ShelfComponent } from '../collection/shelf.js';
import { el, esc, sleep, tpl } from '../core/core.js';
import { DialogueReader, LearningSupport, Narrative, Quest, QuestCompletion } from '../core/domain.js';
import { GameScene, SceneGone } from '../core/scene.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';      // suara pembaca
import { entityPortrait, spriteEl } from '../npc/entity.js';
import { ENTITY_NAME, ROLE_LINES, fillMarkers } from '../npc/entityLines.js';
import { QuestMechanic } from '../quests/index.js';
import { RehatPage } from '../rest/rehat.js';
import { buildAftermath } from './aftermath.js';
import { koyakPaths } from './koyak.js';
import { SupportModule } from '../support/support.js';
import { selakBuku } from '../transition/halaman.js';

export class MissionScene extends GameScene {
  async enter({ eraID }) {
    this.root.classList.add('mission');
    this.eraID = Number(eraID);
    this.era = this.game.eraById(this.eraID);
    this.root.innerHTML = `
      <div class="m-bg"></div><div class="m-vignette"></div>
      <div class="m-layer"></div>
      <div class="m-hud">
        <div class="m-chips px"></div>
        <div class="m-btns">
          <!-- blok "?" ala Mario = Bantuan; mentol = Petunjuk (dahulu "Bisikan"); jeda -->
          <button class="hud-btn hud-log hidden" data-a="log" title="Catatan: baca semula dialog babak ini"><i class="hud-ico">&#128220;</i><span>Catatan</span></button>
          <button class="hud-btn hud-help" data-a="help" title="Bantuan (B)"><i class="hud-ico mario-q">?</i><span>Bantuan</span></button>
          <button class="hud-btn hud-hint" data-a="hint" title="Petunjuk (H): bantuan untuk soalan misi"><i class="hud-ico bulb">&#128161;</i><span>Petunjuk</span></button>
          <button class="hud-btn hud-pause" data-a="pause" title="Jeda (Esc)"><i class="hud-ico">&#9208;</i><span>Jeda</span></button>
        </div>
      </div>
      <div class="m-ribbon hidden px"></div>`;
    this.bg = this.root.querySelector('.m-bg');
    this.layer = this.root.querySelector('.m-layer');
    this.ribbon = this.root.querySelector('.m-ribbon');
    this.root.querySelector('[data-a="hint"]').addEventListener('click', () => this.hintNow());
    // Modul Bantuan Pembelajaran Adaptif (support.js): sentiasa boleh dibuka semasa cerita ATAU misi
    this.support = new SupportModule(this.game, this.student.studentID);
    this.root.querySelector('[data-a="help"]').addEventListener('click', () => this.helpNow());
    this.root.querySelector('[data-a="log"]').addEventListener('click', () => this.logNow());
    this.watchIdle();
    this.root.querySelector('[data-a="pause"]').addEventListener('click', () => this.pause());
    this.syncHud();                                    // mula-mula Bisikan kelabu (belum ada misi)
    this.watchCovered(['[data-a="log"]', '[data-a="help"]', '[data-a="hint"]', '[data-a="pause"]']);   // kelabu juga bila tertutup tetingkap / halaman

    await this.entity.load(this.eraID);
    try {
      await this.prepare();
    } catch (err) {
      await this.game.openModal({ title: 'Era tidak dapat dimuatkan', body: `<p>${esc(err.message)}</p>`, buttons: [{ label: 'Kembali ke peta', primary: true }] });
      this.game.go('MapScene', { focusEra: this.eraID });
      return;
    }
    this.mainKeys = this.keys({
      onKeyDown: (k) => {
        if (k === 'h') { this.hintNow(); return true; }
        if (k === 'b') { this.helpNow(); return true; }
        if (k === 'Escape') { this.pause(); return true; }
        return false;
      }
    });
    this.runFlow(() => this.play());
  }

  /* ---------------------------------------------------------------- data */
  async prepare() {
    const { api, runStore } = this.game;
    const sid = this.student.studentID;
    let run = runStore.get(sid, this.eraID);
    let narrative = null;
    if (run) {
      narrative = await Narrative.loadNarrative(api, { eraID: this.eraID, studentID: sid, narrativeID: run.narrativeID });
      if (narrative.narrativeID !== run.narrativeID) run = null;      // that narrative was removed by a teacher
    }
    let quests;
    if (!run) {
      await QuestCompletion.resetReplay(api, { studentID: sid, eraID: this.eraID });
      narrative = await this.era.loadRandomNarrative(api, sid, runStore.last(sid, this.eraID));
      quests = await Quest.assignQuest(api, { narrativeID: narrative.narrativeID, studentID: sid });
      run = { narrativeID: narrative.narrativeID, questIDs: quests.map((q) => q.questID), sceneIdx: 0 };
      runStore.setLast(sid, this.eraID, narrative.narrativeID);
    } else {
      quests = await Quest.assignQuest(api, { narrativeID: narrative.narrativeID, studentID: sid, questIDs: run.questIDs });
      // A saved run can go stale when the content changed (re-seeded, or a teacher edited / deleted
      // scenes or quests). Then it would skip scenes or finish with quests undone, so start fresh.
      const found = new Set(quests.map((q) => q.questID));
      // Semua misi sudah ditanda siap tetapi permainan belum tamat (cth. data ujian uji_epilog.sql, atau main di peranti lain):
      // tiada misi lagi untuk dimainkan, jadi tiada "Giliran Anda" dan tiada misi. Mulakan semula dengan bersih.
      const allDone = quests.length > 0 && quests.every((q) => q.isCompleted);
      const stale = !quests.length || allDone || run.questIDs.some((id) => !found.has(id));
      if (stale) {
        runStore.clear(sid, this.eraID);
        await QuestCompletion.resetReplay(api, { studentID: sid, eraID: this.eraID });
        narrative = await this.era.loadRandomNarrative(api, sid, null);
        quests = await Quest.assignQuest(api, { narrativeID: narrative.narrativeID, studentID: sid });
        run = { narrativeID: narrative.narrativeID, questIDs: quests.map((q) => q.questID), sceneIdx: 0 };
        runStore.setLast(sid, this.eraID, narrative.narrativeID);
      } else {
        // resume at the first scene whose quest is still undone (never skip past it)
        const firstOpen = narrative.scenes.findIndex((s) => quests.some((q) => q.sceneID === s.sceneID && !q.isCompleted));
        if (firstOpen >= 0 && run.sceneIdx > firstOpen) run.sceneIdx = firstOpen;
        if (run.sceneIdx >= narrative.scenes.length) run.sceneIdx = Math.max(0, narrative.scenes.length - 1);
      }
    }
    if (!narrative.scenes.length) throw new Error('Cerita ini belum mempunyai babak. Minta guru menambahnya.');
    this.run = run;
    this.narrative = narrative;
    this.quests = quests;                         // [{questID, sceneID, isCompleted, ...}]
    runStore.set(sid, this.eraID, run);
    this.paintChips();
    await this.loadBadgePreview();
  }

  /** Gambar lencana era ini (sebagai bayang untuk kepingan). Gagal = tiada kepingan, permainan tetap berjalan. */
  async loadBadgePreview() {
    this.badgePreview = null;
    try {
      const res = await this.api.badges(this.student.studentID);
      const b = (res.badges || []).find((x) => Number(x.eraID) === this.eraID);
      const asset = b && (b.previewAsset || b.asset);
      if (asset) this.badgePreview = { asset };     // juga bagi era yang sudah dimiliki: halaman ini ialah rehat belajar
    } catch { /* tiada kepingan; tidak mengapa */ }
  }

  get doneCount() { return this.quests.filter((q) => q.isCompleted).length; }

  /**
   * Papan kemajuan di penjuru kiri atas, bentuk BUKU:
   *   Era 1 / 10  Pembentukan Malaysia 1963  (nombor era daripada jumlah era)
   *   Halaman 6 / 17                         (babak semasa daripada jumlah babak)
   * Dikemas kini setiap kali babak bertukar (lihat play()).
   */
  paintChips() {
    const chips = this.root.querySelector('.m-chips');
    const jumlah = this.narrative ? this.narrative.scenes.length : this.quests.length;
    const halaman = Math.min(jumlah, (this.run ? this.run.sceneIdx : 0) + 1);
    chips.innerHTML = `
      <div class="bk-bab"><span>Era ${this.eraID} / ${this.game.eras.length}</span><b>${esc(this.era.eraName)}</b></div>
      <div class="bk-hal">Halaman <b>${halaman}</b> / ${jumlah}</div>`;
  }

  setBackground(scene) {
    this.bg.style.backgroundImage = `url('${scene.asset}')`;
  }

  /* ----------------------------------------------------------------- flow */
  async play() {
    const scenes = this.narrative.scenes;
    const start = this.run.sceneIdx;
    if (start === 0) await this.possession();
    for (let i = start; i < scenes.length; i++) {
      const scene = scenes[i];
      this.run.sceneIdx = i;
      this.game.runStore.set(this.student.studentID, this.eraID, this.run);
      this.paintChips();                                      // Halaman X / Y
      await this.levelBreak(i, scenes.length, start);           // halaman Tahap + rehat (hanya di sempadan tahap)
      if (i === start) {
        this.setBackground(scene);
      } else {
        // peralihan babak: tangan menarik jiwa, kemudian buku diselak (halaman.js)
        await this.gate(this.game.transition.soulPull({
          line: '', ms: 2600,
          middle: () => selakBuku(this.game.transition.layer, {
            ms: 2200,
            middle: async () => { this.setBackground(scene); this.layer.innerHTML = ''; }
          })
        }));
      }
      await this.playScene(scene, i);
    }
    await this.finishChapter();
  }

  /**
   * TAHAP: satu era dibahagi 3 tahap (kira-kira 5-6 babak setiap satu).
   * Di sempadan tahap, halaman Rehat dipaparkan: kemajuan tahap + mini game santai ikut tema.
   * @param i      indeks babak yang AKAN dimainkan
   * @param total  jumlah babak dalam naratif ini
   * @param start  babak tempat era ini dimulakan/disambung (untuk paparan "Selamat kembali")
   */
  levelBreak(i, total, start) {
    const { jumlahTahap, saiz } = this.tahapInfo(total);
    if (i === 0) return Promise.resolve();
    if (i % saiz !== 0) {                                         // menyambung di tengah tahap: tunjuk kemajuan sekali sahaja
      if (i !== start) return Promise.resolve();        // hanya sebaik sahaja era disambung
      return this.gate(this.lompongMasa({ mode: 'sambung', babakSiap: i }));
    }
    return this.gate(this.lompongMasa({ mode: 'tahap', babakSiap: i }));
  }

  /** Bilangan tahap (maks 3) dan saiz setiap tahap bagi naratif semasa */
  tahapInfo(total) {
    const jumlahTahap = Math.min(3, Math.max(1, Math.ceil(total / 5)));
    return { jumlahTahap, saiz: Math.ceil(total / jumlahTahap) };
  }

  /**
   * Buka Lompong Masa (tempat rehat). Dipanggil di sempadan tahap dan oleh butang Jeda.
   * @returns 'terus' atau 'keluar'
   */
  lompongMasa({ mode, babakSiap }) {
    const babak = this.narrative.scenes;
    const { jumlahTahap, saiz } = this.tahapInfo(babak.length);
    const rehat = new RehatPage(this.root, this.eraID);
    return rehat.show({
      mode,
      eraName: this.era ? this.era.eraName : '',
      tahapJumlah: jumlahTahap,
      saiz,
      babakSiap,
      babak: babak.map((b) => b.asset)               // latar setiap babak (jubin dalam carousel)
    });
  }

  async playScene(scene) {
    this.sceneNow = scene;                               // untuk Bantuan ("Apa berlaku?")
    this.lastLine = '';
    this.log = [];                                       // log dialog babak ini (butang Catatan)
    this.syncHud();
    const qInfo = this.quests.find((q) => q.sceneID === scene.sceneID && !q.isCompleted);
    let quest = null;
    if (qInfo) quest = await this.gate(Quest.load(this.api, qInfo.questID, qInfo));
    let fails = 0;
    const turns = quest && quest.content && Array.isArray(quest.content.turns) ? quest.content.turns : [];
    let storyDone = false;

    for (;;) {                                           // restarts here when the story is ruined
      this.setBackground(scene);
      await this.timelineCard(scene);
      if (!quest) {
        await this.storyReveal(scene, false);
        return;
      }
      if (turns.length && !storyDone) {                  // story with "Giliran Anda" comes BEFORE the mission
        await this.storyReveal(scene, false, turns);
        storyDone = true;
      }
      const support = new LearningSupport(quest);
      // Padanan: sentiasa ingatkan bahawa semua kad boleh dipadankan (bukan hanya atas-bawah)
      const padanNota = Number(quest.questType) === 4 ? ' Ingat: mana-mana dua kad boleh dipadankan, tidak kira di mana kedudukannya.' : '';
      await this.gate(this.entity.speak('taklimat', { taklimat: (quest.instructions || quest.description || quest.questName) + padanNota }, { eraID: this.eraID }));

      await this.gate(this.support.firstTime(Number(quest.questType)));   // demo bergerak, SEKALI bagi setiap jenis misi
      const result = await this.runQuest(quest, scene, fails);
      if (result.ok) {
        await this.gate(this.entity.speak('pujian', { maklumbalas: support.provideFeedback() }, { eraID: this.eraID }));
        await this.gate(QuestCompletion.verifyCompletion(this.api, {
          studentID: this.student.studentID, questID: quest.questID, eraID: this.eraID,
          narrativeID: this.narrative.narrativeID, questIDs: this.run.questIDs
        }).catch(async (err) => {
          await this.game.openModal({ title: 'Kemajuan tidak dapat disimpan', body: `<p>${esc(err.message)}</p><p>Cuba lagi.</p>`, buttons: [{ label: '\u21BB Cuba lagi', primary: true }] });
          return QuestCompletion.verifyCompletion(this.api, { studentID: this.student.studentID, questID: quest.questID, eraID: this.eraID, narrativeID: this.narrative.narrativeID, questIDs: this.run.questIDs });
        }));
        qInfo.isCompleted = true;
        this.clearNudge();                             // jawapan betul: cahaya butang Bantuan dipadam
        this.paintChips();
        if (!turns.length) await this.storyReveal(scene, true);
        if (quest.explanation) {
          // Susun atur: <template id="tpl-diary"> dalam assets/game/story/story.html
          const page = tpl('diary', { tab: `Diari ${this.me().name}`, note: quest.explanation });
          speech.speak(quest.explanation);             // catatan diari dibacakan (jika dihidupkan di Pintu)
          try {
            await this.gate(this.game.openModal({ title: 'Catatan Diari', body: page, buttons: [{ label: 'Teruskan', primary: true }] }));
          } finally {
            speech.stop();
          }
        }
        await this.showPieces();                       // halaman buku: satu kepingan lencana bertambah
        return;
      }
      fails += 1;
      await this.ruin(fails, support, scene, result);
    }
  }

  /* ------------------------------------------------------------ the pieces */
  /** Who the student speaks as: the role (possession) or, with no role, their own avatar. */
  me() {
    const role = this.narrative && this.narrative.role;
    if (role) return { name: role.npc.name, src: role.npc.asset, isRole: true };
    return { name: this.student.studentName, src: this.student.avatar.assetPath, isRole: false };
  }

  /** The soul enters the body of the role: avatar -> character, then Pendekar Bayang says who the student is now. */
  async possession() {
    const role = this.narrative && this.narrative.role;
    if (!role) return;
    // Susun atur: <template id="tpl-possession"> dalam assets/game/story/story.html
    const wrap = tpl('possession', { name: role.npc.name, task: role.npc.viewContribution() });
    wrap.refs.from.appendChild(spriteEl(this.student.avatar.assetPath, this.student.studentName, 'pos-pic'));
    wrap.refs.to.appendChild(spriteEl(role.npc.asset, role.npc.name, 'pos-pic'));
    this.layer.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const text = fillMarkers(role.lines[3] || ROLE_LINES[3].fallback, { nama: this.student.studentName, peranan: role.npc.name });
    await this.gate(sleep(1800));
    await this.gate(this.dialog.say({ name: ENTITY_NAME, text, portrait: entityPortrait('whispering'), side: 'left', tone: 'whisper' }));
    this.dialog.hide();
    const done = this.waitEnter();
    wrap.refs.go.addEventListener('click', () => this._cancelWait && this._cancelWait());
    wrap.classList.add('ready');
    await this.gate(done);
    wrap.classList.remove('in');
    await sleep(300);
    wrap.remove();
  }

  waitEnter() {
    return new Promise((resolve) => {
      const off = this.input.push({
        onKeyDown: (k) => {
          if (k === 'Enter' || k === ' ') { off(); resolve(); return true; }
          if (k === 'Escape') { this.pause(); return true; }
          return false;
        }
      });
      this._cancelWait = () => { off(); resolve(); };
    });
  }

  async timelineCard(scene) {
    const text = (scene.sceneStoryline || '').trim();
    if (!text) return;
    const wrap = el('div', 'tl-card-wrap');
    const chars = scene.characters;
    wrap.innerHTML = `
      <div class="tl-card px parchment">
        <div class="tlc-ribbon">❦ KAD GARIS MASA ❦</div>
        <div class="tlc-era">${esc(this.era.eraName)}</div>
        <div class="tlc-text">${esc(text)}</div>
        ${chars.length ? '<div class="tlc-npcs"><span>Kenali tokoh:</span></div>' : ''}
        <div class="tlc-go">Tekan Enter ▶</div>
      </div>`;
    const npcBox = wrap.querySelector('.tlc-npcs');
    chars.forEach((npc) => {
      const b = el('button', 'btn-px small npc-chip');
      b.appendChild(spriteEl(npc.asset, npc.name, 'chip-face'));
      b.appendChild(el('span', '', esc(npc.name)));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.showNpc(npc); });
      npcBox.appendChild(b);
    });
    this.layer.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    speech.speak(text);                                  // kad cerita babak dibacakan (jika dihidupkan di Pintu)
    const done = this.waitEnter();
    wrap.querySelector('.tlc-go').addEventListener('click', () => this._cancelWait && this._cancelWait());
    try {
      await this.gate(done);
    } finally {
      speech.stop();                                     // kad ditutup (atau babak ditinggalkan): suara berhenti
    }
    wrap.classList.remove('in');
    await sleep(250);
    wrap.remove();
  }

  /**
   * KEPINGAN LENCANA: kertas koyak dengan lencana era sebagai bayang.
   * Setiap misi yang selesai mewarnakan satu kepingan. Misi terakhir tidak dipaparkan di sini
   * kerana lencana penuh terus diberikan (finishChapter). Susun atur: <template id="tpl-pieces">.
   */
  async showPieces() {
    const total = this.quests.length;
    const done = this.doneCount;
    if (!this.badgePreview || done <= 0 || done >= total) return;

    // kertas koyak: tepat satu kepingan bagi setiap misi (koyak.js), berapa pun bilangan misi
    const bentuk = koyakPaths(total, 300, this.eraID);

    // susunan kepingan diwarnakan: tetap bagi setiap era (bukan rawak setiap kali)
    const order = [...Array(total).keys()].sort((a, b) => ((a * 7 + this.eraID) % 11) - ((b * 7 + this.eraID) % 11) || a - b);
    const gambar = esc(this.badgePreview.asset);

    // lapisan: bayang lencana, kemudian setiap kepingan (gambar berwarna dipotong ikut bentuk koyak)
    // topeng: garisan koyak hanya kelihatan di dalam bentuk lencana
    let isi = `<mask id="pc-topeng" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">
        <image class="pc-topeng-img" href="${gambar}" width="300" height="300"/>
      </mask>
      <image class="pc-shadow" href="${gambar}" width="300" height="300"/>
      <g mask="url(#pc-topeng)">`;
    bentuk.forEach(({ d }, i) => {
      const rank = order.indexOf(i);                                   // kepingan ke berapa diwarnakan
      const keadaan = rank < done - 1 ? 'on' : rank === done - 1 ? 'baru' : 'kosong';
      isi += `<clipPath id="pc-klip-${i}"><path d="${d}"/></clipPath>
        <g class="pc-piece ${keadaan}">
          <image class="pc-img" href="${gambar}" width="300" height="300" clip-path="url(#pc-klip-${i})"/>
          <path class="pc-edge" d="${d}"/>
        </g>`;
    });
    isi += '</g>';

    const page = tpl('pieces', { era: this.era.eraName, count: `${done} / ${total}` });
    page.refs.svg.innerHTML = isi;
    this.layer.appendChild(page);
    requestAnimationFrame(() => page.classList.add('in'));

    // masa untuk melihat: kepingan lama dahulu, kemudian kepingan baharu jatuh (~3.2 saat), barulah Enter diterima.
    // (Enter dari diari tadi tidak terlangkau secara tidak sengaja.)
    await this.gate(sleep(3200));
    const done2 = this.waitEnter();
    page.refs.go.addEventListener('click', () => this._cancelWait && this._cancelWait());
    await this.gate(done2);
    page.remove();                                     // (peralihan ke babak seterusnya: tangan menarik jiwa + buku diselak, lihat play())
  }

  showNpc(npc) {
    const pic = spriteEl(npc.asset, npc.name, 'npc-big');
    const holder = el('div');
    holder.append(pic);
    const box = el('div', 'npc-bio');
    box.innerHTML = `<h4>Biografi</h4><p>${esc(npc.viewBiography())}</p><h4>Sumbangan</h4><p>${esc(npc.viewContribution())}</p>`;
    holder.append(box);
    this.game.openModal({ title: npc.name, body: holder, buttons: [{ label: 'Tutup', primary: true }] });
  }

  async storyReveal(scene, afterMission, turns = []) {
    const lines = scene.dialogues;
    if (!lines.length) return;
    this.ribbon.textContent = afterMission ? 'Cerita selepas misi' : 'Cerita';
    this.ribbon.classList.remove('hidden');
    const reader = new DialogueReader(lines);
    let n = 0;
    while (!reader.done) {
      const l = reader.nextLine();
      n += 1;
      const d = l.displayLine(this.student.studentName);
      this.lastLine = `${d.isPlayer ? this.me().name : d.name}: ${d.text}`;   // baris terakhir untuk Bantuan
      // the student ("kau") is always on the right in their own colour; every other character is on the left
      const side = d.isPlayer ? 'right' : 'left';
      const me = this.me();
      const src = d.isPlayer ? me.src : d.npc.asset;
      const shownName = d.isPlayer ? me.name : d.name;
      const portrait = () => spriteEl(src, shownName, 'npc-portrait');
      const turn = turns.find((t) => Number(t.after) === n);
      if (turn && !d.isPlayer) {
        await this.playTurn(turn, { name: shownName, text: d.text, portrait, side });
      } else {
        await this.gate(this.dialog.say({ name: shownName, text: d.text, portrait: portrait(), side, tone: d.isPlayer ? 'me' : '', note: d.note }));
      }
      // catat dalam log SELEPAS baris dibaca (jawapan Giliran Anda sengaja tidak dicatat)
      this.log.push({ name: shownName, text: d.text, src, me: d.isPlayer });
      this.syncHud();
    }
    this.dialog.hide();
    this.ribbon.classList.add('hidden');
  }

  /**
   * GILIRAN ANDA: the character who just spoke turns to the player and waits for a reply.
   * `asker` = { name, text, portrait(): HTMLElement, side }.
   */
  async playTurn(turn, asker) {
    const shuffled = (list) => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    let options = turn.options.map((o) => ({ ...o }));
    let wrong = 0;
    const previous = this.ribbon.textContent;
    for (;;) {
      this.ribbon.textContent = 'GILIRAN ANDA';
      this.ribbon.classList.add('turn');
      if (wrong >= 2 && options.length > 2) {                 // second wrong reply: one wrong choice falls away
        const drop = options.findIndex((o) => !o.isCorrect);
        if (drop >= 0) options.splice(drop, 1);
      }
      const shown = shuffled(options);
      const idx = await this.gate(this.dialog.ask({
        name: asker.name, text: asker.text, portrait: asker.portrait(), side: 'left',
        options: shown.map((o) => o.text), mePortrait: spriteEl(this.me().src, this.me().name, 'npc-portrait')
      }));
      const pick = shown[idx];
      this.ribbon.classList.remove('turn');
      this.ribbon.textContent = previous;
      const me = this.me();
      await this.gate(this.dialog.say({ name: me.name, text: pick.text, portrait: spriteEl(me.src, me.name, 'npc-portrait'), side: 'right', tone: 'me' }));
      await this.gate(this.dialog.say({ name: asker.name, text: pick.reaction, portrait: asker.portrait(), side: 'left' }));
      if (pick.isCorrect) return;
      wrong += 1;
      this.dialog.hide();
      this.root.classList.add('ruin-fx');
      await this.gate(this.entity.speak('bisikan', { petunjuk: turn.clue }, { eraID: this.eraID }));
      await this.gate(sleep(700));
      this.root.classList.remove('ruin-fx');                  // the exchange rewinds: the same character asks again
    }
  }

  async runQuest(quest, scene, fails) {
    const mech = QuestMechanic.create(quest, { background: scene.asset });
    this.current = mech;
    this.currentQuest = quest;
    this.syncHud();
    const playing = mech.play(this.layer);
    if (fails >= 3) mech.applyAssist(2);               // a clearer clue (never the answer)
    try {
      return await this.gate(playing);
    } finally {
      mech.destroy();
      this.current = null;
      this.currentQuest = null;
      this.syncHud();
    }
  }

  /** AKIBAT: show what happens in the story for this mistake (a cutscene, not a telling-off). */
  async showAftermath(text, scene) {
    const a = buildAftermath(text, { background: scene.asset });
    this._cutscene = true;                             // adegan Akibat menutupi HUD: Jeda kelabu
    this.syncHud();
    this.layer.appendChild(a.el);
    sound.sfx('benangPutus', { maxMs: 3500 });         // benang terputus: bunyi kalah, dipotong supaya tidak menutup bacaan
    const typed = () => a.el.classList.contains('typed');
    let off = () => {};
    // first Enter / click finishes the typing, the next one carries on
    const done = new Promise((resolve) => {
      const next = () => { if (!typed()) a.skip(); else resolve(); };
      a.el.addEventListener('click', next);
      off = this.input.push({
        onKeyDown: (k) => {
          if (k === 'Enter' || k === ' ') { next(); return true; }
          if (k === 'Escape') { this.pause(); return true; }
          return false;
        }
      });
    });
    try { await this.gate(done); } finally { off(); this._cutscene = false; this.syncHud(); }
    a.el.remove();
  }

  async ruin(fails, support, scene, result = {}) {
    if (fails >= 2) { const b = this.root.querySelector('[data-a="help"]'); if (b) b.classList.add('nudge'); }
    this.root.classList.add('ruin-fx');
    await this.showAftermath(result.aftermath, scene);
    await this.gate(this.entity.speak('ceritaRuntuh', {}, { eraID: this.eraID }));
    await this.gate(this.entity.speak('pembetulan', { penerangan: support.provideExplanation() }, { eraID: this.eraID }));
    if (fails === 2) {
      await this.gate(this.entity.speak('bisikan', { petunjuk: support.provideHint() }, { eraID: this.eraID }));
    } else if (fails >= 3) {
      await this.gate(this.entity.speak('bisikan', { petunjuk: `${support.provideHint()} Kali ini aku tandakan sesuatu untukmu.` }, { eraID: this.eraID }));
    }
    // back to the START OF THE SCENE
    await this.gate(this.game.transition.soulPull({
      line: 'Jiwamu ditarik kembali ke awal babak...', ms: 2200,
      middle: async () => { this.root.classList.remove('ruin-fx'); this.layer.innerHTML = ''; this.setBackground(scene); }
    }));
  }

  /* ---------------------------------------------------------- hints / pause */
  /**
   * Butang Bisikan / Jeda di penjuru: bertukar KELABU bila tidak boleh digunakan.
   *  - Bisikan: hanya boleh semasa misi berjalan dan Pendekar Bayang tidak sedang bercakap
   *  - Jeda   : tidak boleh semasa tetingkap Jeda terbuka atau adegan Akibat
   */
  syncHud() {
    const hint = this.root.querySelector('[data-a="hint"]');
    const pause = this.root.querySelector('[data-a="pause"]');
    // Petunjuk hanya WUJUD semasa misi (disembunyikan sepenuhnya di luar misi supaya skrin tidak sesak)
    if (hint) { hint.classList.toggle('hidden', !this.currentQuest); hint.disabled = Boolean(this._busy); }
    if (pause) pause.disabled = Boolean(this._paused || this._cutscene);
    // Catatan hanya muncul bila babak ini sudah ada baris dialog untuk dibaca semula
    const log = this.root.querySelector('[data-a="log"]');
    if (log) log.classList.toggle('hidden', !(this.log && this.log.length));
  }

  /**
   * Bekukan permainan sementara satu tetingkap/halaman dibuka (Jeda, Bantuan, Catatan):
   * dialog berhenti tepat di tempatnya (freeze), kekunci ditelan, dan disambung semula (thaw) selepas itu.
   * @param fn      fungsi async yang membuka tetingkap dan selesai bila ia ditutup
   * @param sembunyi true = kotak dialog juga disembunyikan (untuk halaman penuh seperti Lompong Masa)
   */
  async bekukan(fn, sembunyi = false) {
    this.dialog.freeze(sembunyi);                          // dialog berhenti (dan disorok jika sembunyi) -- lihat DialogueBox.freeze
    const lepaskan = this.input.push({ onKeyDown: () => true });   // kekunci tidak sampai ke cerita di belakang
    try {
      return await fn();
    } finally {
      lepaskan();
      this.dialog.thaw();
    }
  }

  /** Butang Catatan: senarai dialog babak ini (tpl-log). */
  async logNow() {
    if (this._helpOpen || this._paused || this._cutscene || !(this.log && this.log.length)) return;
    this._helpOpen = true;
    this.clearNudge();
    try {
      await this.bekukan(async () => {
        const panel = tpl('log');
        this.log.forEach((b) => {
          const row = tpl('logrow', { name: b.name, text: b.text });
          row.classList.toggle('lg-me', b.me);
          row.refs.face.appendChild(spriteEl(b.src, b.name, 'lg-sprite'));
          panel.refs.list.appendChild(row);
        });
        const dibuka = this.game.openModal({ title: 'Catatan dialog', body: panel, buttons: [{ label: 'Tutup', primary: true }] });
        requestAnimationFrame(() => { panel.refs.list.scrollTop = panel.refs.list.scrollHeight; });   // terus ke baris terbaharu
        await dibuka;
      });
    } finally { this._helpOpen = false; }
  }

  /** Butang Bantuan (B): buka modul bantuan mengikut keadaan semasa (cerita atau misi). */
  async helpNow() {
    if (this._helpOpen || this._paused || this._cutscene) return;
    this._helpOpen = true;
    this.clearNudge();
    try {
      const q = this.currentQuest;
      await this.bekukan(() => this.support.open({
        mode: q ? 'quest' : 'story',
        storyline: this.sceneNow ? this.sceneNow.sceneStoryline : '',
        lastLine: this.lastLine,
        questType: q ? Number(q.questType) : 0,
        questText: q ? (q.instructions || q.description || '') : ''
      }));
    } finally { this._helpOpen = false; }
  }

  /**
   * ADAPTIF (UC-D): jika murid diam >= 25 saat atau sudah gagal >= 2 kali, butang Bantuan bersinar.
   * Ia tidak membuka apa-apa sendiri; murid yang memutuskan.
   */
  watchIdle() {
    const btn = this.root.querySelector('[data-a="help"]');
    this.clearNudge = () => { btn.classList.remove('nudge'); clearTimeout(this._idleT); this._idleT = setTimeout(() => { if (this.currentQuest) btn.classList.add('nudge'); }, 25000); };   // bersinar hanya semasa misi
    ['pointerdown', 'keydown'].forEach((ev) => this.root.addEventListener(ev, () => this.clearNudge(), true));
    this.clearNudge();
  }

  async hintNow() {
    if (this._busy || !this.currentQuest) return;
    this._busy = true;
    this.syncHud();
    try {
      const support = new LearningSupport(this.currentQuest);
      await this.entity.speak('bisikan', { petunjuk: support.provideHint() }, { eraID: this.eraID });
    } finally { this._busy = false; this.syncHud(); }
  }

  async pause() {
    if (this._paused || this._cutscene) return;
    this._paused = true;
    this.syncHud();
    // Jeda = masa dibekukan: dialog berhenti tepat di tempatnya dan disembunyikan di belakang Lompong Masa
    const hasil = await this.bekukan(() => this.lompongMasa({ mode: 'jeda', babakSiap: this.run.sceneIdx }), true);
    this._paused = false;
    this.syncHud();
    if (hasil === 'keluar') this.game.go('MapScene', { focusEra: this.eraID });
  }

  /* --------------------------------------------------------- chapter clear */
  roleSay(n, extra = '') {
    return this.game.roleSpeak(this.narrative.role, n, extra);
  }

  /**
   * KISAH ERA LENGKAP: satu halaman kertas bagi setiap misi terbang masuk ke dalam buku.
   * Bilangan halaman = bilangan misi era ini (mengikut pangkalan data). Susun atur: <template id="tpl-bookend">.
   */
  async showBookEnd() {
    const n = this.quests.length;
    const page = tpl('bookend', { title: `Kisah ${this.era.eraName} lengkap`, count: `${n} halaman` });
    for (let i = 0; i < n; i += 1) {
      const sheet = el('div', 'be-page');
      sheet.style.setProperty('--i', i);
      sheet.style.setProperty('--n', n);
      page.refs.pages.appendChild(sheet);
    }
    this.layer.appendChild(page);
    requestAnimationFrame(() => page.classList.add('in'));
    await this.gate(sleep(600 + n * 450 + 900));       // semua halaman masuk
    page.classList.add('siap');                        // buku bercahaya
    await this.gate(sleep(1800));
    page.classList.remove('in');
    await sleep(400);
    page.remove();
  }

  async finishChapter() {
    this.layer.innerHTML = '';
    let res;
    try {
      res = await this.gate(this.narrative.evaluateBadgeUnlock(this.api, {
        studentID: this.student.studentID, eraID: this.eraID, questIDs: this.run.questIDs
      }));
    } catch (err) {
      if (err instanceof SceneGone) throw err;
      await this.game.openModal({ title: 'Lencana tidak dapat disimpan', body: `<p>${esc(err.message)}</p>`, buttons: [{ label: 'Kembali ke peta', primary: true }] });
      this.game.go('MapScene', { focusEra: this.eraID });
      return;
    }
    if (!res.isNarrativeComplete) {
      // never leave the player stuck on the same saved run: the next visit starts a clean story
      this.game.runStore.clear(this.student.studentID, this.eraID);
      await this.gate(this.game.openModal({ title: 'Masih ada misi', body: '<p>Ada misi yang belum direkodkan. Cerita akan dimulakan semula supaya anda boleh menyelesaikannya.</p>', buttons: [{ label: 'Kembali ke peta', primary: true }] }));
      this.game.go('MapScene', { focusEra: this.eraID });
      return;
    }
    const sid = this.student.studentID;
    this.game.runStore.clear(sid, this.eraID);
    this.game.runStore.setRole(sid, this.eraID, this.narrative.role
      ? { name: this.narrative.role.npc.name, asset: this.narrative.role.npc.asset, lines: this.narrative.role.lines }
      : null);

    const b = res.badge;
    await this.showBookEnd();                          // halaman setiap misi terkumpul ke dalam buku
    const shelf = new ShelfComponent(this.game);
    await this.gate(shelf.reveal(this.layer, { kind: 'badge', item: { name: b.badgeTitle, asset: b.badgeAsset, isUnlocked: true }, title: b.isNew ? 'LENCANA BARU' : 'LENCANA ANDA' }));
    await this.gate(this.roleSay(1));
    await this.game.refreshEras();
    await this.game.go('DoorsScene', { eraID: this.eraID, first: true });
  }
}
