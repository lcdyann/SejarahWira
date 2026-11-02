/**
 * ============================================================================
 * questRules.js  -  ONE copy of the quest rules, used by BOTH sides
 *
 *   backend/utils/questRules.js   (imported by contentStoryController.js)
 *   assets/js/questRules.js       (loaded by content_manager.html)
 *
 * Keep the two files identical. Pure functions only (no DOM, no Node modules).
 *
 * The 5 mechanics are the ones quest_game.html can play:
 *   1 Susun Garis Masa   questContent.timelineItems [{id, year, text, why}]   (id order = correct order)
 *                        dates are hidden from the student; `why` = the link from the previous event to this one
 *   2 Cari Bukti         questContent.bgImage, hotspots [{name, top, left}]  (top/left as "25%")
 *   3 Bantu NPC          questContent.npcName (pilihan), prompt, options [{text, item, isCorrect}]
 *                        item (pilihan) = jenis benda yang dihulurkan: kaset, surat, peta, telegram, dokumen, gambar, buku
 *   4 Padanan            questContent.pairs [{text, pair}]               (each pair number twice)
 *   5 Nyahkod Clue       questContent.clueText, options [{text, isCorrect}]
 *
 * Every quest may also carry  questContent.turns  (0-3 "Giliran Anda" moments in the story):
 *   turns [{ after, options [{text, isCorrect, reaction}], clue }]
 *   after   = the dialogue line number (1 = first line of the scene) after which the character
 *             turns to the player. That line's speaker asks and later reacts.
 *   options = 2-3 things the player can say; exactly one is right. Each has the character's
 *             `reaction` (a wrong reply gets an in-story consequence, not "Salah!").
 *   clue    = what Pendekar Bayang whispers when the exchange is rewound (never the answer).
 *
 * quest_game.html inserts these texts into the page as HTML (and hotspot names inside a
 * data-name="..." attribute), so content strings may not contain  < > " ` \
 * ============================================================================
 */
