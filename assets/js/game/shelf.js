/**
 * ============================================================================
 * shelf.js  -  ONE shelf component, three modes (reuses the old reward shelf look)
 *
 *   mountFull(container, {onSelect})   the trophy room: badges + artifacts, 3 per page
 *   reveal(container, {kind, item})    one item rising onto its dome / pedestal
 *   mountSlots(container, items)       a small row of slots (e.g. next to a result)
 *
 * Pictures (assets/gameAsset/collection/): collection_shelf.jpg, artifact_place_locked.png,
 * artifact_place_unlocked.png, badge_place_locked.png, badge_place_unlocked.png.
 * If one is missing the slot is drawn with CSS so the game still works.
 * Data comes from Student.viewBadges() / viewArtifacts() (Badge.displayBadge(),
 * Artifact.displayArtifact()).
 * ============================================================================
 */
import { el, esc } from './core.js';

const DIR = '../assets/gameAsset/collection';
const PER_PAGE = 3;

const base = (kind, unlocked) => `${DIR}/${kind}_place_${unlocked ? 'unlocked' : 'locked'}.png`;

export class ShelfComponent {
  constructor(game) {
    this.game = game;
    this.page = { badge: 0, artifact: 0 };
    this.data = { badge: [], artifact: [] };
  }

  /* ---- a single card: base picture + sprite (Badge.displayBadge / Artifact.displayArtifact) ---- */
  card(kind, item, { onActivate = null, big = false } = {}) {
    const unlocked = !!item.isUnlocked;
    const c = el('div', `reward-card ${kind}${unlocked ? ' is-unlocked' : ' is-locked'}${big ? ' big' : ''}`);
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', unlocked ? item.name : `${kind === 'badge' ? 'Lencana' : 'Artifak'} terkunci`);

    const bg = new Image();
    bg.className = 'place-holder-bg';
    bg.alt = '';
    bg.src = base(kind, unlocked);
    bg.onerror = () => { bg.remove(); c.classList.add('no-art'); };
    c.appendChild(bg);

    if (unlocked && item.asset) {
      const s = new Image();
      s.className = kind === 'badge' ? 'badge-sprite' : 'artifact-sprite';
      s.alt = item.name;
      s.src = item.asset;
      s.onerror = () => { s.replaceWith(el('span', 'sprite-fallback', kind === 'badge' ? '★' : '❖')); };
      c.appendChild(s);
    } else if (!unlocked) {
      c.appendChild(el('span', 'locked-mark', '?'));
    }
    if (onActivate) {
      const go = (e) => { e.stopPropagation(); onActivate(item, kind); };
      c.addEventListener('click', go);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
    }
    return c;
  }

  /* ---- mode 1: full trophy room ---- */
  async mountFull(container, { onSelect }) {
    this.root = el('div', 'shelf-full');
    this.root.innerHTML = `
      <div class="shelf-nav">
        <button class="btn-wood prev" aria-label="Halaman sebelumnya">◀</button>
        <button class="btn-wood next" aria-label="Halaman seterusnya">▶</button>
      </div>
      <div class="shelf-rows">
        <section class="shelf-row artifacts"><div class="shelf-label">ARTIFAK</div><div class="shelf-track" data-kind="artifact"></div></section>
        <section class="shelf-row badges"><div class="shelf-label">LENCANA</div><div class="shelf-track" data-kind="badge"></div></section>
      </div>
      <div class="shelf-empty hidden"></div>`;
    container.appendChild(this.root);
    this.onSelect = onSelect;
    this.root.querySelector('.prev').addEventListener('click', () => this.turn(-1));
    this.root.querySelector('.next').addEventListener('click', () => this.turn(1));

    const sid = this.game.student.studentID;
    try {
      const [b, a] = await Promise.all([this.game.api.badges(sid), this.game.api.artifacts(sid)]);
      this.data.badge = b.badges || [];
      this.data.artifact = a.artifacts || [];
    } catch (err) {
      const msg = this.root.querySelector('.shelf-empty');
      msg.textContent = 'Koleksi tidak dapat dimuatkan. Cuba lagi sebentar nanti.';
      msg.classList.remove('hidden');
    }
    this.paint();
  }

  get pages() { return Math.max(1, Math.ceil(Math.max(this.data.badge.length, this.data.artifact.length) / PER_PAGE)); }

  turn(dir) {
    const p = Math.min(this.pages - 1, Math.max(0, (this.page.badge || 0) + dir));
    this.page.badge = this.page.artifact = p;
    this.paint();
  }

  paint() {
    ['artifact', 'badge'].forEach((kind) => {
      const track = this.root.querySelector(`.shelf-track[data-kind="${kind}"]`);
      track.innerHTML = '';
      const items = this.data[kind].slice(this.page[kind] * PER_PAGE, this.page[kind] * PER_PAGE + PER_PAGE);
      items.forEach((it) => track.appendChild(this.card(kind, it, { onActivate: (i, k) => this.onSelect(i, k) })));
    });
    this.root.querySelector('.prev').disabled = this.page.badge <= 0;
    this.root.querySelector('.next').disabled = this.page.badge >= this.pages - 1;
  }

  /* ---- mode 2: reveal one item ---- */
  reveal(container, { kind, item, title = '', next = '' }) {
    return new Promise((resolve) => {
      const wrap = el('div', `shelf-reveal ${kind}`);
      wrap.innerHTML = `<div class="rv-rays"></div><div class="rv-title">${esc(title || (kind === 'badge' ? 'LENCANA DIPEROLEHI' : 'ARTIFAK DIBUKA'))}</div>
        <div class="rv-stage"></div><div class="rv-name">${esc(item.name || '')}</div>${next ? '' : '<div class="rv-hint">Tekan Enter</div>'}`;
      container.appendChild(wrap);
      const stage = wrap.querySelector('.rv-stage');
      stage.appendChild(this.card(kind, { ...item, isUnlocked: true }, { big: true }));
      requestAnimationFrame(() => wrap.classList.add('in'));
      const done = () => { off(); wrap.classList.remove('in'); setTimeout(() => { wrap.remove(); resolve(); }, 350); };
      if (next) {
        // butang (atau Enter) untuk ke halaman seterusnya
        const btn = el('button', 'btn-px gold rv-next');
        btn.textContent = next;
        btn.addEventListener('click', (ev) => { ev.stopPropagation(); done(); });
        wrap.appendChild(btn);
      } else {
        wrap.addEventListener('click', done);
      }
      const off = this.game.input.push({ onKeyDown: (k) => { if (k === 'Enter' || k === ' ') { done(); return true; } return false; } });
    });
  }

  /* ---- mode 3: small slots ---- */
  mountSlots(container, items = []) {
    const row = el('div', 'shelf-slots');
    items.slice(0, PER_PAGE).forEach(({ kind, item }) => row.appendChild(this.card(kind, item)));
    container.appendChild(row);
    return row;
  }
}
