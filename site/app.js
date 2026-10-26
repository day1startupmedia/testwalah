/* TestWalah — single-page app. No backend; everything is saved in this browser (localStorage). */
(function () {
  'use strict';
  const LS = { active: 'pyq.v1.active', attempts: 'pyq.v1.attempts', lang: 'pyq.v1.lang', prefs: 'pyq.v1.prefs' };
  const EXAMS = {
    neet: { key: 'neet', name: 'NEET', exam: 'NEET', subjects: ['Physics', 'Chemistry', 'Biology'], cls: 'neet', minPerQ: 1 },
    jee: { key: 'jee', name: 'JEE Main', exam: 'JEE Main', subjects: ['Physics', 'Chemistry', 'Maths'], cls: 'jee', minPerQ: 2 }
  };
  const app = document.getElementById('app');
  let lang = localStorage.getItem(LS.lang) || 'en';
  const t = (k, v) => {
    let s = (STR[lang] && STR[lang][k]) || STR.en[k] || k;
    if (v) for (const n in v) s = s.replace('{' + n + '}', v[n]);
    return s;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtText = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
  const fmtTime = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0'); };
  const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + x + 's'; };
  const fmtDate = ms => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
  function math(el) {
    if (window.renderMathInElement) {
      try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) { }
    }
  }
  function shuffle(a, seed) { a = a.slice(); let s = seed || Date.now(); const r = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- data ---------- */
  const papers = {}; const waiting = {};
  window.PYQ_DATA = { add(p) { p.questions.forEach(q => { q.paperId = p.id; }); papers[p.id] = p; (waiting[p.id] || []).forEach(f => f(p)); delete waiting[p.id]; } };
  const INDEX = window.PYQ_INDEX || [];
  const meta = id => INDEX.find(p => p.id === id);
  function loadPaper(id) {
    if (papers[id]) return Promise.resolve(papers[id]);
    return new Promise((res, rej) => {
      (waiting[id] = waiting[id] || []).push(res);
      if (waiting[id].length > 1) return;
      const s = document.createElement('script'); s.src = meta(id).file; s.onerror = () => rej(new Error('load ' + id)); document.body.appendChild(s);
    });
  }
  const loadPapers = ids => Promise.all(ids.map(loadPaper));
  const examPapers = ex => INDEX.filter(p => p.exam === EXAMS[ex].exam);
  function qById(id) { for (const p in papers) { const q = papers[p].questions.find(x => x.id === id); if (q) return q; } return null; }

  /* ---------- state ---------- */
  let active = load(LS.active, null);
  let timerInt = null;
  const attempts = () => load(LS.attempts, []);

  /* ---------- router ---------- */
  function route() {
    clearInterval(timerInt); timerInt = null;
    document.body.classList.remove('testing');
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b] = h.split('/');
    window.scrollTo(0, 0);
    if (a === 'exam' && EXAMS[b]) return viewExam(b);
    if (a === 'test') return viewTest();
    if (a === 'result' && b) return viewResult(b, false);
    if (a === 'review' && b) return viewResult(b, true);
    return viewHome();
  }
  window.addEventListener('hashchange', route);
  const go = h => { if (location.hash === h) route(); else location.hash = h; };

  /* ---------- home ---------- */
  function countFor(ex) { return examPapers(ex).reduce((n, p) => n + p.count, 0); }
  function resumeCard() {
    if (!active) return '';
    const left = active.durationSec - active.elapsedSec;
    const answered = Object.values(active.answers).filter(v => v !== null && v !== '').length;
    return `<section class="card resume"><h3>${t('resumeTitle')}</h3><p class="muted small" style="margin:2px 0 10px">${esc(active.title)} · ${answered}/${active.qids.length} ${t('answered').toLowerCase()} · ${fmtTime(left)} left</p>
      <div class="row"><button class="btn primary" id="resumeBtn">${t('resume')}</button><button class="btn danger" id="discardBtn">${t('discard')}</button></div></section>`;
  }
  function bindResume() {
    const r = document.getElementById('resumeBtn'); if (r) r.onclick = () => go('#/test');
    const d = document.getElementById('discardBtn'); if (d) d.onclick = () => { if (confirm(t('discardConfirm'))) { active = null; localStorage.removeItem(LS.active); route(); } };
  }
  function attemptsList(filterExam) {
    const list = attempts().filter(a => !filterExam || a.exam === filterExam).slice(0, 8);
    if (!list.length) return `<p class="muted small">${t('noAttempts')}</p>`;
    return '<div>' + list.map(a => `<div class="attempt"><div><div style="font-weight:700">${esc(a.title)}</div><div class="muted small">${fmtDate(a.finishedAt)} · ${t('accuracy')} ${a.accuracy}%</div></div>
      <div class="row"><span class="score">${a.score}/${a.max}</span><a class="btn" style="min-height:40px;padding:6px 12px" href="#/result/${a.id}">${t('viewResult')}</a></div></div>`).join('') + '</div>';
  }
  function viewHome() {
    app.innerHTML = `${resumeCard()}
      <h1>${t('chooseExam')}</h1>
      <p class="lead">${t('tagline')}</p>
      <div class="exam-cards">
        <a class="exam-card neet" href="#/exam/neet"><span class="name">NEET</span><span class="sub">${t('neetSub')}</span><span class="count">${countFor('neet')} ${t('questions')}</span></a>
        <a class="exam-card jee" href="#/exam/jee"><span class="name">JEE Main</span><span class="sub">${t('jeeSub')}</span><span class="count">${countFor('jee')} ${t('questions')}</span></a>
      </div>
      <h2>${t('pastAttempts')}</h2>
      <section class="card">${attemptsList()}</section>
      <h2>${t('aboutTitle')}</h2>
      <p class="note">${t('about')}</p>`;
    bindResume();
  }

  /* ---------- exam page ---------- */
  const prefs = load(LS.prefs, {});
  function viewExam(ex) {
    const E = EXAMS[ex];
    const ps = examPapers(ex);
    const full = ps.filter(p => p.kind !== 'bank');
    const subjCount = s => ps.reduce((n, p) => n + ((p.bySubject || {})[s] || 0), 0);
    const years = [...new Set(ps.map(p => p.year))].sort((a, b) => b - a);
    const st = prefs[ex] = Object.assign({ subject: E.subjects.find(s => subjCount(s) > 0) || E.subjects[0], n: 20, year: 'all', quick: 10 }, prefs[ex] || {});
    const paperRow = p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}${p.answerKey && p.answerKey.type === 'provisional' ? `<span class="badge">${t('provisional')}</span>` : ''}</div>
      <div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')}${p.date ? ' · ' + esc(p.date) : ''}</div>${p.note ? `<div class="meta">${esc(p.note)}</div>` : ''}</div>
      <button class="btn ${E.cls}" data-full="${p.id}">${t('start')}</button></div>`;
    app.innerHTML = `${active ? resumeCard() : ''}
      <a href="#/" class="small">‹ ${t('back')}</a>
      <h1>${E.name}</h1>
      <p class="muted small" style="margin-top:0">${t('marking')}: ${ex === 'neet' ? t('markingNeet') : t('markingJee')}</p>
      <h2>${t('fullMock')}</h2>
      <section class="card">${full.length ? full.map(paperRow).join('') : `<p class="muted">${t('comingSoon')}</p>`}</section>
      <h2>${t('subjectWise')}</h2>
      <section class="card"><p class="muted small" style="margin-top:0">${t('subjectWiseSub')}</p>
        <div class="label">${t('subject')}</div>
        <div class="chips" id="subjChips">${E.subjects.map(s => `<button class="chip" data-s="${s}" aria-pressed="${st.subject === s}" ${subjCount(s) ? '' : 'disabled'}>${s} <span class="muted small">(${subjCount(s)})</span></button>`).join('')}</div>
        <div class="label">${t('year')}</div>
        <div class="chips" id="yearChips"><button class="chip" data-y="all" aria-pressed="${st.year === 'all'}">${t('allYears')}</button>${years.map(y => `<button class="chip" data-y="${y}" aria-pressed="${String(st.year) === String(y)}">${y}</button>`).join('')}</div>
        <div class="label">${t('howMany')}</div>
        <div class="chips" id="nChips">${[10, 20, 30, 45].map(n => `<button class="chip" data-n="${n}" aria-pressed="${st.n === n}">${n}</button>`).join('')}</div>
        <button class="btn ${E.cls} block" id="startSubj">${t('startTest')}</button>
      </section>
      <h2>${t('quickTest')}</h2>
      <section class="card"><p class="muted small" style="margin-top:0">${t('quickTestSub')}</p>
        <div class="row"><button class="btn ${E.cls}" data-quick="10" style="flex:1">10 ${t('questions')}</button><button class="btn ${E.cls}" data-quick="20" style="flex:1">20 ${t('questions')}</button></div>
      </section>
      <h2>${t('pastAttempts')}</h2>
      <section class="card">${attemptsList(E.exam)}</section>
      <p class="note">${t('about')}</p>`;
    bindResume();
    const setPref = () => save(LS.prefs, prefs);
    app.querySelectorAll('#subjChips .chip').forEach(b => b.onclick = () => { st.subject = b.dataset.s; setPref(); app.querySelectorAll('#subjChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    app.querySelectorAll('#yearChips .chip').forEach(b => b.onclick = () => { st.year = b.dataset.y; setPref(); app.querySelectorAll('#yearChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    app.querySelectorAll('#nChips .chip').forEach(b => b.onclick = () => { st.n = +b.dataset.n; setPref(); app.querySelectorAll('#nChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    app.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
    document.getElementById('startSubj').onclick = () => startPractice(ex, st.subject, st.year, st.n);
    app.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => startPractice(ex, null, 'all', +b.dataset.quick));
  }
  function confirmReplace() { return !active || confirm(t('discardConfirm')); }
  async function startFull(id) {
    if (!confirmReplace()) return;
    const p = await loadPaper(id);
    const qs = p.questions.slice().sort((a, b) => a.qno - b.qno);
    begin({ title: p.title, exam: p.exam, mode: 'full', qs, durationSec: p.minutes * 60, rules: p.rules || {} });
  }
  async function startPractice(ex, subject, year, n) {
    if (!confirmReplace()) return;
    const E = EXAMS[ex];
    const ps = examPapers(ex).filter(p => year === 'all' || String(p.year) === String(year));
    await loadPapers(ps.map(p => p.id));
    let pool = [];
    ps.forEach(p => papers[p.id].questions.forEach(q => { if (!subject || q.subject === subject) pool.push(q); }));
    if (!pool.length) { toast(t('noQuestions')); return; }
    let qs;
    if (subject) qs = shuffle(pool).slice(0, n);
    else { // quick test: balanced across subjects
      const by = {}; shuffle(pool).forEach(q => (by[q.subject] = by[q.subject] || []).push(q));
      const subs = Object.keys(by); qs = []; let i = 0;
      while (qs.length < n && subs.some(s => by[s].length)) { const s = subs[i++ % subs.length]; if (by[s].length) qs.push(by[s].pop()); }
      const o = s => E.subjects.indexOf(s); qs.sort((a, b) => o(a.subject) - o(b.subject));
    }
    const title = subject ? `${E.name} · ${subject} · ${qs.length} Q` + (year !== 'all' ? ` · ${year}` : '') : `${E.name} · ${t('quick')} · ${qs.length} Q`;
    begin({ title, exam: E.exam, mode: subject ? 'subject' : 'quick', qs, durationSec: Math.round(qs.length * E.minPerQ * 60), rules: {} });
  }
  function begin(o) {
    const marking = {}; o.qs.forEach(q => { marking[q.paperId] = (meta(q.paperId) || {}).marking || {}; });
    active = { id: 't' + Date.now().toString(36), title: o.title, exam: o.exam, mode: o.mode, qids: o.qs.map(q => q.id), paperIds: [...new Set(o.qs.map(q => q.paperId))],
      durationSec: o.durationSec, elapsedSec: 0, startedAt: Date.now(), answers: {}, marked: {}, visited: {}, cur: 0, rules: o.rules, marking };
    save(LS.active, active); go('#/test');
  }

  /* ---------- test ---------- */
  async function viewTest() {
    if (!active) return go('#/');
    app.innerHTML = `<p class="loading">${t('loading')}</p>`;
    await loadPapers(active.paperIds);
    const qs = active.qids.map(qById);
    document.body.classList.add('testing');
    const subs = [...new Set(qs.map(q => q.subject))];
    app.innerHTML = `<div class="tbar"><div class="ttl">${esc(active.title)}</div><div class="timer" id="timer" aria-label="Time left">--:--</div><button class="btn primary" id="submitTop">${t('submit')}</button></div>
      ${subs.length > 1 ? `<nav class="subtabs" id="subtabs" aria-label="Subjects">${subs.map(s => `<button data-s="${s}">${s}</button>`).join('')}</nav>` : ''}
      <section class="qwrap" id="qwrap" aria-live="polite"></section>
      <div class="bbar"><div class="inner"><button class="btn" id="prevBtn">‹ ${t('prev')}</button><button class="btn" id="palBtn">▦ ${t('palette')}</button><button class="btn primary" id="nextBtn">${t('next')} ›</button></div>
      <div class="row2"><button class="btn" id="clearBtn">${t('clear')}</button><button class="btn" id="markBtn">⚑ ${t('review')}</button></div></div>`;
    const qwrap = document.getElementById('qwrap');
    const persist = () => save(LS.active, active);
    function isAns(id) { const v = active.answers[id]; return v !== undefined && v !== null && String(v).trim() !== ''; }
    function sectionBCount(q) { return qs.filter(x => x.part === 'B' && x.paperId === q.paperId && (x.section || x.subject) === (q.section || q.subject) && isAns(x.id)).length; }
    function render() {
      const i = active.cur, q = qs[i];
      active.visited[q.id] = 1; persist();
      const a = active.answers[q.id];
      const src = `${esc(q.paper)} · Q${q.qno}`;
      let opts = '';
      if (q.type === 'numerical') {
        opts = `<div class="numin"><input id="numIn" inputmode="decimal" autocomplete="off" placeholder="${t('enterAnswer')}" aria-label="${t('enterAnswer')}" value="${a != null ? esc(a) : ''}"></div><p class="muted small">${t('numericalHint')}</p>`;
      } else if (q.optionsInImage) {
        opts = `<div class="opts grid4" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="${String(a) === String(k + 1)}" data-v="${k + 1}"><span class="k">${k + 1}</span><span class="ot">${t('option')} ${k + 1}</span></button>`).join('')}</div>`;
      } else {
        opts = `<div class="opts" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="${String(a) === String(k + 1)}" data-v="${k + 1}"><span class="k">${k + 1}</span><span class="ot">${fmtText(o)}</span></button>`).join('')}</div>`;
      }
      const secnote = (active.rules.sectionBAttemptMax && q.part === 'B') ? `<p class="secnote">${q.section || q.subject} · ${t('sectionB')} (${sectionBCount(q)}/10)</p>` : '';
      qwrap.innerHTML = `<div class="qhead"><div><div class="qnum">${t('q')} ${i + 1} <span class="muted small">${t('of')} ${qs.length}</span></div><div class="qsrc">${q.subject}${q.section && q.section !== q.subject ? ' · ' + q.section : ''} · ${src}</div></div>
        <button class="flag" id="flagBtn" aria-pressed="${!!active.marked[q.id]}">⚑ ${active.marked[q.id] ? t('marked') : t('mark')}</button></div>
        ${secnote}
        <div class="qbody">${q.image ? `<img src="${q.image}" alt="Question ${i + 1}" id="qimg">` : ''}${q.question ? `<div class="qtext">${fmtText(q.question)}</div>` : ''}</div>
        ${opts}`;
      math(qwrap);
      qwrap.querySelectorAll('.opt').forEach(b => b.onclick = () => choose(q, b.dataset.v));
      const ni = document.getElementById('numIn');
      if (ni) ni.oninput = () => { const v = ni.value.trim(); if (v === '') delete active.answers[q.id]; else active.answers[q.id] = v; persist(); };
      const img = document.getElementById('qimg'); if (img) img.onclick = () => zoom(q.image);
      document.getElementById('flagBtn').onclick = () => toggleMark(q);
      document.getElementById('prevBtn').disabled = i === 0;
      document.getElementById('nextBtn').textContent = i === qs.length - 1 ? t('submit') + ' ›' : t('next') + ' ›';
      document.getElementById('markBtn').setAttribute('aria-pressed', !!active.marked[q.id]);
      const tabs = document.getElementById('subtabs');
      if (tabs) tabs.querySelectorAll('button').forEach(b => { const on = b.dataset.s === q.subject; b.setAttribute('aria-current', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
      window.scrollTo(0, 0);
    }
    function choose(q, v) {
      if (String(active.answers[q.id]) === String(v)) { delete active.answers[q.id]; }
      else {
        if (active.rules.sectionBAttemptMax && q.part === 'B' && !isAns(q.id) && sectionBCount(q) >= active.rules.sectionBAttemptMax) { toast(t('sectionBLimit')); return; }
        active.answers[q.id] = v;
      }
      persist(); render();
    }
    function toggleMark(q) { if (active.marked[q.id]) delete active.marked[q.id]; else active.marked[q.id] = 1; persist(); render(); }
    function goTo(i) { active.cur = Math.max(0, Math.min(qs.length - 1, i)); persist(); render(); }
    document.getElementById('prevBtn').onclick = () => goTo(active.cur - 1);
    document.getElementById('nextBtn').onclick = () => { if (active.cur === qs.length - 1) confirmSubmit(); else goTo(active.cur + 1); };
    document.getElementById('clearBtn').onclick = () => { delete active.answers[qs[active.cur].id]; persist(); render(); };
    document.getElementById('markBtn').onclick = () => { const q = qs[active.cur]; if (!active.marked[q.id]) { active.marked[q.id] = 1; persist(); if (active.cur < qs.length - 1) goTo(active.cur + 1); else render(); } else toggleMark(q); };
    document.getElementById('palBtn').onclick = palette;
    document.getElementById('submitTop').onclick = confirmSubmit;
    const tabs = document.getElementById('subtabs');
    if (tabs) tabs.querySelectorAll('button').forEach(b => b.onclick = () => goTo(qs.findIndex(q => q.subject === b.dataset.s)));
    function status(q) { const a = isAns(q.id), m = !!active.marked[q.id]; if (m) return a ? 'mk ans' : 'mk'; if (a) return 'ans'; if (active.visited[q.id]) return 'nans'; return ''; }
    function counts() { let ans = 0, mk = 0, nv = 0, na = 0; qs.forEach(q => { const a = isAns(q.id); if (a) ans++; if (active.marked[q.id]) mk++; if (!active.visited[q.id]) nv++; else if (!a) na++; }); return { ans, mk, nv, na, left: qs.length - ans }; }
    function sheet(html, mid) {
      const bg = document.createElement('div'); bg.className = 'sheet-bg' + (mid ? ' mid' : ''); bg.innerHTML = `<div class="sheet${mid ? ' center' : ''}" role="dialog" aria-modal="true">${html}</div>`;
      bg.onclick = e => { if (e.target === bg) bg.remove(); }; document.body.appendChild(bg); return bg;
    }
    function palette() {
      const c = counts();
      const groups = subs.map(s => `<h3 style="margin-top:6px">${s}</h3><div class="pal">${qs.map((q, i) => q.subject === s ? `<button class="pb ${status(q)} ${i === active.cur ? 'cur' : ''}" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>` : '').join('')}</div>`).join('');
      const bg = sheet(`<div class="row spread"><h2 style="margin:0">${t('palette')}</h2><button class="btn" data-x>${t('close')}</button></div>
        <div class="legend"><span><i class="dot ans"></i>${t('answered')} (${c.ans})</span><span><i class="dot nans"></i>${t('notAnswered')} (${c.na})</span><span><i class="dot"></i>${t('notVisited')} (${c.nv})</span><span><i class="dot mk"></i>${t('markedForReview')} (${c.mk})</span></div>
        ${groups}<button class="btn primary block" data-sub>${t('submitTest')}</button>`);
      bg.querySelector('[data-x]').onclick = () => bg.remove();
      bg.querySelector('[data-sub]').onclick = () => { bg.remove(); confirmSubmit(); };
      bg.querySelectorAll('.pb').forEach(b => b.onclick = () => { bg.remove(); goTo(+b.dataset.i); });
    }
    function confirmSubmit() {
      const c = counts();
      const bg = sheet(`<h2 style="margin-top:0">${t('submitConfirm')}</h2>
        <div class="stats"><div class="stat ok"><b>${c.ans}</b>${t('answered')}</div><div class="stat bad"><b>${c.left}</b>${t('notAnswered')}</div><div class="stat"><b>${c.mk}</b>${t('marked')}</div></div>
        <p class="muted small">${fmtTime(active.durationSec - active.elapsedSec)} left</p>
        <div class="row"><button class="btn" data-x style="flex:1">${t('goBack')}</button><button class="btn primary" data-sub style="flex:1">${t('submitTest')}</button></div>`, true);
      bg.querySelector('[data-x]').onclick = () => bg.remove();
      bg.querySelector('[data-sub]').onclick = () => { bg.remove(); finish(false); };
    }
    function zoom(src) {
      const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = `<button class="btn primary">${t('close')}</button><img src="${src}" alt="">`;
      z.querySelector('button').onclick = () => z.remove(); document.body.appendChild(z);
    }
    const timerEl = document.getElementById('timer');
    let last = Date.now();
    function tick() {
      const now = Date.now(); active.elapsedSec += (now - last) / 1000; last = now;
      const left = active.durationSec - active.elapsedSec;
      timerEl.textContent = fmtTime(left); timerEl.classList.toggle('low', left < 300);
      persist();
      if (left <= 0) { finish(true); }
    }
    tick(); timerInt = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { last = Date.now(); }, { once: false });
    render();
  }
  function finish(timeUp) {
    clearInterval(timerInt); timerInt = null;
    const qs = active.qids.map(qById);
    const r = PYQScoring.score(qs, active.answers, { marking: active.marking, rules: active.rules });
    const at = { id: active.id, title: active.title, exam: active.exam, mode: active.mode, qids: active.qids, answers: active.answers, marked: active.marked, paperIds: active.paperIds,
      rules: active.rules, marking: active.marking, startedAt: active.startedAt, finishedAt: Date.now(), durationSec: active.durationSec, timeTakenSec: Math.min(active.durationSec, Math.round(active.elapsedSec)),
      score: r.score, max: r.max, correct: r.correct, wrong: r.wrong, skipped: r.skipped + r.notCounted, accuracy: r.accuracy, bySubject: r.bySubject };
    const list = attempts(); list.unshift(at); save(LS.attempts, list.slice(0, 30));
    active = null; localStorage.removeItem(LS.active);
    if (timeUp) setTimeout(() => toast(t('timeUp')), 300);
    go('#/result/' + at.id);
  }

  /* ---------- result & review ---------- */
  async function viewResult(id, reviewOnly) {
    const at = attempts().find(a => a.id === id);
    if (!at) return go('#/');
    app.innerHTML = `<p class="loading">${t('loading')}</p>`;
    await loadPapers(at.paperIds.filter(meta));
    const qs = at.qids.map(qById).filter(Boolean);
    const r = PYQScoring.score(qs, at.answers, { marking: at.marking, rules: at.rules });
    const ex = at.exam === 'NEET' ? 'neet' : 'jee';
    const subRows = Object.entries(r.bySubject).map(([s, v]) => `<tr><td>${s}</td><td>${v.attempted}/${v.total}</td><td style="color:var(--ok)">${v.correct}</td><td style="color:var(--bad)">${v.wrong}</td><td><b>${v.score}</b>/${v.max}</td></tr>`).join('');
    let filter = 'all';
    app.innerHTML = `<a href="#/exam/${ex}" class="small">‹ ${EXAMS[ex].name}</a>
      <h1>${t('result')}</h1><p class="muted small" style="margin-top:0">${esc(at.title)} · ${fmtDate(at.finishedAt)}</p>
      <section class="card"><div class="bigscore"><div class="n">${r.score}<span class="d" style="font-size:1.2rem"> / ${r.max}</span></div><div class="d">${t('score')}</div></div>
        <div class="stats"><div class="stat ok"><b>${r.correct}</b>${t('correct')}</div><div class="stat bad"><b>${r.wrong}</b>${t('wrong')}</div><div class="stat"><b>${r.skipped + r.notCounted}</b>${t('skipped')}</div></div>
        <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b>${r.accuracy}%</b>${t('accuracy')}</div><div class="stat"><b>${fmtDur(at.timeTakenSec)}</b>${t('timeTaken')}</div></div>
      </section>
      <h2>${t('subjectBreakdown')}</h2>
      <section class="card" style="overflow-x:auto"><table><thead><tr><th>${t('subject')}</th><th>${t('attempted')}</th><th>${t('correct')}</th><th>${t('wrong')}</th><th>${t('score')}</th></tr></thead><tbody>${subRows}</tbody></table></section>
      <div class="row"><button class="btn" id="retake" style="flex:1">${t('retake')}</button><a class="btn" href="#/exam/${ex}" style="flex:1">${t('home')}</a></div>
      <h2 id="reviewHead">${t('reviewAnswers')}</h2>
      <div class="chips" id="rf">${['all', 'wrong', 'skipped', 'correct'].map(f => `<button class="chip" data-f="${f}" aria-pressed="${f === 'all'}">${t(f)} (${f === 'all' ? qs.length : qs.filter(q => (r.perQ[q.id] === f) || (f === 'skipped' && r.perQ[q.id] === 'not-counted')).length})</button>`).join('')}</div>
      <div id="rlist"></div>`;
    const ansLabel = (q, v) => v == null || v === '' ? `<span class="muted">${t('notAttempted')}</span>` : (q.type === 'numerical' ? esc(v) : `(${esc(v)})`);
    function renderList() {
      const list = qs.map((q, i) => ({ q, i })).filter(({ q }) => filter === 'all' || r.perQ[q.id] === filter || (filter === 'skipped' && r.perQ[q.id] === 'not-counted'));
      const el = document.getElementById('rlist');
      el.innerHTML = list.map(({ q, i }) => {
        const st = r.perQ[q.id]; const a = at.answers[q.id];
        const key = (meta(q.paperId) || {}).answerKey || {};
        const optList = (!q.optionsInImage && q.type === 'mcq') ? `<ol class="small" style="padding-left:22px;margin:8px 0 0">${q.options.map((o, k) => `<li style="${q.answer.includes(String(k + 1)) ? 'color:var(--ok);font-weight:700' : (String(a) === String(k + 1) ? 'color:var(--bad)' : '')}">${fmtText(o)}</li>`).join('')}</ol>` : '';
        return `<article class="card rq ${st}"><div class="row spread"><div class="qnum">${t('q')} ${i + 1} <span class="qsrc">${q.subject} · ${esc(q.paper)} · Q${q.qno}</span></div><span class="verdict ${st}">${st === 'not-counted' ? t('skipped') : t(st)}</span></div>
          <div class="qbody" style="margin-top:8px">${q.image ? `<img src="${q.image}" alt="Question ${i + 1}" loading="lazy">` : ''}${q.question ? `<div class="qtext">${fmtText(q.question)}</div>` : ''}${optList}</div>
          <div class="ans-line"><span>${t('yourAnswer')}: <b class="${st === 'correct' ? 'ok' : st === 'wrong' ? 'bad' : ''}">${ansLabel(q, a)}</b></span><span>${t('correctAnswer')}: <b class="ok">${q.answer.map(x => ansLabel(q, x)).join(' or ')}</b></span></div>
          ${st === 'not-counted' ? `<p class="small muted">${t('notCounted')}</p>` : ''}
          <div class="expl">${q.explanation ? `<b>${t('explanation')}:</b> ${fmtText(q.explanation)}` : `${t('noExplanation')}${key.name ? ' (' + esc(key.name) + ')' : ''}`}</div>
          <details class="src"><summary>${t('source')}</summary>${esc(q.source)}</details></article>`;
      }).join('');
      math(el);
    }
    renderList();
    app.querySelectorAll('#rf .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; app.querySelectorAll('#rf .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderList(); });
    document.getElementById('retake').onclick = async () => {
      if (!confirmReplace()) return;
      begin({ title: at.title, exam: at.exam, mode: at.mode, qs, durationSec: at.durationSec, rules: at.rules });
    };
    if (reviewOnly) document.getElementById('reviewHead').scrollIntoView();
  }

  /* ---------- language toggle (Hindi strings can be filled in strings.js) ---------- */
  const lb = document.getElementById('langBtn');
  if (STR.hi && Object.keys(STR.hi).length) { lb.hidden = false; lb.textContent = lang === 'hi' ? 'English' : 'हिंदी'; lb.onclick = () => { lang = lang === 'hi' ? 'en' : 'hi'; localStorage.setItem(LS.lang, lang); lb.textContent = lang === 'hi' ? 'English' : 'हिंदी'; route(); }; }

  route();
})();