const QuestRules = (() => {
  const TYPES = {
    1: { label: 'Susun Garis Masa', icon: 'fa-timeline', help: 'Tarikh disembunyikan. Pelajar menyusun peristiwa mengikut sebab dan akibat, satu pautan demi satu.', done: 'Selesai apabila semua pautan dirantai dengan betul.' },
    2: { label: 'Cari Bukti', icon: 'fa-magnifying-glass-location', help: 'Pelajar mencari semua bahan bukti yang tersembunyi pada sebuah gambar.', done: 'Selesai apabila semua titik ditemui.' },
    3: { label: 'Bantu NPC', icon: 'fa-hand-holding-heart', help: 'Seorang watak lain (NPC) ada masalah. Pelajar menghulurkan benda yang betul kepadanya (surat, peta, kaset lagu...).', done: 'Selesai apabila benda yang betul diberikan.' },
    4: { label: 'Padanan', icon: 'fa-clone', help: 'Pelajar memadankan setiap kad dengan pasangannya. Mana-mana dua kad boleh dipadankan, tidak kira kedudukannya (bukan hanya atas dan bawah).', done: 'Selesai apabila semua pasangan dipadankan.' },
    5: { label: 'Nyahkod Clue', icon: 'fa-key', help: 'Pelajar membaca satu petunjuk dan memilih jawapan yang betul.', done: 'Selesai apabila jawapan yang betul dipilih.' }
  };

  const LIMITS = {
    questName: 255, description: 2000, instruction: 2000, hint: 255, explanation: 2000, feedback: 2000,
    npcName: 40, year: 40, eventText: 200, why: 200, hotspotName: 80, prompt: 400, clueText: 500, option: 200, card: 80,
    timeline: [2, 8], hotspots: [1, 8], options: [2, 5], pairs: [2, 6],
    aftermath: 200, turns: [0, 3], turnOptions: [2, 3], turnReply: 150, turnReaction: 200, turnClue: 200, turnAfter: [1, 40]
  };

  // Jenis benda untuk misi Bantu NPC (kunci disimpan dalam pangkalan data, nilai = nama paparan)
  const ITEMS = { kaset: 'Kaset lagu', surat: 'Surat', peta: 'Peta', telegram: 'Telegram', dokumen: 'Dokumen', gambar: 'Gambar', buku: 'Buku' };

  const MARKUP = /[<>]/;                      // basic fields (shown as plain text)
  const UNSAFE = /[<>"`\\]/;                  // quest content (inserted as HTML by quest_game.html)
  const BG_PATH = /^\.\.\/assets\/gameAsset\/background\/[A-Za-z0-9][A-Za-z0-9_.\-]*\.(png|jpe?g|webp|gif)$/i;
  const PERCENT = /^(100|[0-9]{1,2})(\.[0-9])?%$/;

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Empty form for a mechanic (what the editor starts with). */
  const defaultFormBase = (type) => {
    switch (Number(type)) {
      case 1: return { items: [{ year: '', text: '', why: '' }, { year: '', text: '', why: '' }] };
      case 2: return { bgImage: '', hotspots: [] };
      case 3: return { npcName: '', prompt: '', options: [{ text: '', item: '', isCorrect: true }, { text: '', item: '', isCorrect: false }] };
      case 4: return { pairs: [{ a: '', b: '' }, { a: '', b: '' }] };
      case 5: return { clueText: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] };
      default: return {};
    }
  };

  /** Stored questContent (what quest_game.html reads) -> editor form. Tolerates empty / old data. */
  const toFormBase = (type, stored) => {
    const c = isObj(stored) ? stored : {};
    const base = defaultFormBase(type);
    switch (Number(type)) {
      case 1: {
        const items = Array.isArray(c.timelineItems)
          ? [...c.timelineItems].sort((x, y) => parseInt(x.id, 10) - parseInt(y.id, 10))
            .map((i) => ({ year: String(i.year ?? ''), text: String(i.text ?? ''), why: String(i.why ?? '') }))
          : [];
        return items.length ? { items } : base;
      }
      case 2:
        return {
          bgImage: typeof c.bgImage === 'string' ? c.bgImage : '',
          hotspots: Array.isArray(c.hotspots)
            ? c.hotspots.map((h) => ({ name: String(h.name ?? ''), top: String(h.top ?? '50%'), left: String(h.left ?? '50%') }))
            : []
        };
      case 3:
      case 5: {
        const options = Array.isArray(c.options)
          ? c.options.map((o) => ({ text: String(o.text ?? ''), item: String(o.item ?? ''), isCorrect: Boolean(o.isCorrect), consequence: String(o.consequence ?? '') }))
          : [];
        const key = Number(type) === 3 ? 'prompt' : 'clueText';
        const out = { [key]: typeof c[key] === 'string' ? c[key] : '', options: options.length ? options : base.options };
        if (Number(type) === 3) out.npcName = typeof c.npcName === 'string' ? c.npcName : '';   // nama NPC yang dibantu
        return out;
      }
      case 4: {
        const groups = new Map();
        (Array.isArray(c.pairs) ? c.pairs : []).forEach((p) => {
          const n = String(p.pair);
          if (!groups.has(n)) groups.set(n, []);
          groups.get(n).push(String(p.text ?? ''));
        });
        const pairs = [...groups.values()].map((g) => ({ a: g[0] || '', b: g[1] || '' }));
        return pairs.length ? { pairs } : base;
      }
      default:
        return base;
    }
  };

  /** a choice: a wrong one may carry what happens in the story when it is picked */
  const optStored = (o) => ({
    text: str(o.text), isCorrect: Boolean(o.isCorrect),
    ...(ITEMS[o.item] ? { item: o.item } : {}),          // jenis benda (Bantu NPC sahaja)
    ...(!o.isCorrect && str(o.consequence) ? { consequence: str(o.consequence) } : {})
  });

  /** Editor form -> stored questContent. Assumes the form already passed validate(). */
  const toStoredBase = (type, f) => {
    switch (Number(type)) {
      case 1:
        return { timelineItems: f.items.map((i, idx) => ({ id: idx + 1, year: str(i.year), text: str(i.text), ...(str(i.why) ? { why: str(i.why) } : {}) })) };
      case 2: {
        const out = { hotspots: f.hotspots.map((h) => ({ name: str(h.name), top: str(h.top), left: str(h.left) })) };
        if (str(f.bgImage)) out.bgImage = str(f.bgImage);
        return out;
      }
      case 3:
        return { ...(str(f.npcName) ? { npcName: str(f.npcName) } : {}), prompt: str(f.prompt), options: f.options.map(optStored) };
      case 4: {
        const pairs = [];
        f.pairs.forEach((p, idx) => {
          pairs.push({ text: str(p.a), pair: idx + 1 });
          pairs.push({ text: str(p.b), pair: idx + 1 });
        });
        return { pairs };
      }
      case 5:
        return { clueText: str(f.clueText), options: f.options.map(optStored) };
      default:
        return {};
    }
  };

  const countErr = (list, [min, max], noun) => {
    if (!Array.isArray(list) || list.length < min) return `Sekurang-kurangnya ${min} ${noun} diperlukan.`;
    if (list.length > max) return `Maksimum ${max} ${noun} dibenarkan.`;
    return null;
  };

  const textErr = (value, label, max) => {
    const v = str(value);
    if (!v) return `${label} wajib diisi.`;
    if (v.length > max) return `${label} terlalu panjang (maksimum ${max} aksara).`;
    if (UNSAFE.test(v)) return `${label}: aksara < > " \` \\ tidak dibenarkan (gunakan tanda petik tunggal ').`;
    return null;
  };

  const choiceErrors = (options, errors) => {
    const c = countErr(options, LIMITS.options, 'pilihan');
    if (c) { errors.push(c); return; }
    options.forEach((o, i) => { const e = textErr(o.text, `Pilihan ${i + 1}`, LIMITS.option); if (e) errors.push(e); });
    const correct = options.filter((o) => o.isCorrect).length;
    if (correct !== 1) errors.push('Tandakan tepat satu jawapan yang betul.');
    const seen = new Set();
    options.forEach((o, i) => {
      const k = str(o.text).toLowerCase();
      if (k && seen.has(k)) errors.push(`Pilihan ${i + 1} sama dengan pilihan lain.`);
      seen.add(k);
    });
  };

  /** Rules for the mechanic-specific part. Returns a list of messages (empty = valid). */
  const validateContentBase = (type, f) => {
    const errors = [];
    if (!isObj(f)) return ['Maklumat misi tidak lengkap.'];

    switch (Number(type)) {
      case 1: {
        const c = countErr(f.items, LIMITS.timeline, 'peristiwa');
        if (c) { errors.push(c); break; }
        f.items.forEach((it, i) => {
          const y = textErr(it.year, `Peristiwa ${i + 1}: tarikh`, LIMITS.year); if (y) errors.push(y);
          const t = textErr(it.text, `Peristiwa ${i + 1}: keterangan`, LIMITS.eventText); if (t) errors.push(t);
          if (i === 0 && !str(it.why)) { /* the first event needs no link */ }
          else {
            const w = textErr(it.why, `Peristiwa ${i + 1}: mengapa peristiwa ini berlaku selepas peristiwa sebelumnya`, LIMITS.why); if (w) errors.push(w);
          }
        });
        const seen = new Set();
        f.items.forEach((it, i) => {
          const k = str(it.text).toLowerCase();
          if (k && seen.has(k)) errors.push(`Peristiwa ${i + 1} sama dengan peristiwa lain.`);
          seen.add(k);
        });
        break;
      }
      case 2: {
        if (str(f.bgImage) && !BG_PATH.test(str(f.bgImage))) errors.push('Gambar latar tidak sah. Pilih daripada senarai gambar.');
        const c = countErr(f.hotspots, LIMITS.hotspots, 'titik bukti');
        if (c) { errors.push(c); break; }
        f.hotspots.forEach((h, i) => {
          const n = textErr(h.name, `Titik ${i + 1}: nama`, LIMITS.hotspotName); if (n) errors.push(n);
          ['top', 'left'].forEach((k) => {
            const v = str(h[k]);
            if (!PERCENT.test(v) || parseFloat(v) > 100) errors.push(`Titik ${i + 1}: kedudukan tidak sah. Klik pada gambar untuk meletakkan titik.`);
          });
        });
        break;
      }
      case 3: {
        // nama NPC dan jenis benda adalah pilihan; jika diisi mesti sah
        if (str(f.npcName)) { const n = textErr(f.npcName, 'Nama NPC', LIMITS.npcName); if (n) errors.push(n); }
        const p = textErr(f.prompt, 'Masalah NPC (gelembung fikiran)', LIMITS.prompt); if (p) errors.push(p);
        choiceErrors(f.options, errors);
        if (Array.isArray(f.options)) f.options.forEach((o, i) => { if (str(o.item) && !ITEMS[str(o.item)]) errors.push(`Pilihan ${i + 1}: jenis benda tidak sah.`); });
        break;
      }
      case 4: {
        const c = countErr(f.pairs, LIMITS.pairs, 'pasangan');
        if (c) { errors.push(c); break; }
        const seen = new Set();
        f.pairs.forEach((p, i) => {
          [['a', 'kad kiri'], ['b', 'kad kanan']].forEach(([k, name]) => {
            const e = textErr(p[k], `Pasangan ${i + 1}: ${name}`, LIMITS.card); if (e) errors.push(e);
            const key = str(p[k]).toLowerCase();
            if (key && seen.has(key)) errors.push(`Pasangan ${i + 1}: ${name} sama dengan kad lain.`);
            seen.add(key);
          });
        });
        break;
      }
      case 5: {
        const c = textErr(f.clueText, 'Teks clue', LIMITS.clueText); if (c) errors.push(c);
        choiceErrors(f.options, errors);
        break;
      }
      default:
        errors.push('Jenis misi tidak sah.');
    }
    return errors;
  };

  /* ---- "Giliran Anda" turns (story moments where the player speaks) ---- */
  const defaultTurn = () => ({
    after: 1,
    options: [{ text: '', isCorrect: true, reaction: '' }, { text: '', isCorrect: false, reaction: '' }],
    clue: ''
  });

  const defaultForm = (type) => ({ ...defaultFormBase(type), aftermath: '', turns: [] });

  const readTurns = (stored) => {
    const list = isObj(stored) && Array.isArray(stored.turns) ? stored.turns : [];
    return list.map((t) => ({
      after: Number.parseInt(t && t.after, 10) || 1,
      options: Array.isArray(t && t.options)
        ? t.options.map((o) => ({ text: String(o.text ?? ''), isCorrect: Boolean(o.isCorrect), reaction: String(o.reaction ?? '') }))
        : defaultTurn().options,
      clue: String((t && t.clue) ?? '')
    }));
  };

  const toForm = (type, stored) => ({ ...toFormBase(type, stored), aftermath: isObj(stored) ? String(stored.aftermath ?? '') : '', turns: readTurns(stored) });

  const toStored = (type, f) => {
    const out = toStoredBase(type, f);
    if (str(f.aftermath)) out.aftermath = str(f.aftermath);
    const turns = Array.isArray(f.turns) ? f.turns : [];
    if (turns.length) {
      out.turns = turns.map((t) => ({
        after: Number.parseInt(t.after, 10),
        options: t.options.map((o) => ({ text: str(o.text), isCorrect: Boolean(o.isCorrect), reaction: str(o.reaction) })),
        clue: str(t.clue)
      }));
    }
    return out;
  };

  const turnErrors = (turns) => {
    const errors = [];
    if (turns === undefined || turns === null) return errors;
    if (!Array.isArray(turns)) return ['Giliran Anda tidak sah.'];
    if (turns.length > LIMITS.turns[1]) return [`Maksimum ${LIMITS.turns[1]} Giliran Anda bagi satu babak.`];
    const seen = new Set();
    turns.forEach((t, i) => {
      const n = `Giliran Anda ${i + 1}`;
      if (!isObj(t)) { errors.push(`${n} tidak lengkap.`); return; }
      const after = Number(t.after);
      if (!Number.isInteger(after) || after < LIMITS.turnAfter[0] || after > LIMITS.turnAfter[1]) {
        errors.push(`${n}: pilih baris dialog yang bertanya kepada pemain.`);
      } else if (seen.has(after)) {
        errors.push(`${n}: baris dialog yang sama sudah digunakan oleh Giliran Anda lain.`);
      } else seen.add(after);

      const opts = t.options;
      const c = countErr(opts, LIMITS.turnOptions, 'balasan');
      if (c) { errors.push(`${n}: ${c}`); return; }
      opts.forEach((o, j) => {
        const a = textErr(o.text, `${n}, balasan ${j + 1}`, LIMITS.turnReply); if (a) errors.push(a);
        const b = textErr(o.reaction, `${n}, reaksi balasan ${j + 1}`, LIMITS.turnReaction); if (b) errors.push(b);
      });
      if (opts.filter((o) => o.isCorrect).length !== 1) errors.push(`${n}: tandakan tepat satu balasan yang betul.`);
      const keys = new Set();
      opts.forEach((o, j) => {
        const k = str(o.text).toLowerCase();
        if (k && keys.has(k)) errors.push(`${n}: balasan ${j + 1} sama dengan balasan lain.`);
        keys.add(k);
      });
      const cl = textErr(t.clue, `${n}: petunjuk Pendekar Bayang`, LIMITS.turnClue); if (cl) errors.push(cl);
    });
    return errors;
  };

  /** "Akibat jika salah" is optional, but when it is written it must be safe and short */
  const aftermathErrors = (f) => {
    const errors = [];
    const check = (value, label) => {
      const v = str(value);
      if (!v) return;
      if (v.length > LIMITS.aftermath) errors.push(`${label} terlalu panjang (maksimum ${LIMITS.aftermath} aksara).`);
      else if (UNSAFE.test(v)) errors.push(`${label}: aksara < > " \` \\ tidak dibenarkan (gunakan tanda petik tunggal ').`);
    };
    check(f.aftermath, 'Akibat jika salah');
    if (Array.isArray(f.options)) f.options.forEach((o, i) => { if (o && !o.isCorrect) check(o.consequence, `Akibat pilihan ${i + 1}`); });
    return errors;
  };

  const validateContent = (type, f) => {
    const errors = validateContentBase(type, f);
    if (isObj(f)) errors.push(...aftermathErrors(f));
    if (isObj(f)) errors.push(...turnErrors(f.turns));
    return errors;
  };

  /**
   * Whole quest. input: { questName, description, instruction, questType, hint, explanation, feedback, form }
   * -> { valid, errors:{field:msg}, contentErrors:[msg], value }  (value.content = stored questContent)
   */
  const validate = (input = {}) => {
    const v = {
      questName: str(input.questName),
      description: str(input.description),
      instruction: str(input.instruction),
      questType: Number(input.questType),
      hint: str(input.hint),
      explanation: str(input.explanation),
      feedback: str(input.feedback)
    };
    const errors = {};

    const need = (field, label) => {
      if (!v[field]) errors[field] = `${label} wajib diisi.`;
      else if (v[field].length > LIMITS[field]) errors[field] = `${label} terlalu panjang (maksimum ${LIMITS[field]} aksara).`;
    };
    need('questName', 'Nama misi');
    need('instruction', 'Arahan');
    ['description', 'hint', 'explanation', 'feedback'].forEach((f) => {
      if (v[f].length > LIMITS[f]) errors[f] = `Terlalu panjang (maksimum ${LIMITS[f]} aksara).`;
    });
    ['questName', 'description', 'instruction', 'hint', 'explanation', 'feedback'].forEach((f) => {
      if (!errors[f] && MARKUP.test(v[f])) errors[f] = 'Aksara < dan > tidak dibenarkan.';
    });

    if (![1, 2, 3, 4, 5].includes(v.questType)) errors.questType = 'Sila pilih jenis misi.';

    const contentErrors = errors.questType ? [] : validateContent(v.questType, input.form);
    const valid = Object.keys(errors).length === 0 && contentErrors.length === 0;
    if (valid) v.content = toStored(v.questType, input.form);

    return { valid, errors, contentErrors, value: v };
  };

  return { TYPES, LIMITS, ITEMS, BG_PATH, defaultForm, defaultTurn, toForm, toStored, validateContent, validate };
})();

if (typeof globalThis !== 'undefined') globalThis.QuestRules = QuestRules;