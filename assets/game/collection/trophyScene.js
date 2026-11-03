/**
 * assets/game/collection/trophyScene.js  -  TrophyScene
 * MODULE: collection  (Trophy room: badges + artifacts shelf)
 * USE CASE: UC-07, UC-08   CLASS DIAGRAM: Badge, StudentArtifact
 */
import { ShelfComponent } from './shelf.js';
import { el, esc } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { spriteEl } from '../npc/entity.js';

/* ========================================================================== */
/* TrophyScene                                                                */
/* ========================================================================== */
export class TrophyScene extends GameScene {
  async enter() {
    this.root.classList.add('trophy');
    this.root.innerHTML = '<div class="trophy-bg"></div><button class="btn-px small back-hub">◀ Meja (Esc)</button>';
    this.root.querySelector('.back-hub').addEventListener('click', () => this.game.go('HubScene'));
    this.keys({ onKeyDown: (k) => { if (k === 'Escape') { this.game.go('HubScene'); return true; } return false; } });
    this.shelf = new ShelfComponent(this.game);
    await this.shelf.mountFull(this.root, { onSelect: (item, kind) => this.detail(item, kind) });
  }

  async detail(item, kind) {
    if (!item.isUnlocked) {
      const cond = kind === 'badge'
        ? (item.eraName ? `Selesaikan semua misi ${item.eraName} untuk membuka lencana ini.` : 'Selesaikan semua misi era berkaitan.')
        : (item.eraName ? `Dapatkan skor sekurang-kurangnya ${item.artifactScore ?? 80}% dalam Kepungan Agung ${item.eraName} untuk mendapat artifak era ini.` : 'Lulus Kepungan Agung era berkaitan.');
      await this.game.openModal({ title: 'Terkunci', body: `<p>${esc(cond)}</p>`, buttons: [{ label: 'Tutup', primary: true }] });
      return;
    }
    const date = item.acquiredAt ? new Date(item.acquiredAt).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    // the picture of the badge / artifact, then its details (a drawn mark shows while the picture is missing)
    const body = el('div', 'trophy-detail');
    const pic = el('div', 'trophy-detail-pic');
    const img = new Image();
    img.alt = item.name; img.draggable = false;
    img.onerror = () => { img.remove(); pic.textContent = kind === 'artifact' ? '\u{1F3FA}' : '\u{1F3C5}'; };
    img.src = item.asset || '';
    pic.appendChild(img);
    const info = el('div', 'trophy-detail-info');
    info.innerHTML = `<p class="muted">Diperoleh: ${esc(date)}</p><p>${esc(item.eraName || '')}</p>`;
    body.append(pic, info);
    await this.game.openModal({ title: item.name, body, buttons: [{ label: kind === 'artifact' && item.moralLesson ? 'Dengar pengajaran' : 'Tutup', primary: true }] });
    if (kind === 'artifact' && item.moralLesson) {
      // in the trophy room the original role is the student, so the avatar reads the lesson
      await this.dialog.say({
        name: this.student.studentName, text: `Rupanya... ${item.moralLesson}`,     // long lessons are cut into pages by the dialogue box
        portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'), side: 'right'
      });
      this.dialog.hide();
    }
  }
}
