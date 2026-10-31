/**
 * api.js  -  one place for every request the game makes.
 * Student endpoints take studentID in the query / body (as the existing backend does).
 * Every failure becomes an ApiError with a plain Malay message.
 */
export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

export class Api {
  constructor(session) { this.session = session; }

  async _go(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      throw new ApiError('Pelayan tidak dapat dihubungi. Semak sambungan anda.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    if (res.status === 401) {                       // login expired or the account is gone: start again
      try { localStorage.removeItem('sejarahwira_user'); } catch { /* ignore */ }
      window.location.href = '../index.html';
      throw new ApiError((data && data.message) || 'Sesi tamat. Sila log masuk semula.', 401);
    }
    if (!res.ok || !data || data.success === false) {
      throw new ApiError((data && data.message) || 'Permintaan gagal. Sila cuba lagi.', res.status);
    }
    return data;
  }

  get(path, params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
    const s = q.toString();
    return this._go(`/api/${path}${s ? `?${s}` : ''}`, { headers: this._headers() });
  }

  post(path, body = {}) {
    return this._go(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body)
    });
  }

  _headers() {
    const t = this.session && this.session.token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  /* ---- named calls (so scenes never build URLs) ---- */
  eras(studentID) { return this.get('era/list', { studentID }); }
  entityLines(eraID) { return this.get('entity/lines', { eraID }); }
  avatars(studentID) { return this.get('avatar/options', { studentID }); }
  saveAvatar(studentID, avatarID) { return this.post('avatar/save', { studentID, avatarID }); }
  profile(studentID) { return this.get('profile', { studentID }); }
  joinClass(classCode) { return this.post('profile/join-class', { classCode }); }
  leaveClass() { return this.post('profile/leave-class', {}); }
  badges(studentID) { return this.get('reward/badges', { studentID }); }
  artifacts(studentID) { return this.get('reward/artifacts', { studentID }); }
  progress(studentID) { return this.get('progress/view', { studentID }); }

  loadNarrative(p) { return this.get('story/load-narrative', p); }
  assignQuest(p) { return this.get('story/assign-quest', p); }
  loadQuest(questID) { return this.get('story/load-quest', { questID }); }
  verifyCompletion(body) { return this.post('story/verify-completion', body); }
  resetReplay(body) { return this.post('story/reset-replay', body); }
  evaluateBadgeUnlock(body) { return this.post('story/evaluate-badge-unlock', body); }

  formative(eraID, limit = 10) { return this.get('assessment/formative', { eraID, limit }); }
  summative(eraID, limit = 10) { return this.get('assessment/summative', { eraID, limit }); }
  siegeAnswer(body) { return this.post('assessment/summative/answer', body); }
  saveScore(body) { return this.post('assessment/summative/submit', body); }
}
