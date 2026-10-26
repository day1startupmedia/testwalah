/* SONEXA — single-page app. No backend; everything is saved in this browser (localStorage). */
(function () {
  'use strict';
  const LS = { active: 'pyq.v1.active', attempts: 'pyq.v1.attempts', lang: 'pyq.v1.lang', prefs: 'pyq.v1.prefs', name: 'sonexa.v1.fullName' };
  const EXAMS = {
    neet: { key: 'neet', name: 'NEET', exam: 'NEET', subjects: ['Physics', 'Chemistry', 'Biology'], cls: 'neet', minPerQ: 1 },
    jee: { key: 'jee', name: 'JEE Main', exam: 'JEE Main', subjects: ['Physics', 'Chemistry', 'Maths'], cls: 'jee', minPerQ: 2 },
    cbse: { key: 'cbse', name: 'CBSE Board', exam: 'CBSE', subjects: [], cls: 'cbse', minPerQ: 1.5 }
  };
  const CBSE_CLASSES = ['10', '12'];
  const CBSE_SUBJECTS = { '10': ['Science', 'Maths Standard', 'Maths Basic', 'Social Science'], '12': ['Physics', 'Chemistry', 'Maths', 'Biology', 'Accountancy', 'Business Studies', 'Economics'] };
  const cbsePapers = cls => INDEX.filter(p => p.exam === 'CBSE' && (!cls || String(p.class) === String(cls))).sort((x, y) => String(y.session || y.year).localeCompare(String(x.session || x.year)));
  // Option button labels: per question, else per paper (CBSE prints A-D), else 1-4.
  const isBoard = p => p.kind === 'board' || /-board-/.test(p.id);
  const optLabels = q => q.optionLabels || (meta(q.paperId) || {}).optionLabels || null;
  const optLabel = (q, k) => { const l = optLabels(q); return l && l[k] != null ? l[k] : String(k + 1); };
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
  const examPapers = ex => INDEX.filter(p => p.exam === EXAMS[ex].exam && p.kind !== 'sample');
  const samplePapers = ex => INDEX.filter(p => p.exam === EXAMS[ex].exam && p.kind === 'sample');
  const ALL = 'All';
  const ALLN = 100000;
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
    if (a === 'exam' && b === 'cbse') return viewCbse(h.split('/')[2]);
    if (a === 'exam' && EXAMS[b]) return viewExam(b);
    if (a === 'test') return viewTest();
    if (a === 'result' && b) return viewResult(b, false);
    if (a === 'review' && b) return viewResult(b, true);
    if (a === 'page' && PAGES()[b]) return viewPage(b);
    return viewHome();
  }
  window.addEventListener('hashchange', route);
  // History: every screen is its own hash entry, so the phone's back gesture/button moves between SONEXA screens.
  // Each entry is stamped with its depth (sx); the on-page Back button goes back in history when an in-site screen
  // is behind it, and on a deep link with nothing behind it follows its own link (replacing, so it never leaves the site).
  const curDepth = () => (history.state && typeof history.state.sx === 'number') ? history.state.sx : null;
  if (curDepth() === null) history.replaceState({ sx: 0 }, '');
  let lastDepth = curDepth();
  window.addEventListener('hashchange', () => { if (curDepth() === null) history.replaceState({ sx: lastDepth + 1 }, ''); lastDepth = curDepth(); });
  const go = (h, replace) => {
    if (location.hash === h) return route();
    if (replace) { history.replaceState({ sx: curDepth() ?? lastDepth }, '', h); lastDepth = curDepth(); return route(); }
    location.hash = h;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('a.backbtn'); if (!b) return;
    e.preventDefault();
    if ((curDepth() ?? 0) > 0) history.back(); else go(b.getAttribute('href'), true);
  });

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
    return '<div>' + list.map(a => `<div class="attempt"><div><div style="font-weight:700">${esc(a.title)}</div><div class="muted small">${a.fullName ? esc(a.fullName) + ' · ' : ''}${fmtDate(a.finishedAt)} · ${t('accuracy')} ${a.accuracy}%</div></div>
      <div class="row"><span class="score">${a.score}/${a.max}</span><a class="btn" style="min-height:40px;padding:6px 12px" href="#/result/${a.id}">${t('viewResult')}</a></div></div>`).join('') + '</div>';
  }
  /* ---------- info pages: About / Privacy / Terms / Copyright ---------- */
  const PAGE_ORDER = ['about', 'privacy', 'terms', 'copyright'];
  const PAGES = () => (STR[lang] && STR[lang].pages) || STR.en.pages || {};
  function siteFooter() {
    const P = PAGES();
    return `<footer class="site-foot"><nav>${PAGE_ORDER.filter(k => P[k]).map(k => `<a href="#/page/${k}">${esc(P[k].link)}</a>`).join('<span aria-hidden="true"> · </span>')}</nav><div>${contactLink()}</div><div>${esc(t('footerCopy'))}</div></footer>`;
  }
  function contactLink() { const m = t('contactEmail'); return `${esc(t('contactLabel'))}: <a class="mail" href="mailto:${esc(m)}">${esc(m)}</a>`; }
  function viewPage(k) {
    const P = PAGES()[k];
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>${esc(P.title)}</h1>
      <section class="card info-page">${P.body.map(x => `<p>${esc(x)}</p>`).join('')}<p class="muted">${contactLink()}</p></section>
      ${siteFooter()}`;
  }
  function viewHome() {
    app.innerHTML = `${resumeCard()}
      <h1>${t('chooseExam')}</h1>
      <p class="lead">${t('tagline')}</p>
      <div class="exam-cards">
        <a class="exam-card neet" href="#/exam/neet"><span class="name">NEET</span><span class="sub">${t('neetSub')}</span><span class="count">${countFor('neet')} ${t('questions')}</span></a>
        <a class="exam-card jee" href="#/exam/jee"><span class="name">JEE Main</span><span class="sub">${t('jeeSub')}</span><span class="count">${countFor('jee')} ${t('questions')}</span></a>
        <a class="exam-card cbse" href="#/exam/cbse"><span class="name">CBSE Board</span><span class="sub">${t('cbseSub')}</span><span class="count">${cbsePapers().reduce((n, p) => n + p.count, 0)} ${t('questions')}</span></a>
      </div>
      <h2>${t('pastAttempts')}</h2>
      <section class="card">${attemptsList()}</section>
      <h2>${t('aboutTitle')}</h2>
      <p class="note">${t('about')}</p>
      <p class="note">${t('cbseSource')}</p>
      ${siteFooter()}`;
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
    const allCount = ps.reduce((n, p) => n + p.count, 0);
    const avail = () => ps.filter(p => st.year === 'all' || String(p.year) === String(st.year)).reduce((n, p) => n + (st.subject === ALL ? p.count : ((p.bySubject || {})[st.subject] || 0)), 0);
    const nOpts = () => { if (st.subject !== ALL) return [10, 20, 30, 45]; const a = avail(); return [45, 90, 180].filter(x => x < a).concat([ALLN]); };
    const renderN = () => {
      const opts = nOpts();
      if (!opts.includes(st.n)) st.n = st.subject === ALL ? opts[0] : 20;
      const el = document.getElementById('nChips');
      el.innerHTML = opts.map(n => `<button class="chip" data-n="${n}" aria-pressed="${st.n === n}">${n === ALLN ? `${t('all')} <span class="muted small">(${avail()})</span>` : n}</button>`).join('');
      el.querySelectorAll('.chip').forEach(b => b.onclick = () => { st.n = +b.dataset.n; setPref(); el.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    };
    const st = prefs[ex] = Object.assign({ subject: E.subjects.find(s => subjCount(s) > 0) || E.subjects[0], n: 20, year: 'all', quick: 10 }, prefs[ex] || {});
    const samples = samplePapers(ex);
    const paperRow = p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}</div>
      <div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')}${p.date ? ' · ' + esc(p.kind === 'sample' ? p.date.replace(/\s*·\s*not NTA\s*$/, '') : p.date) : ''}</div></div>
      <button class="btn ${E.cls}" data-full="${p.id}">${t('start')}</button></div>`;
    app.innerHTML = `${active ? resumeCard() : ''}
      <a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>${E.name}</h1>
      <p class="muted small" style="margin-top:0">${t('marking')}: ${ex === 'neet' ? t('markingNeet') : t('markingJee')}</p>
      ${samples.length ? `<h2>${t('samplePapers')}</h2>
      <section class="card">${samples.map(paperRow).join('')}</section>` : ''}
      <h2>${t('fullMock')}</h2>
      <section class="card">${full.length ? full.map(paperRow).join('') : `<p class="muted">${t('comingSoon')}</p>`}</section>
      <h2>${t('subjectWise')}</h2>
      <section class="card"><p class="muted small" style="margin-top:0">${t('subjectWiseSub')}</p>
        <div class="label">${t('subject')}</div>
        <div class="chips" id="subjChips">${E.subjects.map(s => `<button class="chip" data-s="${s}" aria-pressed="${st.subject === s}" ${subjCount(s) ? '' : 'disabled'}>${s} <span class="muted small">(${subjCount(s)})</span></button>`).join('')}<button class="chip" data-s="${ALL}" aria-pressed="${st.subject === ALL}">${t('allSubjects')} <span class="muted small">(${allCount})</span></button></div>
        <div class="label">${t('year')}</div>
        <div class="chips" id="yearChips"><button class="chip" data-y="all" aria-pressed="${st.year === 'all'}">${t('allYears')}</button>${years.map(y => `<button class="chip" data-y="${y}" aria-pressed="${String(st.year) === String(y)}">${y}</button>`).join('')}</div>
        <div class="label">${t('howMany')}</div>
        <div class="chips" id="nChips"></div>
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
    renderN();
    app.querySelectorAll('#subjChips .chip').forEach(b => b.onclick = () => { st.subject = b.dataset.s; setPref(); app.querySelectorAll('#subjChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderN(); setPref(); });
    app.querySelectorAll('#yearChips .chip').forEach(b => b.onclick = () => { st.year = b.dataset.y; setPref(); app.querySelectorAll('#yearChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderN(); setPref(); });
    app.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
    document.getElementById('startSubj').onclick = () => startPractice(ex, st.subject, st.year, st.n);
    app.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => startPractice(ex, null, 'all', +b.dataset.quick));
  }
  /* ---------- CBSE Board ---------- */
  function viewCbse(cls) {
    const st = prefs.cbse = Object.assign({ cls: '10', subj: {} }, prefs.cbse || {});
    if (CBSE_CLASSES.includes(cls)) st.cls = cls;
    const C = st.cls;
    const ps = cbsePapers(C);
    const subjects = CBSE_SUBJECTS[C].filter(s => ps.some(p => p.subject === s)).concat([...new Set(ps.map(p => p.subject))].filter(s => !CBSE_SUBJECTS[C].includes(s)));
    if (!subjects.includes(st.subj[C])) st.subj[C] = subjects[0];
    const S = st.subj[C];
    setPrefCbse();
    const paperRow = p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}</div>
      <div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')}</div></div>
      <button class="btn cbse" data-full="${p.id}">${t('start')}</button></div>`;
    app.innerHTML = `${active ? resumeCard() : ''}
      <a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>CBSE Board</h1>
      <p class="muted small" style="margin-top:0">${t('marking')}: ${t('markingCbse')}</p>
      <div class="chips" role="tablist">${CBSE_CLASSES.map(c => `<a class="chip" role="tab" href="#/exam/cbse/${c}" aria-pressed="${c === C}" style="text-decoration:none;display:inline-flex;align-items:center;color:inherit">${t('cbseClass')} ${c}</a>`).join('')}</div>
      ${subjects.length ? `<h2>${t('subject')}</h2>
      <div class="chips" id="cbseSubj">${subjects.map(s => `<button class="chip" data-s="${esc(s)}" aria-pressed="${s === S}">${esc(s)}</button>`).join('')}</div>
      ${(() => { const mine = ps.filter(p => p.subject === S); const board = mine.filter(isBoard).sort((x, y) => (y.year - x.year) || String(x.title).localeCompare(String(y.title))); const sample = mine.filter(p => !isBoard(p));
        return (board.length ? `<h2>${t('cbseBoardPapers')}</h2><section class="card">${board.map(paperRow).join('')}</section>` : '') + (sample.length ? `<h2>${t('cbseSamplePapers')}</h2><section class="card">${sample.map(paperRow).join('')}</section>` : ''); })()}` : `<section class="card"><p class="muted">${t('cbseComingSoon')}</p></section>`}
      <h2>${t('pastAttempts')}</h2>
      <section class="card">${attemptsList('CBSE')}</section>
      <p class="note">${t('cbseSource')}</p>`;
    bindResume();
    app.querySelectorAll('#cbseSubj .chip').forEach(b => b.onclick = () => { st.subj[C] = b.dataset.s; setPrefCbse(); viewCbse(C); });
    app.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
  }
  function setPrefCbse() { save(LS.prefs, prefs); }
  function confirmReplace() { return !active || confirm(t('discardConfirm')); }
  async function startFull(id) {
    if (!confirmReplace()) return;
    const p = await loadPaper(id);
    const qs = p.questions.slice().sort((a, b) => a.qno - b.qno);
    begin({ title: p.shareTitle || p.title, exam: p.exam, mode: 'full', qs, durationSec: p.minutes * 60, rules: p.rules || {} });
  }
  async function startPractice(ex, subject, year, n) {
    if (!confirmReplace()) return;
    const E = EXAMS[ex];
    const ps = examPapers(ex).filter(p => year === 'all' || String(p.year) === String(year));
    await loadPapers(ps.map(p => p.id));
    let pool = [];
    const allSubj = subject === ALL;
    ps.forEach(p => papers[p.id].questions.forEach(q => { if (!subject || allSubj || q.subject === subject) pool.push(q); }));
    if (!pool.length) { toast(t('noQuestions')); return; }
    let qs;
    if (allSubj) { // all subjects: random pick, grouped in exam order (e.g. Physics → Chemistry → Biology)
      const o = s => E.subjects.indexOf(s);
      qs = shuffle(pool).slice(0, n).sort((a, b) => o(a.subject) - o(b.subject));
    } else if (subject) qs = shuffle(pool).slice(0, n);
    else { // quick test: balanced across subjects
      const by = {}; shuffle(pool).forEach(q => (by[q.subject] = by[q.subject] || []).push(q));
      const subs = Object.keys(by); qs = []; let i = 0;
      while (qs.length < n && subs.some(s => by[s].length)) { const s = subs[i++ % subs.length]; if (by[s].length) qs.push(by[s].pop()); }
      const o = s => E.subjects.indexOf(s); qs.sort((a, b) => o(a.subject) - o(b.subject));
    }
    const title = subject ? `${E.name} · ${allSubj ? t('allSubjects') : subject} · ${qs.length} Q` + (year !== 'all' ? ` · ${year}` : '') : `${E.name} · ${t('quick')} · ${qs.length} Q`;
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
    if (!active) return go('#/', true);
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
        opts = `<div class="opts grid4" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="${String(a) === String(k + 1)}" data-v="${k + 1}"><span class="k">${esc(optLabel(q, k))}</span><span class="ot">${t('option')} ${esc(optLabel(q, k))}</span></button>`).join('')}</div>`;
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
  // Ask before scoring or navigating. The name remains in this browser only.
  function askFullName() {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'sheet-bg mid';
      bg.innerHTML = `<form class="sheet center name-sheet" role="dialog" aria-modal="true" aria-labelledby="nameTitle">
        <h2 id="nameTitle">Enter your full name</h2>
        <label for="studentName">Full name</label>
        <input id="studentName" name="studentName" type="text" autocomplete="name" maxlength="40" required placeholder="e.g. Rahul Kumar">
        <p class="muted small">Your name is saved only on this device.</p>
        <button class="btn primary block" type="submit">Continue</button>
      </form>`;
      document.body.appendChild(bg);
      const field = bg.querySelector('input');
      field.value = (load(LS.name, '') || '').slice(0, 40);
      field.focus(); field.select();
      bg.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const fullName = field.value.trim().replace(/\s+/g, ' ').slice(0, 40);
        if (!fullName) { field.setCustomValidity('Please enter your full name'); field.reportValidity(); field.focus(); return; }
        save(LS.name, fullName);
        bg.remove(); resolve(fullName);
      };
      field.oninput = () => field.setCustomValidity('');
    });
  }
  let submitPending = false;
  async function finish(timeUp) {
    if (submitPending || !active) return;
    submitPending = true;
    clearInterval(timerInt); timerInt = null;
    const fullName = await askFullName();
    const qs = active.qids.map(qById);
    const r = PYQScoring.score(qs, active.answers, { marking: active.marking, rules: active.rules });
    const at = { id: active.id, title: active.title, exam: active.exam, mode: active.mode, qids: active.qids, answers: active.answers, marked: active.marked, paperIds: active.paperIds,
      rules: active.rules, marking: active.marking, startedAt: active.startedAt, finishedAt: Date.now(), durationSec: active.durationSec, timeTakenSec: Math.min(active.durationSec, Math.round(active.elapsedSec)),
      fullName, score: r.score, max: r.max, correct: r.correct, wrong: r.wrong, skipped: r.skipped + r.notCounted, accuracy: r.accuracy, bySubject: r.bySubject };
    const list = attempts(); list.unshift(at); save(LS.attempts, list.slice(0, 30));
    active = null; localStorage.removeItem(LS.active);
    submitPending = false;
    if (timeUp) setTimeout(() => toast(t('timeUp')), 300);
    go('#/result/' + at.id, true);
  }

  const SHARE_URL = 'https://sonexa.sites.tab.bot/';
  const shareText = (at, r) => `I scored ${r.score}/${r.max} in ${at.title} on SONEXA! Try it yourself: ${SHARE_URL}`;
  function splitCanvasLines(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/); let lines = [], line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      while (ctx.measureText(lines[maxLines - 1] + '…').width > maxWidth && lines[maxLines - 1].length > 1) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
      lines[maxLines - 1] += '…';
    }
    return lines;
  }
  async function resultImage(at, r) {
    const display = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const ui = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
    try { await document.fonts.load('600 100px "Baloo 2"', 'SONEXA 0123456789'); } catch (e) { /* fallback font */ }
    await document.fonts.ready;
    const W = 1080, H = 1920, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    const rr = (x, y, w, h, rad, fill) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, rad); else c.rect(x, y, w, h); c.fillStyle = fill; c.fill(); };
    const spaced = (txt, x, y, sp) => { if ('letterSpacing' in c) { c.letterSpacing = sp + 'px'; c.fillText(txt, x, y); c.letterSpacing = '0px'; } else c.fillText(txt, x, y); };
    c.fillStyle = '#F7F3FD'; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.10; c.fillStyle = '#FF7A1A'; c.beginPath(); c.arc(1010, 120, 230, 0, 7); c.fill();
    c.globalAlpha = 0.12; c.fillStyle = '#E0B23A'; c.beginPath(); c.arc(40, 1830, 260, 0, 7); c.fill(); c.globalAlpha = 1;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const logo = new Image(); logo.src = 'assets/wordmark.png?v=sx3';
    try { await logo.decode(); const lw = 520, lh = lw * logo.naturalHeight / logo.naturalWidth; c.drawImage(logo, (W - lw) / 2, 168, lw, lh); }
    catch (e) { c.font = '600 110px ' + display; c.fillStyle = '#3A1C71'; c.fillText('SONEXA', W / 2, 290); }
    c.font = '700 30px ' + ui; c.fillStyle = '#7A6F8E'; spaced(at.exam === 'CBSE' ? 'CBSE BOARD PRACTICE' : 'NEET · JEE PRACTICE', W / 2, 375, 6);
    // main card
    const cx = 70, cy = 450, cw = 940, ch = 1080;
    rr(cx, cy, cw, ch, 56, '#3A1C71');
    rr(W / 2 - 70, cy, 140, 10, 5, '#E0B23A');
    c.font = '700 30px ' + ui; c.fillStyle = '#E0B23A'; spaced('SCORECARD', W / 2, cy + 105, 8);
    const name = at.fullName || 'Student';
    let size = 96, lines;
    for (; size >= 52; size -= 4) { c.font = `600 ${size}px ${display}`; lines = splitCanvasLines(c, name, cw - 120, 2); if (lines.length === 1 || size <= 76 || splitCanvasLines(c, name, cw - 120, 1)[0] === name) { if (lines.every(l => c.measureText(l).width <= cw - 120) && !lines[lines.length - 1].endsWith('…')) break; } }
    c.font = `600 ${size}px ${display}`; lines = splitCanvasLines(c, name, cw - 120, 2);
    c.fillStyle = '#FFFFFF';
    let y = cy + 215; lines.forEach((l, i) => c.fillText(l, W / 2, y + i * size * 1.05)); y += (lines.length - 1) * size * 1.05;
    c.font = '600 38px ' + ui; c.fillStyle = '#D9CCF2';
    const tl = splitCanvasLines(c, at.title, cw - 120, 2); y += 75; tl.forEach((l, i) => c.fillText(l, W / 2, y + i * 50)); y += (tl.length - 1) * 50;
    y += 55; c.fillStyle = 'rgba(224,178,58,.55)'; c.fillRect(W / 2 - 180, y, 360, 3);
    // score
    const sc = String(r.score), mx = ' / ' + r.max;
    c.font = `600 250px ${display}`; const sw = c.measureText(sc).width;
    c.font = `600 86px ${display}`; const mw = c.measureText(mx).width;
    const by = cy + ch - 225, sx = W / 2 - (sw + mw) / 2, sy = Math.round((y + by) / 2 + 62);
    c.textAlign = 'left'; c.fillStyle = '#FFFFFF'; c.font = `600 250px ${display}`; c.fillText(sc, sx, sy);
    c.fillStyle = '#CDBBEF'; c.font = `600 86px ${display}`; c.fillText(mx, sx + sw, sy);
    c.textAlign = 'center'; c.font = '700 30px ' + ui; c.fillStyle = '#FF9A4D'; spaced('SCORE', W / 2, sy + 62, 8);
    // stats
    const st = [['Correct', r.correct, '#6EE7A8'], ['Wrong', r.wrong, '#FF9C8F'], ['Unattempted', r.skipped + r.notCounted, '#E4DAF7']];
    const bw = 262, gap = 24, bx0 = W / 2 - (bw * 3 + gap * 2) / 2;
    st.forEach(([lab, val, col], i) => {
      const bx = bx0 + i * (bw + gap); rr(bx, by, bw, 165, 28, 'rgba(255,255,255,.09)');
      c.fillStyle = col; c.font = `600 82px ${display}`; c.fillText(String(val), bx + bw / 2, by + 92);
      c.fillStyle = '#D9CCF2'; c.font = '600 28px ' + ui; c.fillText(lab, bx + bw / 2, by + 137);
    });
    // footer
    c.fillStyle = '#5B5170'; c.font = '600 34px ' + ui;
    c.fillText(new Date(at.finishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, cy + ch + 85);
    c.font = '700 34px ' + ui; c.fillStyle = '#FFFFFF';
    const cta = 'Try it yourself'; const ctw = c.measureText(cta).width + 90;
    rr(W / 2 - ctw / 2, 1680, ctw, 74, 37, '#FF7A1A'); c.fillStyle = '#FFFFFF'; c.fillText(cta, W / 2, 1729);
    c.fillStyle = '#3A1C71'; c.font = `600 54px ${display}`; c.fillText('sonexa.sites.tab.bot', W / 2, 1830);
    return new Promise((resolve, reject) => canvas.toBlob(bl => bl ? resolve(bl) : reject(new Error('PNG could not be created')), 'image/png'));
  }
  async function bindSharing(at, r) {
    const download = document.getElementById('downloadResult');
    const share = document.getElementById('shareResult');
    if (!download) return;
    let filePromise;
    const getFile = () => filePromise ||= resultImage(at, r).then(blob => new File([blob], 'sonexa-result.png', {type:'image/png'}));
    download.onclick = async () => {
      try { const file = await getFile(); const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href=url; a.download=file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
      catch(e) { toast('Could not download the image. Please try again.'); filePromise=null; }
    };
    if (navigator.share && navigator.canShare) {
      try {
        const file = await getFile();
        if (navigator.canShare({files:[file]})) {
          share.hidden = false;
          share.onclick = async () => { try { await navigator.share({files:[file], text:shareText(at,r), url:SHARE_URL}); } catch(e) { if (e.name !== 'AbortError') toast('Could not share. Download the image and try again.'); } };
        }
      } catch(e) { filePromise=null; }
    }
  }

  /* ---------- result & review ---------- */
  async function viewResult(id, reviewOnly) {
    const at = attempts().find(a => a.id === id);
    if (!at) return go('#/', true);
    if (!reviewOnly && !at.fullName) { // attempt saved before a name was given (e.g. page closed at the name step)
      at.fullName = await askFullName();
      const list = attempts(), saved = list.find(a => a.id === id); if (saved) { saved.fullName = at.fullName; save(LS.attempts, list); }
    }
    app.innerHTML = `<p class="loading">${t('loading')}</p>`;
    await loadPapers(at.paperIds.filter(meta));
    const qs = at.qids.map(qById).filter(Boolean);
    const r = PYQScoring.score(qs, at.answers, { marking: at.marking, rules: at.rules });
    const ex = at.exam === 'NEET' ? 'neet' : at.exam === 'CBSE' ? 'cbse' : 'jee';
    const subRows = Object.entries(r.bySubject).map(([s, v]) => `<tr><td>${s}</td><td>${v.attempted}/${v.total}</td><td style="color:var(--ok)">${v.correct}</td><td style="color:var(--bad)">${v.wrong}</td><td><b>${v.score}</b>/${v.max}</td></tr>`).join('');
    let filter = 'all';
    app.innerHTML = `<a href="#/exam/${ex}" class="backbtn">← ${t('back')}</a>
      <h1>${t('result')}</h1><p class="muted small" style="margin-top:0">${esc(at.title)} · ${fmtDate(at.finishedAt)}</p>
      <section class="card"><div class="bigscore">${at.fullName ? `<div class="result-name">${esc(at.fullName)}</div>` : ''}<div class="n">${r.score}<span class="d" style="font-size:1.2rem"> / ${r.max}</span></div><div class="d">${t('score')}</div></div>
        <div class="stats"><div class="stat ok"><b>${r.correct}</b>${t('correct')}</div><div class="stat bad"><b>${r.wrong}</b>${t('wrong')}</div><div class="stat"><b>${r.skipped + r.notCounted}</b>${t('skipped')}</div></div>
        <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b>${r.accuracy}%</b>${t('accuracy')}</div><div class="stat"><b>${fmtDur(at.timeTakenSec)}</b>${t('timeTaken')}</div></div>
      </section>
      <div class="share-actions"><button type="button" class="btn primary" id="shareResult" hidden>Share</button><a class="btn" id="waResult" target="_blank" rel="noopener noreferrer" href="${'https://wa.me/?text=' + encodeURIComponent(shareText(at, r))}">WhatsApp</a><a class="btn" id="fbResult" target="_blank" rel="noopener noreferrer" href="${'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SHARE_URL)}">Facebook</a><button type="button" class="btn" id="downloadResult">Download image</button></div>
      <p class="muted small share-hint">For Instagram Story: tap Share, or download the image and add it to your story.</p>
      <h2>${t('subjectBreakdown')}</h2>
      <section class="card" style="overflow-x:auto"><table><thead><tr><th>${t('subject')}</th><th>${t('attempted')}</th><th>${t('correct')}</th><th>${t('wrong')}</th><th>${t('score')}</th></tr></thead><tbody>${subRows}</tbody></table></section>
      <div class="row"><button class="btn" id="retake" style="flex:1">${t('retake')}</button><a class="btn" href="#/exam/${ex}" style="flex:1">${t('home')}</a></div>
      <h2 id="reviewHead">${t('reviewAnswers')}</h2>
      <div class="chips" id="rf">${['all', 'wrong', 'skipped', 'correct'].map(f => `<button class="chip" data-f="${f}" aria-pressed="${f === 'all'}">${t(f)} (${f === 'all' ? qs.length : qs.filter(q => (r.perQ[q.id] === f) || (f === 'skipped' && r.perQ[q.id] === 'not-counted')).length})</button>`).join('')}</div>
      <div id="rlist"></div>`;
    bindSharing(at, r);
    const ansLabel = (q, v) => v == null || v === '' ? `<span class="muted">${t('notAttempted')}</span>` : (q.type === 'numerical' ? esc(v) : `(${esc(optLabels(q) ? optLabel(q, Number(v) - 1) : v)})`);
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
