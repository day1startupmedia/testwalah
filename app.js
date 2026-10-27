/* SONEXA — single-page app. No backend; everything is saved in this browser (localStorage). */
(function () {
  'use strict';
  const IN_APP = /SonexaApp/i.test(navigator.userAgent || '');
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
  const LS = { active: 'pyq.v1.active', attempts: 'pyq.v1.attempts', lang: 'pyq.v1.lang', qlang: 'sonexa.v1.qlang', offline: 'sonexa.v1.offline', prefs: 'pyq.v1.prefs', name: 'sonexa.v1.fullName' };
  const EXAMS = {
    neet: { key: 'neet', name: 'NEET', exam: 'NEET', subjects: ['Physics', 'Chemistry', 'Biology'], cls: 'neet', minPerQ: 1 },
    jee: { key: 'jee', name: 'JEE Main', exam: 'JEE Main', subjects: ['Physics', 'Chemistry', 'Maths'], cls: 'jee', minPerQ: 2 },
    jeeadv: { key: 'jeeadv', name: 'JEE Advanced', exam: 'JEE Advanced', subjects: ['Physics', 'Chemistry', 'Maths'], cls: 'jeeadv', minPerQ: 3 },
    nda: { key: 'nda', name: 'NDA', exam: 'NDA', subjects: ['Maths', 'English', 'General Knowledge'], cls: 'nda', minPerQ: 1.25 },
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
  // Question language (EN | हिंदी). Hindi = crops of the official Hindi version of the same paper; English is always the fallback.
  let qlang = (function () { try { return localStorage.getItem(LS.qlang) === 'hi' ? 'hi' : 'en'; } catch (e) { return 'en'; } })();
  const setQlang = v => { qlang = v === 'hi' ? 'hi' : 'en'; try { localStorage.setItem(LS.qlang, qlang); } catch (e) { /* ignore */ } };
  const paperHasHi = id => { const m = meta(id); return !!(m && m.langs && m.langs.indexOf('hi') >= 0); };
  const qHasHi = q => !!(q.imageHi || q.questionHi);
  const qImg = q => (qlang === 'hi' && q.imageHi) ? q.imageHi : q.image;
  const qTxt = q => (qlang === 'hi' && q.questionHi) ? q.questionHi : q.question;
  const qlangToggle = () => `<div class="qlang" role="group" aria-label="Question language"><button type="button" data-ql="en" aria-pressed="${qlang === 'en'}">EN</button><button type="button" data-ql="hi" aria-pressed="${qlang === 'hi'}" lang="hi">हिंदी</button></div>`;
  const qlangNote = q => (qlang === 'hi' && paperHasHi(q.paperId) && !qHasHi(q)) ? `<p class="hi-na">${q.exam === 'NDA' && q.subject === 'English' ? 'English section · no Hindi version' : 'Hindi not available · showing English'}</p>` : '';
  const bindQlang = (root, cb) => root.querySelectorAll('.qlang button').forEach(b => b.onclick = () => { setQlang(b.dataset.ql); cb(); });
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
      const s = document.createElement('script'); s.src = meta(id).file; s.onerror = () => { const w = waiting[id] || []; delete waiting[id]; s.remove(); rej(new Error('load ' + id)); w.length = 0; }; document.body.appendChild(s);
    });
  }
  const loadPapers = ids => Promise.all(ids.map(loadPaper));

  /* ---------- offline ---------- */
  // "Save offline" puts one paper (its data file + every question image, EN and HI) into its own cache (sx-paper-<id>);
  // sw.js serves those when there is no internet. Nothing is downloaded unless the student taps Save offline.
  const CAN_OFF = 'caches' in window && 'serviceWorker' in navigator && window.isSecureContext;
  const offList = () => load(LS.offline, {});
  const isSaved = id => !!offList()[id];
  const isOnline = () => navigator.onLine !== false;
  const offBusy = {};
  const absUrl = u => new URL(u, location.href).href.replace(/[?#].*$/, '');
  function paperUrls(p) {
    const m = meta(p.id) || {}; const u = new Set([absUrl(m.file || ('data/' + p.id + '.js')), absUrl('data/' + p.id + '.json')]);
    p.questions.forEach(q => { if (q.image) u.add(absUrl(q.image)); if (q.imageHi) u.add(absUrl(q.imageHi)); });
    return [...u];
  }
  async function saveOffline(id, onProg) {
    if (!CAN_OFF || offBusy[id]) return false;
    offBusy[id] = true;
    try {
      const p = await loadPaper(id); const urls = paperUrls(p); const c = await caches.open('sx-paper-' + id);
      let done = 0, bytes = 0, failed = 0; onProg(0, urls.length);
      const queue = urls.slice();
      const worker = async () => { while (queue.length) { const u = queue.shift();
        try { if (!(await c.match(u))) { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); const b = await r.clone().blob(); bytes += b.size; await c.put(u, r); } }
        catch (e) { failed++; }
        onProg(++done, urls.length); } };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      if (failed) { toast(`Couldn't save ${failed} file(s). Check your internet and tap Save offline again.`); return false; }
      const l = offList(); l[id] = { n: urls.length, mb: Math.round(bytes / 1e5) / 10, at: Date.now() }; save(LS.offline, l);
      return true;
    } catch (e) { toast('Saving needs internet. Try again when you are online.'); return false; }
    finally { delete offBusy[id]; }
  }
  async function removeOffline(id) { try { await caches.delete('sx-paper-' + id); } catch (e) { /* ignore */ } const l = offList(); delete l[id]; save(LS.offline, l); }
  // keep the list honest if the phone cleared site storage
  if (CAN_OFF) caches.keys().then(keys => { const l = offList(); let ch = false; Object.keys(l).forEach(id => { if (!keys.includes('sx-paper-' + id) || !meta(id)) { delete l[id]; ch = true; } }); if (ch) save(LS.offline, l); }).catch(() => {});
  const offCtl = p => !CAN_OFF ? '' : isSaved(p.id)
    ? `<span class="offctl saved" data-offwrap="${esc(p.id)}"><span class="offok">✓ Saved offline</span><button type="button" class="offrm" data-offrm="${esc(p.id)}">Remove</button></span>`
    : `<span class="offctl" data-offwrap="${esc(p.id)}"><button type="button" class="offsave" data-offsave="${esc(p.id)}"${isOnline() ? '' : ' disabled'}>⬇ Save offline</button></span>`;
  const startBtn = (p, cls) => (!isOnline() && !isSaved(p.id))
    ? `<button class="btn needs-net" type="button" disabled title="Save this paper offline when you have internet">Needs internet</button>`
    : `<button class="btn ${cls}" data-full="${p.id}">${t('start')}</button>`;
  function bindOffline(root, rerender) {
    root.querySelectorAll('[data-offsave]').forEach(b => b.onclick = async () => {
      const id = b.dataset.offsave, wrap = b.parentNode;
      wrap.innerHTML = `<span class="offprog" role="progressbar" aria-label="Saving offline" aria-valuemin="0" aria-valuemax="100"><i></i></span><span class="offpct">0%</span>`;
      const bar = wrap.querySelector('i'), pct = wrap.querySelector('.offpct'), pb = wrap.querySelector('.offprog');
      const ok = await saveOffline(id, (d, n) => { const v = n ? Math.round(d * 100 / n) : 0; bar.style.width = v + '%'; pct.textContent = v + '%'; pb.setAttribute('aria-valuenow', v); });
      if (ok) toast('Saved offline ✓ This paper now works without internet.');
      rerender();
    });
    root.querySelectorAll('[data-offrm]').forEach(b => b.onclick = async () => { await removeOffline(b.dataset.offrm); toast('Removed from offline'); rerender(); });
  }
  function offPill() { const el = document.getElementById('offPill'); if (el) el.hidden = isOnline(); }
  window.addEventListener('online', () => { offPill(); if (!document.body.classList.contains('testing')) route(); });
  window.addEventListener('offline', () => { offPill(); if (!document.body.classList.contains('testing')) route(); });
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
    try { if (window.sxCount) window.sxCount(); } catch (e) {}
    document.querySelectorAll('.ch-sheet').forEach(s => s.parentNode && s.parentNode.remove());
    clearInterval(timerInt); timerInt = null;
    document.body.classList.remove('testing');
    const hq = location.hash.replace(/^#\/?/, '');
    const qi = hq.indexOf('?');
    const h = qi < 0 ? hq : hq.slice(0, qi), query = qi < 0 ? '' : hq.slice(qi + 1);
    const [a, b] = h.split('/');
    window.scrollTo(0, 0);
    try { bnavRender(a); } catch (e) { /* ignore */ }
    if (a === 'challenge' && b) return viewChallengeLink(decodeURIComponent(b), query);
    if (a === 'vs' && b) return viewVs(decodeURIComponent(h.slice(3)));
    if (a === 'exam' && b === 'cbse') return viewCbse(h.split('/')[2]);
    if (a === 'exam' && EXAMS[b]) return viewExam(b);
    if (a === 'test') return viewTest();
    if (a === 'result' && b) return viewResult(b, false);
    if (a === 'review' && b) return viewResult(b, true);
    if (a === 'page' && PAGES()[b]) return viewPage(b);
    if (a === 'mistakes') return viewMistakes();
    if (a === 'daily') return viewDaily();
    if (a === 'chapters') { const ck = new URLSearchParams(query).get('k'); if (ck) { const s2 = load(LS_CHAP, {}); s2.k = ck; save(LS_CHAP, s2); } return viewChapters(); }
    if (a === 'search') { const sq = new URLSearchParams(query).get('q'); if (sq) { srState.q = sq; srState.sub = ''; } return viewSearch(); }
    if (a === 'start' && b) return sxDeepStart(decodeURIComponent(b));
    if (a === 'practice' && b) { const pp = h.split('/').slice(1).map(x => decodeURIComponent(x || '')); return sxDeepPractice(pp[0], pp[1], pp[2] || null, pp[3]); }
    if (a === 'q' && b) return viewQ(decodeURIComponent(b), h.split('/')[2]);
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
  document.addEventListener('click', e => { const f = e.target.closest && e.target.closest('[data-fbopen]'); if (f) { e.preventDefault(); fbOpen({ kind: 'general' }); } });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('a.backbtn:not([data-direct])'); if (!b) return;
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
    return `<footer class="site-foot"><div><button type="button" class="fb-foot" data-fbopen>💬 Feedback</button></div><nav>${PAGE_ORDER.filter(k => P[k]).map(k => `<a href="#/page/${k}">${esc(P[k].link)}</a>`).join('<span aria-hidden="true"> · </span>')}</nav>${IN_APP ? '' : `<div><a href="app/">📱 Get the app</a></div>`}<div>${contactLink()}</div><div>${esc(t('footerCopy'))}</div></footer>`;
  }
  function contactLink() { const m = t('contactEmail'); return `${esc(t('contactLabel'))}: <a class="mail" href="mailto:${esc(m)}">${esc(m)}</a>`; }
  function viewPage(k) {
    const P = PAGES()[k];
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>${esc(P.title)}</h1>
      ${P.story && P.story.length ? `<section class="card story-card"><h2>${esc(P.storyTitle || '')}</h2>${P.story.map((x, i) => `<p${i === 0 ? ' class="story-lead"' : (i === P.story.length - 1 ? ' class="story-sign"' : '')}>${esc(x)}</p>`).join('')}</section>` : ''}
      <section class="card info-page">${P.body.map(x => `<p>${esc(x)}</p>`).join('')}<p class="muted">${contactLink()}</p></section>
      ${siteFooter()}`;
  }
  function savedSection() {
    if (isOnline() || !CAN_OFF) return '';
    const ids = Object.keys(offList()).filter(id => meta(id));
    if (!ids.length) return `<section class="card off-card"><b>You're offline.</b><p class="small" style="margin:4px 0 0">Papers you save with ⬇ Save offline work without internet. Your past results below still open.</p></section>`;
    const exCls = e => e === 'NEET' ? 'neet' : e === 'CBSE' ? 'cbse' : e === 'JEE Advanced' ? 'jeeadv' : e === 'NDA' ? 'nda' : 'jee';
    return `<h2>Saved offline</h2><section class="card off-card">${ids.map(meta).map(p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}</div><div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')} · ✓ works offline</div></div><button class="btn ${exCls(p.exam)}" data-full="${p.id}">${t('start')}</button></div>`).join('')}</section>`;
  }
  function viewHome() {
    app.innerHTML = `${srHomeBar()}<div class="home-rest">${resumeCard()}
      ${savedSection()}
      <h1>${t('chooseExam')}</h1>
      <p class="lead">${t('tagline')}</p>
      <div class="exam-cards">
        <a class="exam-card neet" href="#/exam/neet"><span class="name">NEET</span><span class="sub">${t('neetSub')}</span><span class="count">${countFor('neet')} ${t('questions')}</span></a>
        <a class="exam-card jee" href="#/exam/jee"><span class="name">JEE Main</span><span class="sub">${t('jeeSub')}</span><span class="count">${countFor('jee')} ${t('questions')}</span></a>
        <a class="exam-card jeeadv" href="#/exam/jeeadv"><span class="name">JEE Advanced</span><span class="sub">${t('jeeAdvSub')}</span><span class="count">${countFor('jeeadv')} ${t('questions')}</span></a>
        <a class="exam-card cbse" href="#/exam/cbse"><span class="name">CBSE Board</span><span class="sub">${t('cbseSub')}</span><span class="count">${cbsePapers().reduce((n, p) => n + p.count, 0)} ${t('questions')}</span></a>
        <a class="exam-card nda" href="#/exam/nda"><span class="name">NDA</span><span class="sub">${t('ndaSub')}</span><span class="count">${countFor('nda')} ${t('questions')}</span></a>
      </div>
      <div class="tool-cards">${sxToolCards()}</div>
      ${IN_APP ? '' : IS_IOS ? `<a class="app-card" href="app/#ios"><span class="app-ico" aria-hidden="true">📱</span><span><span class="app-title">Add SONEXA to your Home Screen</span><span class="app-note">iPhone: Safari → Share → Add to Home Screen</span></span></a>` : `<a class="app-card" href="app/SONEXA.apk" download="SONEXA.apk" type="application/vnd.android.package-archive"><span class="app-ico" aria-hidden="true">📱</span><span><span class="app-title">Install SONEXA App (Android)</span><span class="app-note">Android only · allow 'Install unknown apps' when asked</span></span></a>`}
      <h2>${t('pastAttempts')}</h2>
      <section class="card">${attemptsList()}</section>
      <section class="card seo-intro"><h2 style="margin-top:0">Free previous year papers with answer key</h2>
        <p class="small">SONEXA has free online mock tests from real previous year question papers: <a href="neet/">NEET</a>, <a href="jee-main/">JEE Main</a>, <a href="jee-advanced/">JEE Advanced</a>, <a href="cbse-class-10/">CBSE Class 10</a>, <a href="cbse-class-12/">CBSE Class 12</a> and <a href="nda/">NDA</a> — ${INDEX.length} papers and ${INDEX.reduce((n, p) => n + p.count, 0).toLocaleString('en-IN')} questions, each with the official answer key and marking scheme. Practise full papers, chapter-wise questions or the Daily 10, see your score and review every answer. NEET 2020 and NDA papers also show the official <a href="hindi/">Hindi version</a>. No login, works offline, and there is an <a href="app/">Android app</a>.</p></section>
      <h2>${t('aboutTitle')}</h2>
      <p class="note">${t('about')}</p>
      <p class="note">${t('jeeAdvSource')}</p>
      <p class="note">${t('cbseSource')}</p>
      <p class="note">${t('ndaSource')}</p>
      ${siteFooter()}</div>`;
    bindResume();
    srBind('home');
    app.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
  }

  /* ---------- exam page ---------- */
  const prefs = load(LS.prefs, {});
  function viewExam(ex) {
    const E = EXAMS[ex];
    const ps = examPapers(ex);
    const full = ps.filter(p => p.kind !== 'bank');
    if (ex === 'jeeadv') full.sort((x, y) => (y.year - x.year) || String(x.title).localeCompare(String(y.title)));
    if (ex === 'nda') { const sit = p => /\(II\)/.test(p.title) ? 2 : /\(I\)/.test(p.title) ? 1 : 0; full.sort((x, y) => (y.year - x.year) || (sit(y) - sit(x)) || String(x.title).localeCompare(String(y.title))); }
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
    const paperRow = p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}${p.langs && p.langs.indexOf('hi') >= 0 ? ' <span class="badge hi-badge" lang="hi" title="Also in Hindi">हिंदी</span>' : ''}</div>
      <div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')}${p.date && ex !== 'jeeadv' && ex !== 'nda' ? ' · ' + esc(p.kind === 'sample' ? p.date.replace(/\s*·\s*not NTA\s*$/, '') : p.date) : ''}</div>
      <div class="prow-actions"><button type="button" class="chlink" data-ch="${esc(p.id)}">⚔ ${CH.btn}</button>${offCtl(p)}</div></div>
      ${startBtn(p, E.cls)}</div>`;
    app.innerHTML = `${active ? resumeCard() : ''}
      <a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>${E.name}</h1>
      <p class="muted small" style="margin-top:0">${t('marking')}: ${ex === 'neet' ? t('markingNeet') : ex === 'jeeadv' ? t('markingJeeAdv') : ex === 'nda' ? t('markingNda') : t('markingJee')}</p>
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
      <p class="note">${ex === 'jeeadv' ? t('jeeAdvSource') : ex === 'nda' ? t('ndaSource') : t('about')}</p>`;
    bindResume();
    const setPref = () => save(LS.prefs, prefs);
    renderN();
    app.querySelectorAll('#subjChips .chip').forEach(b => b.onclick = () => { st.subject = b.dataset.s; setPref(); app.querySelectorAll('#subjChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderN(); setPref(); });
    app.querySelectorAll('#yearChips .chip').forEach(b => b.onclick = () => { st.year = b.dataset.y; setPref(); app.querySelectorAll('#yearChips .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderN(); setPref(); });
    app.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
    app.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => challengeFromPaper(b.dataset.ch));
    bindOffline(app, () => { const y = window.scrollY; viewExam(ex); window.scrollTo(0, y); });
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
    const paperRow = p => `<div class="paper"><div><div style="font-weight:700">${esc(p.title)}${p.langs && p.langs.indexOf('hi') >= 0 ? ' <span class="badge hi-badge" lang="hi" title="Also in Hindi">हिंदी</span>' : ''}</div>
      <div class="meta">${p.count} ${t('questions')} · ${p.minutes} ${t('min')}</div>
      <div class="prow-actions"><button type="button" class="chlink" data-ch="${esc(p.id)}">⚔ ${CH.btn}</button>${offCtl(p)}</div></div>
      ${startBtn(p, 'cbse')}</div>`;
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
    app.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => challengeFromPaper(b.dataset.ch));
    bindOffline(app, () => { const y = window.scrollY; viewCbse(C); window.scrollTo(0, y); });
  }
  function setPrefCbse() { save(LS.prefs, prefs); }
  function confirmReplace() { return !active || confirm(t('discardConfirm')); }
  async function startFull(id, challenge) {
    if (!confirmReplace()) return false;
    let p;
    try { p = await loadPaper(id); } catch (e) { toast(isOnline() ? 'Could not load this paper. Please try again.' : 'This paper needs internet. Save it offline next time you are online.'); return false; }
    const qs = paperQs(p);
    begin({ title: p.shareTitle || p.title, exam: p.exam, mode: 'full', qs, durationSec: p.minutes * 60, rules: p.rules || {}, paper: id, challenge: challenge || null });
    return true;
  }
  async function startPractice(ex, subject, year, n) {
    if (!confirmReplace()) return;
    const E = EXAMS[ex];
    const ps = examPapers(ex).filter(p => year === 'all' || String(p.year) === String(year));
    const got = await Promise.allSettled(ps.map(p => loadPaper(p.id)));
    if (!got.some(g => g.status === 'fulfilled')) { toast(isOnline() ? 'Could not load questions. Please try again.' : 'Needs internet. Saved offline papers still work from the paper list.'); return; }
    let pool = [];
    const allSubj = subject === ALL;
    ps.filter(p => papers[p.id]).forEach(p => papers[p.id].questions.forEach(q => { if (!subject || allSubj || q.subject === subject) pool.push(q); }));
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
      durationSec: o.durationSec, elapsedSec: 0, startedAt: Date.now(), answers: {}, marked: {}, visited: {}, cur: 0, rules: o.rules, marking,
      paper: o.paper || null, challenge: o.challenge || null, extra: o.extra || null };
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
    const showQl = active.paperIds.some(paperHasHi);
    app.innerHTML = `<div class="tbar"><div class="ttl">${esc(active.title)}</div><div class="timer" id="timer" aria-label="Time left">--:--</div><button class="btn primary" id="submitTop">${t('submit')}</button></div>
      ${subs.length > 1 ? `<nav class="subtabs" id="subtabs" aria-label="Subjects">${subs.map(s => `<button data-s="${s}">${s}</button>`).join('')}</nav>` : ''}
      <section class="qwrap" id="qwrap" aria-live="polite"></section>
      <div class="bbar"><div class="inner"><button class="btn" id="prevBtn">‹ ${t('prev')}</button><button class="btn" id="palBtn">▦ ${t('palette')}</button><button class="btn primary" id="nextBtn">${t('next')} ›</button></div>
      <div class="row2${active.paper ? ' has3' : ''}"><button class="btn" id="clearBtn">${t('clear')}</button><button class="btn" id="markBtn">⚑ ${t('review')}</button>${active.paper ? `<button class="btn chtest" id="chBtn">⚔ ${CH.btnShort}</button>` : ''}</div></div>`;
    const qwrap = document.getElementById('qwrap');
    const persist = () => save(LS.active, active);
    function isAns(id) { const v = active.answers[id]; return v !== undefined && v !== null && String(v).trim() !== ''; }
    function sectionBCount(q) { return qs.filter(x => x.part === 'B' && x.paperId === q.paperId && (x.section || x.subject) === (q.section || q.subject) && isAns(x.id)).length; }
    function render() {
      const i = active.cur, q = qs[i];
      active.visited[q.id] = 1; persist();
      const a = active.answers[q.id];
      const src = `${esc(q.paper)} · Q${q.exam === 'NDA' && q.srcQno ? q.srcQno : q.qno}`;
      let opts = '';
      if (q.type === 'numerical') {
        opts = `<div class="numin"><input id="numIn" inputmode="decimal" autocomplete="off" placeholder="${t('enterAnswer')}" aria-label="${t('enterAnswer')}" value="${a != null ? esc(a) : ''}"></div><p class="muted small">${t('numericalHint')}</p>`;
      } else if (q.optionsInImage) {
        opts = `<div class="opts grid4" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="${String(a) === String(k + 1)}" data-v="${k + 1}"><span class="k">${esc(optLabel(q, k))}</span><span class="ot">${t('option')} ${esc(optLabel(q, k))}</span></button>`).join('')}</div>`;
      } else {
        opts = `<div class="opts" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="${String(a) === String(k + 1)}" data-v="${k + 1}"><span class="k">${k + 1}</span><span class="ot">${fmtText(o)}</span></button>`).join('')}</div>`;
      }
      const secnote = (active.rules.sectionBAttemptMax && q.part === 'B') ? `<p class="secnote">${q.section || q.subject} · ${t('sectionB')} (${sectionBCount(q)}/10)</p>` : '';
      qwrap.innerHTML = `<div class="qhead"><div><div class="qnum">${t('q')} ${i + 1} <span class="muted small">${t('of')} ${qs.length}</span></div><div class="qsrc">${q.subject}${q.section && q.section !== q.subject && q.exam !== 'NDA' ? ' · ' + (/^\d+$/.test(q.section) ? 'Section ' + q.section : q.section) : ''} · ${src}</div></div>
        <button class="flag" id="flagBtn" aria-pressed="${!!active.marked[q.id]}">⚑ ${active.marked[q.id] ? t('marked') : t('mark')}</button></div>
        ${secnote}
        ${showQl ? `<div class="qlang-row">${qlangToggle()}</div>${qlangNote(q)}` : ''}
        <div class="qbody">${qImg(q) ? `<img src="${qImg(q)}" alt="Question ${i + 1}" id="qimg">` : ''}${qTxt(q) ? `<div class="qtext"${qlang === 'hi' && q.questionHi ? ' lang="hi"' : ''}>${fmtText(qTxt(q))}</div>` : ''}</div>
        ${opts}
        <button type="button" class="fb-q" id="fbQ">⚑ Report a problem with this question</button>`;
      math(qwrap);
      document.getElementById('fbQ').onclick = () => fbOpen({ kind: 'question', pid: q.paperId, qno: q.exam === 'NDA' && q.srcQno ? q.srcQno : q.qno, title: q.paper });
      qwrap.querySelectorAll('.opt').forEach(b => b.onclick = () => choose(q, b.dataset.v));
      const ni = document.getElementById('numIn');
      if (ni) ni.oninput = () => { const v = ni.value.trim(); if (v === '') delete active.answers[q.id]; else active.answers[q.id] = v; persist(); };
      const img = document.getElementById('qimg'); if (img) img.onclick = () => zoom(qImg(q));
      if (showQl) bindQlang(qwrap, render);
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
    const chB = document.getElementById('chBtn'); if (chB) chB.onclick = () => challengeFromTest();
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
      fullName, score: r.score, max: r.max, correct: r.correct, wrong: r.wrong, skipped: r.skipped + r.notCounted, accuracy: r.accuracy, bySubject: r.bySubject,
      paper: active.paper || null, challenge: active.challenge || null, extra: active.extra || null };
    try { sxAfterFinish(at, qs, r); } catch (e) { /* practice tools must never block a result */ }
    const list = attempts(); list.unshift(at); save(LS.attempts, list.slice(0, 30));
    active = null; localStorage.removeItem(LS.active);
    submitPending = false;
    if (timeUp) setTimeout(() => toast(t('timeUp')), 300);
    const rec = at.paper && at.challenge ? chRecordFinish(at, qs, r) : null;
    if (rec && rec.opp) return go('#/vs/' + chKey(at.paper, rec.c), true);
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
    c.font = '700 30px ' + ui; c.fillStyle = '#7A6F8E'; spaced(at.exam === 'CBSE' ? 'CBSE BOARD PRACTICE' : at.exam === 'NDA' ? 'NDA PRACTICE' : 'NEET · JEE PRACTICE', W / 2, 375, 6);
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
    const ex = at.exam === 'NEET' ? 'neet' : at.exam === 'CBSE' ? 'cbse' : at.exam === 'JEE Advanced' ? 'jeeadv' : at.exam === 'NDA' ? 'nda' : 'jee';
    const subRows = Object.entries(r.bySubject).map(([s, v]) => `<tr><td>${s}</td><td>${v.attempted}/${v.total}</td><td style="color:var(--ok)">${v.correct}</td><td style="color:var(--bad)">${v.wrong}</td><td><b>${v.score}</b>/${v.max}</td></tr>`).join('');
    let filter = 'all';
    const showQl = [...new Set(qs.map(q => q.paperId))].some(paperHasHi);
    app.innerHTML = `<a href="${sxBack(at, ex)}" class="backbtn">← ${t('back')}</a>
      <h1>${t('result')}</h1><p class="muted small" style="margin-top:0">${esc(at.title)} · ${fmtDate(at.finishedAt)}</p>
      <section class="card"><div class="bigscore">${at.fullName ? `<div class="result-name">${esc(at.fullName)}</div>` : ''}<div class="n">${r.score}<span class="d" style="font-size:1.2rem"> / ${r.max}</span></div><div class="d">${t('score')}</div></div>
        <div class="stats"><div class="stat ok"><b>${r.correct}</b>${t('correct')}</div><div class="stat bad"><b>${r.wrong}</b>${t('wrong')}</div><div class="stat"><b>${r.skipped + r.notCounted}</b>${t('skipped')}</div></div>
        <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b>${r.accuracy}%</b>${t('accuracy')}</div><div class="stat"><b>${fmtDur(at.timeTakenSec)}</b>${t('timeTaken')}</div></div>
      </section>
      ${chResultCard(at)}
      ${sxModeCard(at, r)}
      <button type="button" class="fb-test" id="fbTest"><span>💬 How was this test?</span><span class="fb-test-go">Give feedback ›</span></button>
      <div class="share-actions"><button type="button" class="btn primary" id="shareResult" hidden>Share</button><a class="btn" id="waResult" target="_blank" rel="noopener noreferrer" href="${'https://wa.me/?text=' + encodeURIComponent(shareText(at, r))}">WhatsApp</a><a class="btn" id="fbResult" target="_blank" rel="noopener noreferrer" href="${'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SHARE_URL)}">Facebook</a><button type="button" class="btn" id="downloadResult">Download image</button></div>
      <p class="muted small share-hint">For Instagram Story: tap Share, or download the image and add it to your story.</p>
      <h2>${t('subjectBreakdown')}</h2>
      <section class="card" style="overflow-x:auto"><table><thead><tr><th>${t('subject')}</th><th>${t('attempted')}</th><th>${t('correct')}</th><th>${t('wrong')}</th><th>${t('score')}</th></tr></thead><tbody>${subRows}</tbody></table></section>
      <div class="row"><button class="btn" id="retake" style="flex:1">${t('retake')}</button><a class="btn" href="${sxBack(at, ex)}" style="flex:1">${t('home')}</a></div>
      <h2 id="reviewHead">${t('reviewAnswers')}</h2>
      ${showQl ? `<div class="qlang-row review"><span class="small muted">Question language</span>${qlangToggle()}</div>` : ''}
      <div class="chips" id="rf">${['all', 'wrong', 'skipped', 'correct'].map(f => `<button class="chip" data-f="${f}" aria-pressed="${f === 'all'}">${t(f)} (${f === 'all' ? qs.length : qs.filter(q => (r.perQ[q.id] === f) || (f === 'skipped' && r.perQ[q.id] === 'not-counted')).length})</button>`).join('')}</div>
      <div id="rlist"></div>`;
    bindSharing(at, r);
    bindChResultCard(at, qs, r);
    try { sxBindModeCard(at); } catch (e) { /* ignore */ }
    document.getElementById('fbTest').onclick = () => fbOpen({ kind: 'test', pid: at.paper || (at.paperIds || [])[0], title: at.title, score: `${r.score}/${r.max}` });
    const ansLabel = (q, v) => v == null || v === '' ? `<span class="muted">${t('notAttempted')}</span>` : (q.type === 'numerical' ? esc(v) : `(${esc(optLabels(q) ? optLabel(q, Number(v) - 1) : v)})`);
    function renderList() {
      const list = qs.map((q, i) => ({ q, i })).filter(({ q }) => filter === 'all' || r.perQ[q.id] === filter || (filter === 'skipped' && r.perQ[q.id] === 'not-counted'));
      const el = document.getElementById('rlist');
      el.innerHTML = list.map(({ q, i }) => {
        const st = r.perQ[q.id]; const a = at.answers[q.id];
        const key = (meta(q.paperId) || {}).answerKey || {};
        const optList = (!q.optionsInImage && q.type === 'mcq') ? `<ol class="small" style="padding-left:22px;margin:8px 0 0">${q.options.map((o, k) => `<li style="${q.answer.includes(String(k + 1)) ? 'color:var(--ok);font-weight:700' : (String(a) === String(k + 1) ? 'color:var(--bad)' : '')}">${fmtText(o)}</li>`).join('')}</ol>` : '';
        return `<article class="card rq ${st}"><div class="row spread"><div class="qnum">${t('q')} ${i + 1} <span class="qsrc">${q.subject} · ${esc(q.paper)} · Q${q.qno}</span></div><span class="verdict ${st}">${st === 'not-counted' ? t('skipped') : t(st)}</span></div>
          ${showQl ? qlangNote(q) : ''}<div class="qbody" style="margin-top:8px">${qImg(q) ? `<img src="${qImg(q)}" alt="Question ${i + 1}" loading="lazy">` : ''}${qTxt(q) ? `<div class="qtext"${qlang === 'hi' && q.questionHi ? ' lang="hi"' : ''}>${fmtText(qTxt(q))}</div>` : ''}${optList}</div>
          <div class="ans-line"><span>${t('yourAnswer')}: <b class="${st === 'correct' ? 'ok' : st === 'wrong' ? 'bad' : ''}">${ansLabel(q, a)}</b></span><span>${t('correctAnswer')}: <b class="ok">${q.answer.map(x => ansLabel(q, x)).join(' or ')}</b></span></div>
          ${st === 'not-counted' ? `<p class="small muted">${t('notCounted')}</p>` : ''}
          <div class="expl">${q.explanation ? `<b>${t('explanation')}:</b> ${fmtText(q.explanation)}` : `${t('noExplanation')}${key.name ? ' (' + esc(key.name) + ')' : ''}`}</div>
          <details class="src"><summary>${t('source')}</summary>${esc(q.source)}</details><button type="button" class="fb-q" data-fbr="${esc(q.id)}">⚑ Report a problem with this question</button></article>`;
      }).join('');
      math(el);
      el.querySelectorAll('[data-fbr]').forEach(b => b.onclick = () => { const q = qs.find(x => x.id === b.dataset.fbr); if (q) fbOpen({ kind: 'question', pid: q.paperId, qno: q.exam === 'NDA' && q.srcQno ? q.srcQno : q.qno, title: q.paper }); });
    }
    renderList();
    if (showQl) { const qr = app.querySelector('.qlang-row.review'); bindQlang(qr, () => { qr.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.ql === qlang)); renderList(); }); }
    app.querySelectorAll('#rf .chip').forEach(b => b.onclick = () => { filter = b.dataset.f; app.querySelectorAll('#rf .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); renderList(); });
    document.getElementById('retake').onclick = async () => {
      if (!confirmReplace()) return;
      begin({ title: at.title, exam: at.exam, mode: at.mode === 'daily' ? 'practice' : at.mode, qs, durationSec: at.durationSec, rules: at.rules, extra: at.mode === 'chapter' ? at.extra : null });
    };
    if (reviewOnly) document.getElementById('reviewHead').scrollIntoView();
  }


  /* ---------- Challenge a friend (no server: everything travels inside the link) ----------
     Invite link   #/challenge/<paperId>?d=<b64url>  type 1: challenge id, start time, challenger nickname.
     Result link   #/challenge/<paperId>?d=<b64url>  type 2: challenge id + 1–2 results (player id, time, nickname,
                   2 bits per question: 0 skipped, 1 correct, 2 wrong, 3 not counted). Scores are recomputed here from
                   the paper's own marking (scoring.js), so a link can't carry a made-up score.
     Each device keeps its own side in localStorage (key paperId:challengeId). Nothing is sent to any server, and the
     ?d= payload never reaches the visitor counter (index.html strips the query from the counted path). */
  const CH = { btn: 'Challenge a friend', btnShort: 'Challenge', defNick: 'Your friend', note: 'Not live: results compare when you both share your result links.' };
  const LS_CH = 'sonexa.v1.challenges';
  const chKey = (pid, c) => pid + ':' + c;
  const chAll = () => load(LS_CH, {});
  const chGet = k => chAll()[k] || null;
  function chPut(k, rec) {
    const all = chAll(); rec.at = Date.now(); all[k] = rec;
    const keys = Object.keys(all).sort((x, y) => (all[y].at || 0) - (all[x].at || 0));
    keys.slice(60).forEach(x => delete all[x]);
    save(LS_CH, all); return rec;
  }
  const paperQs = p => p.questions.slice().sort((a, b) => a.qno - b.qno);
  const chPaperOk = id => { const m = meta(id); return !!(m && m.kind !== 'bank' && m.file); };
  function cleanNick(s, dflt) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/g, '').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, 20).join('');
    return s || (dflt === undefined ? CH.defNick : dflt);
  }
  const defaultNick = () => cleanNick((load(LS.name, '') || '').split(' ')[0], '');
  const randU32 = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967295); } };
  const randU16 = () => randU32() & 0xffff || 1;
  const newCid = () => (randU32() >>> 0).toString(36);
  const cidNum = c => { const n = parseInt(c, 36); return Number.isFinite(n) && n >= 0 && n <= 4294967295 ? n >>> 0 : null; };
  // byte helpers
  const b64u = bytes => { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { if (!/^[A-Za-z0-9_-]{4,2000}$/.test(str)) throw new Error('bad'); const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  function W() { const a = []; return { a, u8: v => a.push(v & 255), u16: v => { a.push((v >>> 8) & 255, v & 255); }, u24: v => { a.push((v >>> 16) & 255, (v >>> 8) & 255, v & 255); }, u32: v => { a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); },
    str: s => { const b = Array.from(new TextEncoder().encode(s)).slice(0, 80); a.push(b.length); b.forEach(x => a.push(x)); } }; }
  function R(b) { let i = 0; const need = n => { if (i + n > b.length) throw new Error('short'); };
    return { u8: () => { need(1); return b[i++]; }, u16: () => { need(2); const v = (b[i] << 8) | b[i + 1]; i += 2; return v; }, u24: () => { need(3); const v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]; i += 3; return v; },
      u32: () => { need(4); const v = ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]); i += 4; return v >>> 0; },
      str: () => { need(1); const n = b[i++]; need(n); const s = new TextDecoder().decode(b.slice(i, i + n)); i += n; return s; }, bytes: n => { need(n); const s = b.slice(i, i + n); i += n; return s; }, done: () => i === b.length }; }
  const packSt = st => { const out = new Array(Math.ceil(st.length / 4)).fill(0); st.forEach((v, j) => { out[j >> 2] |= (v & 3) << ((j & 3) * 2); }); return out; };
  const unpackSt = (bytes, n) => { const st = []; for (let j = 0; j < n; j++) st.push((bytes[j >> 2] >> ((j & 3) * 2)) & 3); return st; };
  function encInvite(c, start, nick) { const w = W(); w.u8(0x11); w.u32(cidNum(c)); w.u32(Math.floor(start / 1000)); w.str(cleanNick(nick)); return b64u(w.a); }
  function encResult(c, results) {
    const w = W(); w.u8(0x12); w.u32(cidNum(c)); w.u8(results.length);
    results.forEach(r => { w.u16(r.p); w.u24(Math.max(0, Math.min(16777215, Math.round(r.t)))); w.str(cleanNick(r.n)); w.u16(r.s.length); packSt(r.s).forEach(w.u8); });
    return b64u(w.a);
  }
  function decode(d) {
    const rd = R(unb64u(d)); const h = rd.u8(); const c = rd.u32().toString(36);
    if (h === 0x11) { const s = rd.u32() * 1000; const n = cleanNick(rd.str()); if (!rd.done()) throw new Error('extra'); return { type: 'invite', c, s, n }; }
    if (h === 0x12) {
      const k = rd.u8(); if (k < 1 || k > 2) throw new Error('count');
      const results = [];
      for (let j = 0; j < k; j++) { const p = rd.u16(), t = rd.u24(), n = cleanNick(rd.str()), nq = rd.u16(); if (nq < 1 || nq > 400) throw new Error('nq'); results.push({ p, t, n, s: unpackSt(rd.bytes(Math.ceil(nq / 4)), nq) }); }
      if (!rd.done()) throw new Error('extra');
      return { type: 'result', c, results };
    }
    throw new Error('version');
  }
  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const chUrl = (pid, d) => baseUrl() + '#/challenge/' + encodeURIComponent(pid) + '?d=' + d;
  // my statuses for a finished attempt, in paper order
  function statusesFor(qs, r) { const m = { skipped: 0, correct: 1, wrong: 2, 'not-counted': 3 }; return qs.map(q => m[r.perQ[q.id]] || 0); }
  // score a status list with the paper's own marking (same marksFor as scoring.js)
  function scoreSt(p, st, timeSec) {
    const qs = paperQs(p), mk = (meta(p.id) || {}).marking || {};
    const base = PYQScoring.score(qs, {}, { marking: { [p.id]: mk }, rules: p.rules || {} });
    let score = 0, correct = 0, wrong = 0, skipped = 0;
    qs.forEach((q, j) => { const m = PYQScoring.marksFor(q, mk), v = st[j]; if (v === 1) { correct++; score += m.right; } else if (v === 2) { wrong++; score += m.wrong; } else skipped++; });
    return { score: Math.round(score * 100) / 100, max: base.max, correct, wrong, skipped, time: Math.max(0, Math.min(p.minutes * 60 + 5, Math.round(timeSec || 0))) };
  }
  const fmtClock = s => fmtTime(s);
  function chRecordFinish(at, qs, r) {
    const ch = at.challenge, k = chKey(at.paper, ch.c);
    const rec = chGet(k) || { paper: at.paper, c: ch.c, s: ch.s || at.startedAt };
    rec.mine = { p: rec.mine && rec.mine.p || ch.p || randU16(), n: cleanNick(ch.n), t: at.timeTakenSec, s: statusesFor(qs, r) };
    rec.attemptId = at.id;
    if (!rec.opp && ch.opp) rec.opp = ch.opp;
    return chPut(k, rec);
  }
  function chLoadingScreen() { app.innerHTML = `<p class="loading">${t('loading')}</p>`; }
  function chBad(msg) {
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a><h1>${CH.btn}</h1><section class="card"><p>${esc(msg)}</p><a class="btn primary block" href="#/">${t('home')}</a></section>`;
  }
  /* share sheet: nickname + Share / WhatsApp / Copy */
  function chSheet(o) {
    const bg = document.createElement('div'); bg.className = 'sheet-bg mid';
    bg.innerHTML = `<div class="sheet center ch-sheet" role="dialog" aria-modal="true" aria-labelledby="chTitle">
      <h2 id="chTitle">⚔ ${esc(o.title)}</h2>
      <p class="muted small" style="margin-top:0">${esc(o.intro)}</p>
      <label for="chNick">Your nickname <span class="muted small">(optional)</span></label>
      <input id="chNick" type="text" maxlength="20" autocomplete="nickname" placeholder="${esc(CH.defNick)}">
      <div class="ch-actions"><button type="button" class="btn primary" id="chShare">Share link</button><a class="btn ch-wa" id="chWa" target="_blank" rel="noopener noreferrer" href="#">WhatsApp</a></div>
      <div class="ch-linkrow"><input id="chLink" type="text" readonly aria-label="Challenge link"><button type="button" class="btn" id="chCopy">Copy</button></div>
      <p class="ch-note">${esc(CH.note)}</p>
      ${o.startLabel ? `<button type="button" class="btn ch-go block" id="chStart">${esc(o.startLabel)}</button>` : ''}
      <button type="button" class="btn block" id="chClose" style="margin-top:8px">${esc(o.closeLabel || t('close'))}</button>
    </div>`;
    document.body.appendChild(bg);
    const nickEl = bg.querySelector('#chNick'), link = bg.querySelector('#chLink'), wa = bg.querySelector('#chWa');
    nickEl.value = o.nick != null ? o.nick : defaultNick();
    const cur = () => { const n = cleanNick(nickEl.value); const url = o.makeUrl(n); return { n, url, text: o.text(n) }; };
    const refresh = () => { const c = cur(); link.value = c.url; wa.href = 'https://wa.me/?text=' + encodeURIComponent(c.text + ' ' + c.url); if (o.onNick) o.onNick(c.n); };
    nickEl.oninput = refresh; refresh();
    const copy = async () => {
      const c = cur(); let ok = false;
      try { await navigator.clipboard.writeText(c.url); ok = true; } catch (e) { try { link.select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
      toast(ok ? 'Link copied. Paste it in a chat.' : 'Select the link and copy it.');
    };
    bg.querySelector('#chCopy').onclick = copy;
    bg.querySelector('#chShare').onclick = async () => {
      const c = cur();
      if (navigator.share) { try { await navigator.share({ title: 'SONEXA challenge', text: c.text, url: c.url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      copy();
    };
    wa.onclick = () => refresh();
    const close = () => bg.remove();
    bg.querySelector('#chClose').onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
    const st = bg.querySelector('#chStart'); if (st) st.onclick = () => { const c = cur(); close(); o.onStart(c.n); };
    return bg;
  }
  // 1a. from a paper row: challenge first, then start together
  function challengeFromPaper(pid) {
    if (!isOnline()) { toast('You are offline. Challenge links need internet. Try again when you are back online.'); return; }
    const m = meta(pid); if (!chPaperOk(pid)) return;
    const c = newCid(), s = Date.now();
    chSheet({ title: CH.btn, intro: `Send this link to a friend. You both take ${m.title} at the same time, then swap result links to see who wins.`,
      makeUrl: n => chUrl(pid, encInvite(c, s, n)), text: n => `${n} challenged you to a test on SONEXA: ${m.title}. Take it now and let's compare scores!`,
      startLabel: 'Start my test', closeLabel: 'Cancel',
      onStart: n => { chPut(chKey(pid, c), { paper: pid, c, s, mine: { p: randU16(), n } }); startFull(pid, { c, s, n, role: 'host' }); } });
  }
  // 1b. from inside a running test ("while I'm giving a test")
  function challengeFromTest() {
    if (!isOnline()) { toast('You are offline. Challenge links need internet. Try again when you are back online.'); return; }
    if (!active || !active.paper) return;
    if (!active.challenge) { active.challenge = { c: newCid(), s: active.startedAt, n: defaultNick() || CH.defNick, role: 'host' }; save(LS.active, active); }
    const ch = active.challenge, pid = active.paper, title = active.title;
    if (!chGet(chKey(pid, ch.c))) chPut(chKey(pid, ch.c), { paper: pid, c: ch.c, s: ch.s, mine: { p: randU16(), n: ch.n } });
    chSheet({ title: CH.btn, intro: `Send this link to a friend. They take the same paper (${title}) and you both share your result links at the end to see who wins.`,
      nick: ch.n === CH.defNick ? '' : ch.n, makeUrl: n => chUrl(pid, encInvite(ch.c, ch.s, n)), text: n => `${n} challenged you to a test on SONEXA: ${title}. Take it now and let's compare scores!`,
      onNick: n => { if (active && active.challenge) { active.challenge.n = n; save(LS.active, active); } }, closeLabel: 'Back to test' });
  }
  // result links: sender first, then sender's opponent when known
  function resultUrl(rec, nick) {
    const mine = Object.assign({}, rec.mine, { n: nick || rec.mine.n });
    return chUrl(rec.paper, encResult(rec.c, rec.opp ? [mine, rec.opp] : [mine]));
  }
  // 2. result screen card
  function chEligible(at) {
    const pid = at.paper || (at.mode === 'full' && at.paperIds && at.paperIds.length === 1 ? at.paperIds[0] : null);
    if (!pid || !chPaperOk(pid) || at.qids.length !== (meta(pid) || {}).count) return null;
    return pid;
  }
  function chResultCard(at) {
    const pid = chEligible(at); if (!pid) return '';
    const rec = at.challenge ? chGet(chKey(pid, at.challenge.c)) : null;
    if (rec && rec.mine && rec.mine.s) {
      return `<section class="card ch-card"><h3>⚔ Challenge</h3>
        <p class="small" style="margin:4px 0 10px">${rec.opp ? `Your friend's result is in. See who won, then send your result back.` : `Send your result link to your friend. When they send theirs, open it here to see who won.`}</p>
        <div class="row">${rec.opp ? `<a class="btn ch-go" href="#/vs/${encodeURIComponent(chKey(pid, rec.c))}" style="flex:1">See head-to-head</a>` : ''}<button type="button" class="btn primary" id="chSend" style="flex:1">${rec.opp ? 'Send my result back' : 'Send my result'}</button></div>
        <p class="ch-note">${esc(CH.note)}</p></section>`;
    }
    return `<section class="card ch-card"><h3>⚔ ${CH.btn}</h3><p class="small" style="margin:4px 0 10px">Send your score to a friend. They take the same paper and see straight away who won.</p>
      <button type="button" class="btn ch-go block" id="chNew">${CH.btn}</button></section>`;
  }
  function bindChResultCard(at, qs, r) {
    const pid = chEligible(at); if (!pid) return;
    const title = (meta(pid) || {}).title || at.title;
    const sc = `${r.score}/${r.max}`;
    const send = document.getElementById('chSend');
    if (send) send.onclick = () => {
      if (!isOnline()) { toast('You are offline. Challenge links need internet. Try again when you are back online.'); return; }
      const k = chKey(pid, at.challenge.c), rec = chGet(k);
      chSheet({ title: rec.opp ? 'Send my result back' : 'Send my result', intro: `Your friend opens this link on their phone to see both results side by side.`,
        nick: rec.mine.n === CH.defNick ? '' : rec.mine.n, makeUrl: n => resultUrl(rec, n),
        text: n => `${n} scored ${sc} in ${title} on SONEXA (time ${fmtClock(at.timeTakenSec)}). Open to see who won:`,
        onNick: n => { rec.mine.n = n; chPut(k, rec); } });
    };
    const nw = document.getElementById('chNew');
    if (nw) nw.onclick = () => {
      if (!isOnline()) { toast('You are offline. Challenge links need internet. Try again when you are back online.'); return; }
      // a fresh challenge carrying this finished result (made once; opening the button again reuses it)
      if (at.challenge && chGet(chKey(pid, at.challenge.c))) {
        const k0 = chKey(pid, at.challenge.c), r0 = chGet(k0);
        return chSheet({ title: CH.btn, intro: `Your friend sees your score, takes the same paper, and gets the head-to-head the moment they submit.`,
          nick: r0.mine.n === CH.defNick ? '' : r0.mine.n, makeUrl: n => resultUrl(r0, n), text: n => `${n} challenged you on SONEXA: ${sc} in ${title} (time ${fmtClock(at.timeTakenSec)}). Can you beat it?`,
          onNick: n => { r0.mine.n = n; chPut(k0, r0); } });
      }
      const c = newCid(), k = chKey(pid, c);
      const rec = { paper: pid, c, s: at.startedAt, attemptId: at.id, mine: { p: randU16(), n: defaultNick() || CH.defNick, t: at.timeTakenSec, s: statusesFor(qs, r) } };
      let saved = false;
      const persist = () => {
        if (saved) return; saved = true; chPut(k, rec);
        at.challenge = { c, n: rec.mine.n, s: rec.s }; at.paper = pid;
        const list = attempts(), a = list.find(x => x.id === at.id); if (a) { a.challenge = at.challenge; a.paper = pid; save(LS.attempts, list); }
      };
      chSheet({ title: CH.btn, intro: `Your friend sees your score, takes the same paper, and gets the head-to-head the moment they submit.`,
        makeUrl: n => { rec.mine.n = n; return resultUrl(rec, n); }, text: n => `${n} challenged you on SONEXA: ${sc} in ${title} (time ${fmtClock(at.timeTakenSec)}). Can you beat it?`,
        onNick: n => { rec.mine.n = n; if (saved) chPut(k, rec); } });
      persist();
    };
  }
  // 3. opening a challenge link
  async function viewChallengeLink(pid, query) {
    const d = (new URLSearchParams(query)).get('d') || '';
    if (!chPaperOk(pid)) return chBad('This challenge link is for a paper that is not on SONEXA any more.');
    let msg; try { msg = decode(d); } catch (e) { return chBad('This challenge link looks broken or cut off. Ask your friend to send it again.'); }
    chLoadingScreen();
    let p; try { p = await loadPaper(pid); } catch (e) { return chBad('Could not load this paper. Check your internet and open the link again.'); }
    const n = paperQs(p).length;
    const k = chKey(pid, msg.c), rec = chGet(k);
    if (msg.type === 'result') {
      const res = msg.results.filter(x => x.s.length === n);
      if (!res.length) return chBad('This result link does not match the paper. Ask your friend to send it again.');
      if (rec && rec.mine && rec.mine.s) { // I have taken it on this device
        const opp = res.find(x => x.p !== rec.mine.p);
        if (!opp) { toast('This is your own result link.'); return go(rec.opp ? '#/vs/' + encodeURIComponent(k) : (rec.attemptId ? '#/result/' + rec.attemptId : '#/'), true); }
        rec.opp = { p: opp.p, n: opp.n, t: opp.t, s: opp.s }; chPut(k, rec);
        return go('#/vs/' + encodeURIComponent(k), true);
      }
      if (active && active.challenge && active.challenge.c === msg.c && active.paper === pid) { // mid-test: keep their result for the end
        const myP = active.challenge.p || (rec && rec.mine && rec.mine.p);
        const opp = res.find(x => x.p !== myP);
        if (opp) { active.challenge.opp = { p: opp.p, n: opp.n, t: opp.t, s: opp.s }; save(LS.active, active);
          if (rec) { rec.opp = active.challenge.opp; chPut(k, rec); }
          setTimeout(() => toast(`${opp.n}'s result is saved. Finish your test to see who won.`), 300); }
        return go('#/test', true);
      }
      if (res.length === 2) return viewVsRender(p, res[0], res[1], null, k);   // a link carrying both results: anyone can look
      return chInviteScreen(p, k, rec, { c: msg.c, n: res[0].n, opp: res[0], s: null });
    }
    // invite
    if (rec && rec.mine && rec.mine.s) return go(rec.opp ? '#/vs/' + encodeURIComponent(k) : '#/result/' + rec.attemptId, true);
    if (active && active.challenge && active.challenge.c === msg.c && active.paper === pid) return go('#/test', true);
    return chInviteScreen(p, k, rec, { c: msg.c, n: msg.n, s: msg.s, opp: null });
  }
  function chInviteScreen(p, k, rec, inv) {
    const m = meta(p.id), op = inv.opp ? scoreSt(p, inv.opp.s, inv.opp.t) : null;
    const isMine = rec && rec.mine && !inv.opp; // I created this invite on this device
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a>
      <section class="card ch-hero">
        <div class="ch-badge">⚔ CHALLENGE</div>
        <h1>${isMine ? 'Your challenge link' : `${esc(inv.n)} challenged you`}</h1>
        <p class="ch-paper">${esc(m.title)}</p>
        <p class="muted small">${p.questions.length} ${t('questions')} · ${p.minutes} ${t('min')}</p>
        ${op ? `<div class="ch-score"><div><b>${op.score}</b><span>/ ${op.max}</span></div><div class="muted small">Score to beat · time ${fmtClock(op.time)} · ${op.correct} correct</div></div>`
        : (inv.s ? `<p class="small">Challenge started at ${esc(fmtDate(inv.s))}. Start now to take it together.</p>` : '')}
      </section>
      ${isMine ? `<section class="card"><p class="small" style="margin-top:0">This is the link you sent. Start the paper to take your side of the challenge.</p></section>` : ''}
      <section class="card">
        <label for="chMyNick" class="label">Your nickname <span class="muted small">(optional)</span></label>
        <input id="chMyNick" class="ch-input" type="text" maxlength="20" autocomplete="nickname" placeholder="${esc(CH.defNick)}" value="${esc(isMine ? (rec.mine.n === CH.defNick ? '' : rec.mine.n) : defaultNick())}">
        <button type="button" class="btn ch-go block" id="chTake" style="margin-top:12px">${op ? 'Take the same test' : 'Start the test'}</button>
        <p class="ch-note">${op ? 'You see who won the moment you submit.' : CH.note}</p>
      </section>
      ${siteFooter()}`;
    document.getElementById('chTake').onclick = async () => {
      const n = cleanNick(document.getElementById('chMyNick').value);
      const r0 = chGet(k) || { paper: p.id, c: inv.c, s: inv.s || Date.now() };
      r0.mine = Object.assign({ p: randU16() }, r0.mine || {}, { n });
      if (inv.opp) r0.opp = { p: inv.opp.p, n: inv.opp.n, t: inv.opp.t, s: inv.opp.s };
      if (r0.opp && r0.opp.p === r0.mine.p) r0.mine.p = (r0.mine.p % 65535) + 1;
      chPut(k, r0);
      await startFull(p.id, { c: inv.c, s: r0.s, n, p: r0.mine.p, role: isMine ? 'host' : 'guest', opp: r0.opp || null });
    };
  }
  // 4. head-to-head
  async function viewVs(k) {
    const rec = chGet(k);
    if (!rec || !rec.mine || !rec.mine.s || !rec.opp) return go('#/', true);
    chLoadingScreen();
    let p; try { p = await loadPaper(rec.paper); } catch (e) { return chBad('Could not load this paper. Check your internet and try again.'); }
    viewVsRender(p, rec.mine, rec.opp, rec, k);
  }
  function viewVsRender(p, A, B, rec, k) {
    const m = meta(p.id), n = paperQs(p).length;
    if (A.s.length !== n || B.s.length !== n) return chBad('These results do not match the paper.');
    const a = scoreSt(p, A.s, A.t), b = scoreSt(p, B.s, B.t);
    const me = !!rec; // A is me
    const nameA = me ? 'You' : esc(A.n), nameB = esc(B.n);
    let win = 0; if (a.score !== b.score) win = a.score > b.score ? 1 : 2; else if (a.time !== b.time) win = a.time < b.time ? 1 : 2;
    const byTime = a.score === b.score && win;
    const line = !win ? `It's a tie! Same score, same time.` : (win === 1 ? (me ? 'You win! 🏆' : `${nameA} wins! 🏆`) : `${nameB} wins! 🏆`) + (byTime ? ' <span class="ch-why">(same score, less time)</span>' : '');
    const col = (x, nm, sub, cls, won) => `<div class="vs-col ${cls}${won ? ' won' : ''}"><div class="vs-name">${won ? '👑 ' : ''}${nm}</div><div class="vs-sub">${sub || '&nbsp;'}</div>
      <div class="vs-score">${x.score}<span>/ ${x.max}</span></div>
      <dl><div><dt>Correct</dt><dd class="ok">${x.correct}</dd></div><div><dt>Wrong</dt><dd class="bad">${x.wrong}</dd></div><div><dt>Skipped</dt><dd>${x.skipped}</dd></div><div><dt>Time</dt><dd>${fmtClock(x.time)}</dd></div></dl></div>`;
    const cells = A.s.map((v, j) => { const ra = v === 1, rb = B.s[j] === 1; const c = ra && rb ? 'both' : ra ? 'a' : rb ? 'b' : 'none';
      return `<span class="vs-q ${c}" title="Q${j + 1}">${j + 1}</span>`; }).join('');
    const both = A.s.filter((v, j) => v === 1 && B.s[j] === 1).length, onlyA = A.s.filter((v, j) => v === 1 && B.s[j] !== 1).length, onlyB = B.s.filter((v, j) => v === 1 && A.s[j] !== 1).length;
    app.innerHTML = `<a href="${rec && rec.attemptId && attempts().some(x => x.id === rec.attemptId) ? '#/result/' + esc(rec.attemptId) : '#/'}" class="backbtn" data-direct>← ${t('back')}</a>
      <h1>Head-to-head</h1><p class="muted small" style="margin-top:0">${esc(m.title)}</p>
      <section class="card vs-card">
        <div class="vs-win${win ? '' : ' tie'}">${line}</div>
        <div class="vs-cols">${col(a, nameA, me && A.n !== CH.defNick ? esc(A.n) : '', 'a', win === 1)}<div class="vs-mid">VS</div>${col(b, nameB, '', 'b', win === 2)}</div>
      </section>
      <h2>Question by question</h2>
      <section class="card">
        <div class="vs-legend"><span><i class="vs-q both"></i>Both right (${both})</span><span><i class="vs-q a"></i>${nameA} only (${onlyA})</span><span><i class="vs-q b"></i>${nameB} only (${onlyB})</span><span><i class="vs-q none"></i>Neither</span></div>
        <div class="vs-strip">${cells}</div>
      </section>
      ${rec ? `<div class="row"><button type="button" class="btn primary" id="chBack" style="flex:1">Send my result back</button>${rec.attemptId && attempts().some(x => x.id === rec.attemptId) ? `<a class="btn" href="#/result/${esc(rec.attemptId)}" style="flex:1">My full result</a>` : ''}</div>` :
        `<a class="btn ch-go block" href="#/exam/${p.exam === 'NEET' ? 'neet' : p.exam === 'CBSE' ? 'cbse' : p.exam === 'JEE Advanced' ? 'jeeadv' : p.exam === 'NDA' ? 'nda' : 'jee'}">Try this paper yourself</a>`}
      <p class="ch-note" style="text-align:center">${esc(CH.note)} Answers stay on each phone.</p>
      ${siteFooter()}`;
    const back = document.getElementById('chBack');
    if (back) back.onclick = () => {
      chSheet({ title: 'Send my result back', intro: 'Your friend opens this link to see the same head-to-head.', nick: rec.mine.n === CH.defNick ? '' : rec.mine.n,
        makeUrl: nn => resultUrl(rec, nn), text: nn => `${nn} scored ${a.score}/${a.max} in ${m.title} on SONEXA (time ${fmtClock(a.time)}). Open to see who won:`,
        onNick: nn => { rec.mine.n = nn; chPut(k, rec); } });
    };
  }


  /* ---------- 📒 My Mistakes (mistakes diary) ----------
     Every wrong or unanswered question of every finished test is saved on this phone (localStorage sonexa.v1.mistakes,
     keyed by question id): paper id, 0-based question index in the paper file, your answer, the correct answer, date.
     "Re-test my mistakes" builds a normal test (max 30, shuffled) of those questions; a question answered right twice in
     re-tests moves to Mastered (Undo puts it back). Old attempts made before this feature are added once (sonexa.v1.mxSeen). */
  const LS_MX = 'sonexa.v1.mistakes', LS_MXSEEN = 'sonexa.v1.mxSeen', MX_MAX = 30;
  const mxAll = () => load(LS_MX, {});
  const mxSave = m => save(LS_MX, m);
  const mxActive = m => Object.values(m || mxAll()).filter(e => !e.m);
  const mxExamCls = e => e === 'NEET' ? 'neet' : e === 'CBSE' ? 'cbse' : e === 'JEE Advanced' ? 'jeeadv' : e === 'NDA' ? 'nda' : 'jee';
  const mxQno = q => q.exam === 'NDA' && q.srcQno ? q.srcQno : q.qno;
  const mxLabel = (q, v) => v == null || v === '' ? '' : (q.type === 'numerical' ? String(v) : (optLabels(q) ? optLabel(q, Number(v) - 1) : String(v)));
  function mxSeenAdd(id) { const s = load(LS_MXSEEN, []); if (!s.includes(id)) { s.unshift(id); save(LS_MXSEEN, s.slice(0, 300)); } }
  // Called from finish() (and for old attempts) with the scored questions. Returns {added, mastered, left}.
  function mxRecord(at, qs, r) {
    const m = mxAll(), now = at.finishedAt || Date.now(), retest = at.mode === 'mistakes';
    let added = 0, mastered = 0;
    qs.forEach(q => {
      if (!q) return;
      const st = r.perQ[q.id], e = m[q.id];
      if (st === 'correct') {
        if (retest && e && !e.m) { e.ok = (e.ok || 0) + 1; if (e.ok >= 2) { e.m = now; mastered++; } }
        return;
      }
      const P = papers[q.paperId]; const i = P ? P.questions.indexOf(q) : -1;
      const a = at.answers ? at.answers[q.id] : null; const has = a != null && String(a).trim() !== '';
      if (!e) added++;
      m[q.id] = { q: q.id, p: q.paperId, i, n: mxQno(q), x: q.exam, s: q.subject, a: has ? a : null, c: q.answer,
        al: has ? mxLabel(q, a) : '', cl: q.answer.map(v => mxLabel(q, v)).join(' or '), w: st === 'wrong' ? 'w' : 's',
        d: now, f: e ? e.f : now, k: (e ? e.k || 1 : 0) + 1, ok: 0, m: 0 };
    });
    mxSave(m);
    if (at.id) mxSeenAdd(at.id);
    return { added, mastered, left: mxActive(m).length };
  }
  // Attempts finished before the diary existed: score them once and add their mistakes.
  async function mxBackfill() {
    const seen = load(LS_MXSEEN, []); const todo = attempts().filter(a => a.id && !seen.includes(a.id) && a.qids && a.answers);
    if (!todo.length) return false;
    let changed = false;
    for (const at of todo.slice().reverse()) {
      try {
        const ids = (at.paperIds || []).filter(meta); const got = await Promise.allSettled(ids.map(loadPaper));
        if (got.some(g => g.status !== 'fulfilled')) continue;   // offline: try again next time
        const qs = at.qids.map(qById).filter(Boolean);
        const r = PYQScoring.score(qs, at.answers, { marking: at.marking, rules: at.rules });
        mxRecord(Object.assign({}, at, { mode: at.mode === 'mistakes' ? 'old' : at.mode }), qs, r); changed = true;
      } catch (e) { /* skip */ }
    }
    return changed;
  }
  function mxCardHtml() {
    const act = mxActive(), mast = Object.values(mxAll()).length - act.length;
    return `<a class="tool-card mx" href="#/mistakes"><span class="tool-ico" aria-hidden="true">📒</span><span class="tool-body"><span class="tool-title">My Mistakes</span>
      <span class="tool-note">${act.length ? `${act.length} question${act.length === 1 ? '' : 's'} to fix${mast ? ` · ${mast} mastered` : ''}` : 'Wrong & unanswered questions are saved here automatically'}</span></span><span class="tool-go" aria-hidden="true">›</span></a>`;
  }
  const mxState = { exam: 'all', type: 'all' };
  async function viewMistakes() {
    await mxBackfill().catch(() => false);
    if (!/^#\/mistakes/.test(location.hash)) return;
    const all = mxAll(), list = Object.values(all), act = list.filter(e => !e.m), mast = list.filter(e => e.m).sort((a, b) => b.m - a.m);
    const exams = [...new Set(act.map(e => e.x))].sort();
    if (mxState.exam !== 'all' && !exams.includes(mxState.exam)) mxState.exam = 'all';
    const pick = act.filter(e => (mxState.exam === 'all' || e.x === mxState.exam) && (mxState.type === 'all' || e.w === mxState.type));
    const nW = act.filter(e => e.w === 'w').length, nS = act.length - nW;
    const byExam = {}; pick.forEach(e => { ((byExam[e.x] = byExam[e.x] || {})[e.p] = byExam[e.x][e.p] || []).push(e); });
    const ptitle = pid => (meta(pid) || {}).title || pid;
    const groups = Object.keys(byExam).sort().map(x => {
      const ps = Object.keys(byExam[x]).sort((a, b) => ((meta(b) || {}).year || 0) - ((meta(a) || {}).year || 0) || ptitle(a).localeCompare(ptitle(b)));
      const n = ps.reduce((s, p) => s + byExam[x][p].length, 0);
      return `<h2 class="mx-exam">${esc(x)} <span class="muted small">(${n})</span></h2><section class="card mx-list">${ps.map(p => {
        const es = byExam[x][p].sort((a, b) => a.n - b.n); const w = es.filter(e => e.w === 'w').length;
        return `<div class="mx-paper" data-pid="${esc(p)}"><div class="mx-prow"><div><div style="font-weight:700">${esc(ptitle(p))}</div>
          <div class="meta">${es.length} to fix · ${w} wrong · ${es.length - w} unanswered</div></div>
          <div class="mx-pbtns"><button type="button" class="btn mxbtn" data-mxp="${esc(p)}">Re-test</button><button type="button" class="mx-view" data-mxv="${esc(p)}" aria-expanded="false">View ▾</button></div></div>
          <div class="mx-qs" hidden></div></div>`;
      }).join('')}</section>`;
    }).join('');
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>📒 My Mistakes</h1>
      <p class="muted small" style="margin-top:0">Every question you got wrong or left unanswered is saved here automatically, on this phone only. Answer one right twice in a re-test and it moves to Mastered.</p>
      <section class="card mx-stats"><div class="stats"><div class="stat"><b>${act.length}</b>To fix</div><div class="stat bad"><b>${nW}</b>Wrong</div><div class="stat"><b>${nS}</b>Unanswered</div><div class="stat ok"><b>${mast.length}</b>Mastered</div></div>
        ${act.length ? `${exams.length > 1 ? `<div class="label">Exam</div><div class="chips" id="mxEx"><button class="chip" data-x="all" aria-pressed="${mxState.exam === 'all'}">All <span class="muted small">(${act.length})</span></button>${exams.map(x => `<button class="chip" data-x="${esc(x)}" aria-pressed="${mxState.exam === x}">${esc(x)} <span class="muted small">(${act.filter(e => e.x === x).length})</span></button>`).join('')}</div>` : ''}
        <div class="label">Show</div><div class="chips" id="mxTy">${[['all', 'All'], ['w', 'Wrong'], ['s', 'Unanswered']].map(([k, l]) => `<button class="chip" data-t="${k}" aria-pressed="${mxState.type === k}">${l}</button>`).join('')}</div>
        <button class="btn sx block" id="mxGo" ${pick.length ? '' : 'disabled'}>🔁 Re-test my mistakes <span class="small">(${Math.min(MX_MAX, pick.length)} of ${pick.length})</span></button>
        <p class="muted small" style="margin:8px 0 0">Up to ${MX_MAX} at a time, shuffled. Normal timer, marking and review.</p>` : `<p class="muted" style="margin:10px 0 0">${mast.length ? 'All caught up 🎉 Nothing to fix right now. New mistakes from your next tests will show up here.' : 'No mistakes saved yet. Take any test — wrong and unanswered questions will show up here.'}</p><a class="btn sx block" href="#/">Choose a test</a>`}
      </section>
      ${groups}
      ${mast.length ? `<details class="card mx-mast"><summary><b>✓ Mastered (${mast.length})</b> <span class="muted small">answered right twice in re-tests</span></summary>
        ${mast.slice(0, 200).map(e => `<div class="mx-mrow"><div><div style="font-weight:600">${esc(ptitle(e.p))} · Q${esc(e.n)}</div><div class="meta">${esc(e.s || '')} · mastered ${esc(fmtDay(e.m))}</div></div><button type="button" class="btn mx-undo" data-undo="${esc(e.q)}">Undo</button></div>`).join('')}</details>` : ''}
      ${siteFooter()}`;
    try { bnavRender('mistakes'); } catch (e) { /* ignore */ }
    const rr = () => { const y = window.scrollY; viewMistakes().then(() => window.scrollTo(0, y)); };
    app.querySelectorAll('#mxEx .chip').forEach(b => b.onclick = () => { mxState.exam = b.dataset.x; rr(); });
    app.querySelectorAll('#mxTy .chip').forEach(b => b.onclick = () => { mxState.type = b.dataset.t; rr(); });
    const go1 = document.getElementById('mxGo'); if (go1 && pick.length) go1.onclick = () => mxStart(pick);
    app.querySelectorAll('[data-mxp]').forEach(b => b.onclick = () => mxStart(pick.filter(e => e.p === b.dataset.mxp)));
    app.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => { const m = mxAll(), e = m[b.dataset.undo]; if (e) { e.m = 0; e.ok = 0; mxSave(m); toast('Moved back to My Mistakes'); } rr(); });
    app.querySelectorAll('[data-mxv]').forEach(b => b.onclick = async () => {
      const box = b.closest('.mx-paper').querySelector('.mx-qs'), open = box.hidden;
      box.hidden = !open; b.setAttribute('aria-expanded', open); b.textContent = open ? 'Hide ▴' : 'View ▾';
      if (!open || box.dataset.done) return;
      const pid = b.dataset.mxv, es = pick.filter(e => e.p === pid).sort((a, c) => a.n - c.n);
      let P = null; try { P = await loadPaper(pid); } catch (e) { /* offline */ }
      box.dataset.done = '1';
      box.innerHTML = es.map(e => { const q = P ? (P.questions[e.i] && P.questions[e.i].id === e.q ? P.questions[e.i] : P.questions.find(x => x.id === e.q)) : null;
        return `<div class="mx-q"><div class="mx-qh"><b>Q${esc(e.n)}</b> <span class="muted small">${esc(e.s || '')} · ${esc(fmtDay(e.d))}${e.k > 1 ? ` · missed ${e.k}×` : ''}</span>${e.ok ? ' <span class="mx-ok1">1/2 ✓</span>' : ''}</div>
          ${q ? `<div class="qbody">${qImg(q) ? `<img src="${qImg(q)}" alt="Question ${esc(e.n)}" loading="lazy">` : ''}${qTxt(q) ? `<div class="qtext">${fmtText(qTxt(q))}</div>` : ''}</div>` : `<p class="muted small">Question preview needs internet.</p>`}
          <div class="ans-line"><span>${t('yourAnswer')}: <b class="${e.w === 'w' ? 'bad' : ''}">${e.w === 'w' ? '(' + esc(e.al) + ')' : `<span class="muted">${t('notAttempted')}</span>`}</b></span><span>${t('correctAnswer')}: <b class="ok">${esc(e.cl)}</b></span></div></div>`; }).join('');
      math(box);
    });
  }
  async function mxStart(entries) {
    if (!entries.length || !confirmReplace()) return;
    const pickd = shuffle(entries).slice(0, MX_MAX);
    const ids = [...new Set(pickd.map(e => e.p))].filter(meta);
    const got = await Promise.allSettled(ids.map(loadPaper));
    const qs = pickd.map(e => { const P = papers[e.p]; if (!P) return null; const q = P.questions[e.i]; return q && q.id === e.q ? q : P.questions.find(x => x.id === e.q) || null; }).filter(Boolean);
    if (!qs.length) { toast(isOnline() ? 'Could not load these questions. Please try again.' : 'These papers need internet. Save papers offline to re-test without internet.'); return; }
    if (got.some(g => g.status !== 'fulfilled')) toast(`${pickd.length - qs.length} question(s) skipped: their paper needs internet.`);
    const exs = [...new Set(qs.map(q => q.exam))];
    const mins = qs.reduce((s, q) => s + (((EXAMS[mxExamCls(q.exam)] || {}).minPerQ) || 1.5), 0);
    begin({ title: `My Mistakes · ${qs.length} questions`, exam: exs.length === 1 ? exs[0] : 'Mixed', mode: 'mistakes', qs, durationSec: Math.max(5, Math.round(mins)) * 60, rules: {} });
  }
  const fmtDay = ms => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  // Extra card on the result screen for the practice tools (mistakes / daily / chapter).
  function sxModeCard(at) {
    if (at.mode === 'daily' && at.daily) {
      const d = at.daily, add = at.mx && at.mx.added;
      return `<section class="card tool-result daily"><b>🔥 Daily 10 done!</b><p class="small" style="margin:4px 0 10px">${d.streak}-day streak · Best ${d.best}${add ? ` · 📒 ${add} saved to My Mistakes` : ''}</p>
        <div class="row"><a class="btn wa" style="flex:1" target="_blank" rel="noopener noreferrer" href="${'https://wa.me/?text=' + encodeURIComponent(dailyShareText(d.rec, d.k, d.streak))}">Share my Daily 10</a><a class="btn" href="#/daily" style="flex:1">Daily 10</a></div></section>`;
    }
    if (at.mode === 'chapter' && at.extra && at.extra.chap) return chapResultCard(at);
    if (at.mode === 'mistakes' && at.mx) {
      return `<section class="card tool-result mx"><b>📒 Re-test done</b><p class="small" style="margin:4px 0 10px">${at.mx.mastered ? `${at.mx.mastered} question${at.mx.mastered === 1 ? '' : 's'} moved to Mastered 🎉 · ` : ''}${at.mx.left} still to fix.</p><a class="btn sx block" href="#/mistakes">Open My Mistakes</a></section>`;
    }
    if (at.mx && at.mx.added && at.mode !== 'mistakes') {
      return `<section class="card tool-result mx"><b>📒 ${at.mx.added} question${at.mx.added === 1 ? '' : 's'} saved to My Mistakes</b><p class="small" style="margin:4px 0 10px">Re-test them later until you get them right.</p><a class="btn block" href="#/mistakes">Open My Mistakes</a></section>`;
    }
    return '';
  }
  function sxAfterFinish(at, qs, r) {
    if (at.mode === 'daily') { try { dailyRecord(at); } catch (e) { /* ignore */ } }
    at.mx = mxRecord(at, qs, r);
  }
  const sxBack = (at, ex) => at.mode === 'mistakes' ? '#/mistakes' : at.mode === 'daily' ? '#/daily' : at.mode === 'chapter' ? '#/chapters' : at.mode === 'search' ? '#/search' : '#/exam/' + ex;
  function sxToolCards() { return chapCardHtml(); }


  /* ---------- 🔥 Daily 10 ----------
     10 previous-year questions a day per exam, picked from the date (IST) with a seeded random, so everyone gets the same 10.
     Streak = days in a row with a finished Daily 10 (any exam); kept in localStorage sonexa.v1.daily. */
  const LS_DAILY = 'sonexa.v1.daily';
  const DAILY_EX = [['neet', 'NEET'], ['jee', 'JEE'], ['cbse10', 'CBSE 10'], ['cbse12', 'CBSE 12'], ['nda', 'NDA']];
  const dailyLabel = k => (DAILY_EX.find(x => x[0] === k) || DAILY_EX[0])[1];
  const dailyState = () => load(LS_DAILY, {});
  const istDay = (off) => new Date(Date.now() + 19800000 + (off || 0) * 86400000).toISOString().slice(0, 10);
  const prevDay = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const fmtDayLong = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dailyPool = k => INDEX.filter(p => p.count > 0 && (k === 'neet' ? p.exam === 'NEET' && p.kind !== 'sample' : k === 'jee' ? (p.exam === 'JEE Main' || p.exam === 'JEE Advanced')
    : k === 'cbse10' ? p.exam === 'CBSE' && String(p.class) === '10' : k === 'cbse12' ? p.exam === 'CBSE' && String(p.class) === '12' : p.exam === 'NDA')).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dailyPicks(k, day) {
    const pool = dailyPool(k); if (!pool.length) return [];
    let s = hash32('sonexa-daily|' + day + '|' + k) || 1;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const seen = new Set(), out = []; let guard = 0;
    while (out.length < 16 && guard++ < 600) { const p = pool[Math.floor(rnd() * pool.length)]; const i = Math.floor(rnd() * p.count); const key = p.id + '|' + i; if (!seen.has(key)) { seen.add(key); out.push([p.id, i]); } }
    return out;
  }
  const dailyStreakNow = st => (st.last === istDay() || st.last === istDay(-1)) ? (st.streak || 0) : 0;
  const dailyUrl = () => (/^https:\/\//.test(location.href) ? location.origin + location.pathname : SHARE_URL) + '#/daily';
  const dailyShareText = (rec, k, streak) => `🔥 I scored ${rec.s}/${rec.m} (${rec.c}/10 correct) in today's SONEXA Daily 10 (${dailyLabel(k)})!${streak > 1 ? ` ${streak}-day streak.` : ''} Can you beat me? Today's 10 questions, free, no login: ${dailyUrl()}`;
  function dailyCardHtml() {
    const st = dailyState(), today = (st.done || {})[istDay()], n = dailyStreakNow(st);
    const note = today ? `Done today ✓${n ? ` · 🔥 ${n}-day streak` : ''}` : n ? `🔥 ${n}-day streak · today's 10 is waiting` : '10 real PYQs every day · build your streak';
    return `<a class="tool-card daily" href="#/daily"><span class="tool-ico" aria-hidden="true">🔥</span><span class="tool-body"><span class="tool-title">Daily 10</span><span class="tool-note">${note}</span></span><span class="tool-go" aria-hidden="true">›</span></a>`;
  }
  async function dailyStart(k) {
    if (!confirmReplace()) return;
    const day = istDay(), picks = dailyPicks(k, day);
    const ids = [...new Set(picks.map(x => x[0]))];
    await Promise.allSettled(ids.map(loadPaper));
    if (!picks.length || ids.some(id => !papers[id])) { toast(isOnline() ? "Could not load today's questions. Please try again." : "Today's Daily 10 needs internet."); return; }
    const qs = picks.map(([p, i]) => papers[p].questions[i]).filter(q => q && q.answer && q.answer.length).slice(0, 10);
    const exs = [...new Set(qs.map(q => q.exam))];
    const mins = qs.reduce((s, q) => s + (((EXAMS[mxExamCls(q.exam)] || {}).minPerQ) || 1.5), 0);
    begin({ title: `Daily 10 · ${dailyLabel(k)} · ${fmtDayLong(day)}`, exam: exs.length === 1 ? exs[0] : 'JEE', mode: 'daily', qs, durationSec: Math.max(5, Math.ceil(mins)) * 60, rules: {}, extra: { daily: { day, k } } });
  }
  function dailyRecord(at) {
    const d = at.extra && at.extra.daily; if (!d) return;
    const st = dailyState(); st.done = st.done || {};
    const rec = { s: at.score, m: at.max, c: at.correct, id: at.id };
    if (!(st.done[d.day] || {})[d.k]) (st.done[d.day] = st.done[d.day] || {})[d.k] = rec;
    if (st.last !== d.day) { st.streak = st.last === prevDay(d.day) ? (st.streak || 0) + 1 : 1; st.last = d.day; }
    st.best = Math.max(st.best || 0, st.streak || 0);
    Object.keys(st.done).sort().slice(0, -30).forEach(x => delete st.done[x]);
    save(LS_DAILY, st);
    at.daily = { day: d.day, k: d.k, streak: st.streak, best: st.best, rec };
  }
  function viewDaily() {
    const st = dailyState(); if (!DAILY_EX.some(x => x[0] === st.exam)) st.exam = 'neet';
    const k = st.exam, day = istDay(), doneToday = (st.done || {})[day] || {}, rec = doneToday[k], n = dailyStreakNow(st), anyToday = Object.keys(doneToday).length > 0;
    const hasAt = rec && attempts().some(a => a.id === rec.id);
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a>
      <h1>🔥 Daily 10</h1>
      <p class="muted small" style="margin-top:0">10 real previous-year questions every day. Everyone gets the same 10 today. New set at midnight (IST).</p>
      <section class="card daily-streak"><div class="ds-main"><span class="ds-fire" aria-hidden="true">🔥</span><span class="ds-n">${n}</span><span class="ds-l">day streak</span></div>
        <div class="ds-best">Best: <b>${st.best || 0}</b> day${(st.best || 0) === 1 ? '' : 's'}</div>
        <p class="small ds-msg">${anyToday ? "Today's done ✓ Come back tomorrow to keep your streak going." : n ? `Finish today's 10 to make it ${n + 1} days in a row.` : "Finish today's 10 to start your streak."}</p></section>
      <div class="label">Exam</div>
      <div class="chips" id="dEx">${DAILY_EX.map(([key, l]) => `<button class="chip" data-k="${key}" aria-pressed="${key === k}">${l}${doneToday[key] ? ' ✓' : ''}</button>`).join('')}</div>
      <section class="card daily-today">
        <div class="dt-head"><b>Today's 10 · ${esc(dailyLabel(k))}</b><span class="muted small">${esc(fmtDayLong(day))}</span></div>
        ${rec ? `<p class="dt-done">✓ Done today: <b>${rec.s}/${rec.m}</b> · ${rec.c}/10 correct</p>
          <div class="row">${hasAt ? `<a class="btn" href="#/result/${esc(rec.id)}" style="flex:1">View result</a>` : ''}<a class="btn wa" style="flex:1" target="_blank" rel="noopener noreferrer" href="${'https://wa.me/?text=' + encodeURIComponent(dailyShareText(rec, k, n))}">Share my Daily 10</a></div>`
        : `<p class="muted small" style="margin:6px 0 12px">10 questions from past ${esc(dailyLabel(k))} papers · real marking · review after.</p><button class="btn sx block" id="dGo">Start today's 10</button>`}
      </section>
      <p class="muted small">Wrong and unanswered ones go to <a href="#/mistakes">📒 My Mistakes</a> automatically.</p>
      ${siteFooter()}`;
    app.querySelectorAll('#dEx .chip').forEach(b => b.onclick = () => { const s2 = dailyState(); s2.exam = b.dataset.k; save(LS_DAILY, s2); viewDaily(); });
    const g = document.getElementById('dGo'); if (g) g.onclick = () => { const s2 = dailyState(); s2.exam = k; save(LS_DAILY, s2); dailyStart(k); };
  }


  /* ---------- 📚 Practice by chapter ----------
     data/chapters/<exam>.json (built by tools/build_chapters.py from the chapter tags):
     {exam, n, papers, subjects:[{s, n, ch:[[chapter, count, [[paperId,[qIndex...]],...]]...]} | {s, n, units:[{u, n, ch:[...]}]}]}
     qIndex = 0-based position in the paper file. Papers newest first. A practice set is at most 50 questions ("next set"). */
  const CHAP_EX = [['neet', 'NEET'], ['jee-main', 'JEE Main'], ['jee-adv', 'JEE Advanced'], ['cbse10', 'CBSE 10'], ['cbse12', 'CBSE 12'], ['nda', 'NDA']];
  const CHAP_SET = 50, LS_CHAP = 'sonexa.v1.chap';
  const chapLabel = k => (CHAP_EX.find(x => x[0] === k) || CHAP_EX[0])[1];
  const chapCache = {};
  async function chapData(k) {
    if (chapCache[k]) return chapCache[k];
    const r = await fetch('data/chapters/' + k + '.json'); if (!r.ok) throw new Error('chapters ' + r.status);
    return (chapCache[k] = await r.json());
  }
  function chapCardHtml() {
    return `<a class="tool-card chap" href="#/chapters"><span class="tool-ico" aria-hidden="true">📚</span><span class="tool-body"><span class="tool-title">Practice by chapter</span><span class="tool-note">All PYQs of one chapter, across years</span></span><span class="tool-go" aria-hidden="true">›</span></a>`;
  }
  const chapYears = refs => { const ys = refs.map(r => (meta(r[0]) || {}).year).filter(Boolean); if (!ys.length) return ''; const a = Math.min(...ys), b = Math.max(...ys); return a === b ? String(a) : a + '–' + b; };
  async function viewChapters() {
    const st = load(LS_CHAP, {}); if (!CHAP_EX.some(x => x[0] === st.k)) st.k = 'neet';
    const exChips = `<div class="label">Exam</div><div class="chips" id="cEx">${CHAP_EX.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${k === st.k}">${l}</button>`).join('')}</div>`;
    const head = `<a href="#/" class="backbtn">← ${t('back')}</a><h1>📚 Practice by chapter</h1>
      <p class="muted small" style="margin-top:0">All previous-year questions of one chapter, across years. Pick exam → subject → chapter.</p>`;
    app.innerHTML = head + exChips + `<p class="loading">${t('loading')}</p>`;
    const bindEx = () => app.querySelectorAll('#cEx .chip').forEach(b => b.onclick = () => { const s2 = load(LS_CHAP, {}); s2.k = b.dataset.k; save(LS_CHAP, s2); viewChapters(); });
    let D; try { D = await chapData(st.k); } catch (e) {
      if (!/^#\/chapters/.test(location.hash)) return;
      app.innerHTML = head + exChips + `<section class="card off-card"><p style="margin:0">${isOnline() ? 'Could not load the chapter list. Please try again.' : 'The chapter list needs internet the first time. Open it once online and it will work offline after that.'}</p></section>`;
      return bindEx();
    }
    if (!/^#\/chapters/.test(location.hash)) return;
    const subs = D.subjects; let S = subs.find(x => x.s === st.s) || subs[0]; st.s = S.s;
    let U = null; if (S.units) { U = S.units.find(x => x.u === st.u) || S.units[0]; st.u = U.u; }
    save(LS_CHAP, st);
    const list = U ? U.ch : S.ch, n = U ? U.n : S.n;
    app.innerHTML = head + exChips + `
      <div class="label">Subject</div><div class="chips" id="cSub">${subs.map(x => `<button class="chip" data-s="${esc(x.s)}" aria-pressed="${x.s === S.s}">${esc(x.s)} <span class="muted small">(${x.n})</span></button>`).join('')}</div>
      ${S.units ? `<div class="label">Section</div><div class="chips" id="cUnit">${S.units.map(x => `<button class="chip" data-u="${esc(x.u)}" aria-pressed="${x.u === U.u}">${esc(x.u)} <span class="muted small">(${x.n})</span></button>`).join('')}</div>` : ''}
      <h2>${esc(S.s)}${U ? ' · ' + esc(U.u) : ''} <span class="muted small">${list.length} chapters · ${n} questions</span></h2>
      <section class="card chap-list">${list.map((c, ci) => { const sets = Math.ceil(c[1] / CHAP_SET);
        return `<div class="chap-row"><div class="chap-info"><div class="chap-name">${esc(c[0])}</div><div class="meta">${c[1]} PYQ${c[1] === 1 ? '' : 's'}${chapYears(c[2]) ? ' · ' + chapYears(c[2]) : ''} · ${c[2].length} paper${c[2].length === 1 ? '' : 's'}</div>
          ${sets > 1 ? `<div class="chap-sets">${Array.from({ length: sets }, (_, k) => `<button type="button" class="chap-set" data-ci="${ci}" data-set="${k}">Set ${k + 1} <span class="muted">(${k * CHAP_SET + 1}–${Math.min(c[1], (k + 1) * CHAP_SET)})</span></button>`).join('')}</div>` : ''}</div>
          <button class="btn sx chap-go" data-ci="${ci}" data-set="0">Practice</button></div>`; }).join('')}</section>
      <p class="note">Questions are grouped using each question's text, so a few may sit in a nearby chapter. Up to ${CHAP_SET} questions per set. Wrong and unanswered ones go to <a href="#/mistakes">📒 My Mistakes</a>.</p>
      ${siteFooter()}`;
    bindEx();
    app.querySelectorAll('#cSub .chip').forEach(b => b.onclick = () => { const s2 = load(LS_CHAP, {}); s2.s = b.dataset.s; delete s2.u; save(LS_CHAP, s2); viewChapters(); });
    app.querySelectorAll('#cUnit .chip').forEach(b => b.onclick = () => { const s2 = load(LS_CHAP, {}); s2.u = b.dataset.u; save(LS_CHAP, s2); const y = window.scrollY; viewChapters().then(() => window.scrollTo(0, y)); });
    app.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => chapStart({ k: st.k, s: S.s, u: U ? U.u : null, c: list[+b.dataset.ci][0], set: +b.dataset.set }));
  }
  async function chapStart(o) {
    if (!confirmReplace()) return;
    let D; try { D = await chapData(o.k); } catch (e) { toast('The chapter list needs internet the first time.'); return; }
    const S = D.subjects.find(x => x.s === o.s);
    let c = null;
    if (S && S.units && !o.u) { // a chapter listed under several sections (e.g. NEET Biomolecules in Botany and Zoology): all of them
      const parts = S.units.map(U => U.ch.find(x => x[0] === o.c)).filter(Boolean);
      if (parts.length) c = [o.c, parts.reduce((n, x) => n + x[1], 0), parts.reduce((a, x) => a.concat(x[2]), [])];
    } else { const L = S ? (o.u && S.units ? (S.units.find(x => x.u === o.u) || {}).ch : S.ch) : null; c = (L || []).find(x => x[0] === o.c); }
    if (!c) { toast('Chapter not found.'); return; }
    const refs = []; c[2].forEach(([p, is]) => is.forEach(i => refs.push([p, i])));
    const sets = Math.ceil(refs.length / CHAP_SET), set = Math.min(Math.max(0, o.set || 0), sets - 1);
    const part = refs.slice(set * CHAP_SET, (set + 1) * CHAP_SET);
    const ids = [...new Set(part.map(r => r[0]))].filter(meta);
    await Promise.allSettled(ids.map(loadPaper));
    const qs = part.map(([p, i]) => papers[p] && papers[p].questions[i]).filter(q => q && q.answer && q.answer.length);
    if (!qs.length) { toast(isOnline() ? 'Could not load these questions. Please try again.' : 'These papers need internet. Save papers offline to practise without internet.'); return; }
    if (qs.length < part.length && ids.some(id => !papers[id])) toast(`${part.length - qs.length} question(s) skipped: their paper needs internet.`);
    const exs = [...new Set(qs.map(q => q.exam))];
    const mins = qs.reduce((s, q) => s + (((EXAMS[mxExamCls(q.exam)] || {}).minPerQ) || 1.5), 0);
    begin({ title: `${c[0]} · ${chapLabel(o.k)} PYQs${sets > 1 ? ` · Set ${set + 1}/${sets}` : ''}`, exam: exs.length === 1 ? exs[0] : exs[0], mode: 'chapter', qs,
      durationSec: Math.max(5, Math.ceil(mins)) * 60, rules: {}, extra: { chap: { k: o.k, s: o.s, u: o.u, c: c[0], set, sets, total: refs.length } } });
  }
  function chapResultCard(at) {
    const x = at.extra && at.extra.chap; if (!x) return '';
    const add = at.mx && at.mx.added, next = x.set + 1 < x.sets;
    return `<section class="card tool-result chap"><b>📚 ${esc(x.c)}</b><p class="small" style="margin:4px 0 10px">${esc(chapLabel(x.k))} · ${esc(x.s)}${x.sets > 1 ? ` · Set ${x.set + 1} of ${x.sets} (${x.total} PYQs)` : ` · ${x.total} PYQs`}${add ? ` · 📒 ${add} saved to My Mistakes` : ''}</p>
      <div class="row">${next ? `<button type="button" class="btn sx" id="chapNext" style="flex:1">Next set (${(x.set + 1) * CHAP_SET + 1}–${Math.min(x.total, (x.set + 2) * CHAP_SET)}) ›</button>` : ''}<a class="btn" href="#/chapters" style="flex:1">All chapters</a></div></section>`;
  }
  function sxBindModeCard(at) {
    const b = document.getElementById('chapNext'); const x = at.extra && at.extra.chap;
    if (b && x) b.onclick = () => chapStart({ k: x.k, s: x.s, u: x.u, c: x.c, set: x.set + 1 });
  }


  /* ---------- 🔍 Search ----------
     Papers (index), chapters (data/chapters/<exam>.json) and question text (data/search-<exam>.json: cleaned OCR text of
     image questions + typed text, ~180 chars each; built by tools/build_search.py). Indexes load only when someone searches
     and are then cached by sw.js (data/*), so search works offline afterwards. Matching: words in any order, partial words
     (prefix), one-letter typos for longer words; chapter/subject/exam/year words count too. */
  const SR_EX = [['all', 'All'], ['neet', 'NEET'], ['jee', 'JEE'], ['cbse10', 'CBSE 10'], ['cbse12', 'CBSE 12'], ['nda', 'NDA']];
  const SR_FILES = { neet: ['neet'], jee: ['jee-main', 'jee-adv'], cbse10: ['cbse10'], cbse12: ['cbse12'], nda: ['nda'] };
  const SR_ALLF = ['neet', 'jee-main', 'jee-adv', 'cbse10', 'cbse12', 'nda'];
  const SR_FLABEL = { neet: 'NEET', 'jee-main': 'JEE Main', 'jee-adv': 'JEE Advanced', cbse10: 'CBSE 10', cbse12: 'CBSE 12', nda: 'NDA' };
  const SR_STOP = new Set(['the', 'of', 'a', 'an', 'in', 'and', 'is', 'to', 'for', 'on', 'with', 'by', 'at', 'as', 'or', 'which', 'what', 'are', 'be', 'from', 'that', 'this', 'following', 'question', 'questions']);
  const srState = { q: '', ex: 'all', sub: '', restore: false, hits: [], more: 30 };
  const srCache = {};
  const srNorm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const srToks = s => srNorm(s).split(/[^a-z0-9]+/).filter(Boolean);
  const SR_SUF = ['ations', 'ation', 'itions', 'ition', 'ions', 'ion', 'ings', 'ing', 'als', 'al', 'ies', 'es', 'ed', 's', 'ly', 'ic', 'y'];
  const srStem = w => { if (/^\d/.test(w)) return w; for (const x of SR_SUF) if (w.length - x.length >= 4 && w.endsWith(x)) return w.slice(0, -x.length); return w; };
  const srFileOf = p => p.exam === 'NEET' ? 'neet' : p.exam === 'JEE Main' ? 'jee-main' : p.exam === 'JEE Advanced' ? 'jee-adv' : p.exam === 'NDA' ? 'nda' : 'cbse' + p.class;
  async function srLoad(f) {
    if (srCache[f]) return srCache[f];
    const r = await fetch('data/search-' + f + '.json'); if (!r.ok) throw new Error('search ' + r.status);
    const E = await r.json();
    const items = E.q.map(([pi, qi, si, ci, text]) => { const p = E.papers[pi], sub = E.subs[si] || '', chap = E.chs[ci] || '';
      const toks = srToks(text), mtoks = srToks(`${chap} ${sub} ${E.exam} ${p[2] || ''} ${p[1]}`);
      return { pid: p[0], title: p[1], year: p[2], qi, sub, chap, text, exam: E.exam, f, toks, mtoks, stoks: toks.map(srStem), smtoks: mtoks.map(srStem) }; });
    return (srCache[f] = { E, items });
  }
  function lev1(a, b) { // edit distance <= 1
    if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
    return d + (la - i) + (lb - j) <= 1;
  }
  function tokScore(qt, toks, stoks) {
    let best = 0; const num = /^\d+$/.test(qt), qs = srStem(qt), useStem = qs.length >= 4 && qs !== qt;
    for (let k = 0; k < toks.length; k++) {
      const w = toks[k];
      if (w === qt) return 3;
      if (num) continue;
      if (qt.length >= 2 && w.startsWith(qt)) { best = 2; continue; }
      if (best < 1.5 && useStem && (stoks ? stoks[k] : srStem(w)).startsWith(qs)) { best = 1.5; continue; }
      if (best < 1 && qt.length >= 5 && (w.startsWith(qt.slice(0, -1)) || lev1(w, qt))) best = 1;
    }
    return best;
  }
  function srQuery(q) { const all = srToks(q); const t2 = all.filter(x => !SR_STOP.has(x)); return t2.length ? t2 : all; }
  function srScoreItem(it, qts, phrase) {
    let s = 0;
    for (const qt of qts) { const a = tokScore(qt, it.toks, it.stoks), b = tokScore(qt, it.mtoks, it.smtoks) * 0.7; const m = Math.max(a, b); if (!m) return 0; s += m; }
    if (phrase && srNorm(it.text).includes(phrase)) s += 3;
    return s;
  }
  function srFiles() { return srState.ex === 'all' ? SR_ALLF : SR_FILES[srState.ex] || SR_ALLF; }
  const srPaperOk = p => srState.ex === 'all' || SR_FILES[srState.ex].includes(srFileOf(p));
  function srMarkText(text, qts) {
    const words = String(text).split(/(\s+)/); let first = -1;
    const out = words.map((w, k) => { const n = srNorm(w).replace(/[^a-z0-9]/g, ''); if (n && qts.some(qt => n === qt || (!/^\d+$/.test(qt) && qt.length >= 2 && n.startsWith(qt)) || (srStem(qt).length >= 4 && srStem(qt) !== qt && srStem(n).startsWith(srStem(qt))) || (qt.length >= 5 && (n.startsWith(qt.slice(0, -1)) || lev1(n, qt))))) { if (first < 0) first = k; return `<mark>${esc(w)}</mark>`; } return esc(w); });
    let a = 0, b = out.length; const len = i => words.slice(a, i).join('').length;
    if (String(text).length > 150 && first > 0) { a = Math.max(0, first - 12); while (a < first && len(first) > 60) a++; }
    let s = out.slice(a, b).join(''); return (a > 0 ? '… ' : '') + s;
  }
  async function srRun() {
    const q = srState.q.trim(), qts = srQuery(q);
    if (!qts.length) return { q, qts, papers: [], chaps: [], hits: [], subs: [] };
    const phrase = qts.length > 1 ? srNorm(qts.join(' ')) : '';
    // papers
    const papersHit = INDEX.filter(srPaperOk).map(p => { const toks = srToks(`${p.title} ${p.exam} ${p.year || ''} ${p.class ? 'class ' + p.class + ' cbse ' + p.class : ''} ${Object.keys(p.bySubject || {}).join(' ')} ${p.shareTitle || ''}`);
      let s = 0; for (const qt of qts) { const m = tokScore(qt, toks); if (m < 2) return null; s += m; } return { p, s }; }).filter(Boolean).sort((x, y) => y.s - x.s || (y.p.year || 0) - (x.p.year || 0)).map(x => x.p);
    // chapters + questions
    const files = srFiles(); const loaded = []; let failed = 0;
    await Promise.all(files.map(async f => { try { loaded.push([f, await srLoad(f)]); } catch (e) { failed++; } }));
    const chapsets = await Promise.all(files.map(f => chapData(f).then(D => [f, D]).catch(() => null)));
    const chaps = [];
    chapsets.filter(Boolean).forEach(([f, D]) => D.subjects.forEach(S => (S.units ? S.units.map(U => [U.u, U.ch]) : [[null, S.ch]]).forEach(([u, list]) => list.forEach(c => {
      const toks = srToks(`${c[0]} ${S.s} ${u || ''} ${SR_FLABEL[f]}`); let s = 0;
      for (const qt of qts) { const m = tokScore(qt, toks); if (!m) return; s += m; }
      chaps.push({ f, s: S.s, u, c: c[0], n: c[1], score: s + (srNorm(c[0]).includes(phrase || qts[0]) ? 3 : 0) });
    }))));
    chaps.sort((x, y) => y.score - x.score || y.n - x.n);
    let hits = [];
    loaded.forEach(([f, L]) => L.items.forEach(it => { const s = srScoreItem(it, qts, phrase); if (s) hits.push({ it, s }); }));
    hits.sort((x, y) => y.s - x.s || (y.it.year || 0) - (x.it.year || 0));
    const subCount = {}; hits.forEach(h => { subCount[h.it.sub] = (subCount[h.it.sub] || 0) + 1; });
    const subs = Object.entries(subCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (srState.sub && !subCount[srState.sub]) srState.sub = '';
    if (srState.sub) { hits = hits.filter(h => h.it.sub === srState.sub); }
    const chapsF = srState.sub ? chaps.filter(c => c.s === srState.sub) : chaps;
    return { q, qts, papers: papersHit, chaps: chapsF, hits: hits.map(h => h.it), subs, failed, nfiles: files.length };
  }
  function srBoxHtml(where) {
    return `<form class="sr-box ${where}" role="search" onsubmit="return false"><span class="sr-ico" aria-hidden="true">🔍</span><input id="srIn" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search papers, chapters, questions…" aria-label="Search" value="${esc(srState.q)}"><button type="button" class="sr-clear" id="srClear" aria-label="Clear search" ${srState.q ? '' : 'hidden'}>✕</button></form>`;
  }
  let srTimer = null, srSeq = 0;
  function srBind(where) {
    const inp = document.getElementById('srIn'), clr = document.getElementById('srClear'), res = document.getElementById('srRes'); if (!inp || !res) return;
    const rest = app.querySelector('.home-rest');
    const run = async () => {
      const my = ++srSeq; srState.q = inp.value; clr.hidden = !inp.value;
      if (rest) rest.hidden = !!inp.value.trim();
      if (!inp.value.trim()) { res.innerHTML = where === 'page' ? `<p class="muted small sr-hint">Try “photosynthesis”, “ray optics”, “NEET 2023” or “integration”.</p>` : ''; srState.hits = []; return; }
      res.innerHTML = `<p class="loading small">Searching…</p>`;
      const R = await srRun(); if (my !== srSeq) return;
      srState.hits = R.hits; srRender(res, R, where);
    };
    inp.oninput = () => { clearTimeout(srTimer); srState.more = 30; srTimer = setTimeout(run, 220); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(srTimer); run(); inp.blur(); } };
    clr.onclick = () => { inp.value = ''; srState.q = ''; srState.sub = ''; run(); inp.focus(); };
    srBind.rerun = run;
    if (inp.value.trim() || where === 'page') run();
  }
  function srRender(res, R, where) {
    const qts = R.qts, nH = R.hits.length, show = R.hits.slice(0, srState.more);
    const exChips = `<div class="chips sr-chips" id="srEx">${SR_EX.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${srState.ex === k}">${l}</button>`).join('')}</div>`;
    const subChips = R.subs.length > 1 || srState.sub ? `<div class="chips sr-chips" id="srSub"><button class="chip" data-s="" aria-pressed="${!srState.sub}">All subjects</button>${R.subs.map(([s, n]) => `<button class="chip" data-s="${esc(s)}" aria-pressed="${srState.sub === s}">${esc(s)} <span class="muted small">(${n})</span></button>`).join('')}</div>` : '';
    const papersH = R.papers.slice(0, 8).map(p => `<div class="paper sr-paper"><div><div style="font-weight:700">${srMarkText(p.title, qts)}</div><div class="meta">${esc(p.exam === 'CBSE' ? 'CBSE ' + p.class : p.exam)} · ${p.count} ${t('questions')}${p.minutes ? ' · ' + p.minutes + ' ' + t('min') : ''}</div></div>${startBtn(p, mxExamCls(p.exam))}</div>`).join('');
    const chapsH = R.chaps.slice(0, 10).map((c, k) => `<div class="chap-row sr-chap"><div class="chap-info"><div class="chap-name">${srMarkText(c.c, qts)}</div><div class="meta">${esc(SR_FLABEL[c.f])} · ${esc(c.s)}${c.u && c.u !== c.s ? ' · ' + esc(c.u) : ''} · ${c.n} PYQ${c.n === 1 ? '' : 's'}</div></div><button class="btn sx chap-go" data-sc="${k}">Practice</button></div>`).join('');
    const qH = show.map((it, k) => `<button type="button" class="sr-q" data-qi="${k}"><span class="sr-qsrc">${esc(it.exam)} · ${esc(it.title)}</span><span class="sr-qch">${esc(it.chap || '')}${it.sub ? ' · ' + esc(it.sub) : ''}</span><span class="sr-qtxt">${it.text ? srMarkText(it.text, qts) : '<span class="muted">(question is a picture)</span>'}</span></button>`).join('');
    res.innerHTML = `${exChips}${subChips}
      ${R.failed ? `<p class="small sr-warn">${isOnline() ? 'Some results could not load. Please try again.' : `Offline: question search works for exams you have searched once online (${R.nfiles - R.failed} of ${R.nfiles} ready).`}</p>` : ''}
      ${!R.papers.length && !R.chaps.length && !nH ? `<p class="muted sr-none">No results for “${esc(R.q)}”. Try fewer or shorter words.</p>` : ''}
      ${R.papers.length ? `<h2 class="sr-h">Papers <span class="muted small">(${R.papers.length})</span></h2><section class="card">${papersH}</section>` : ''}
      ${R.chaps.length ? `<h2 class="sr-h">Chapters <span class="muted small">(${R.chaps.length})</span></h2><section class="card chap-list">${chapsH}</section>` : ''}
      ${nH ? `<h2 class="sr-h">Questions <span class="muted small">(${nH})</span></h2>
        <button class="btn sx block" id="srPractice">Practice all results <span class="small">(${Math.min(50, nH)} question${Math.min(50, nH) === 1 ? '' : 's'})</span></button>
        <div class="sr-qs">${qH}</div>${nH > show.length ? `<button class="btn block" id="srMore">Show more (${nH - show.length} left)</button>` : ''}` : ''}
      <p class="muted small sr-note">Results from scanned text may miss some questions.</p>`;
    res.querySelectorAll('#srEx .chip').forEach(b => b.onclick = () => { srState.ex = b.dataset.k; srState.sub = ''; srState.more = 30; srBind.rerun && srBind.rerun(); });
    res.querySelectorAll('#srSub .chip').forEach(b => b.onclick = () => { srState.sub = b.dataset.s; srState.more = 30; srBind.rerun && srBind.rerun(); });
    res.querySelectorAll('[data-full]').forEach(b => b.onclick = () => startFull(b.dataset.full));
    res.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { const c = R.chaps[+b.dataset.sc]; chapStart({ k: c.f, s: c.s, u: c.u, c: c.c, set: 0 }); });
    res.querySelectorAll('[data-qi]').forEach(b => b.onclick = () => { const it = show[+b.dataset.qi]; srState.restore = where === 'home'; go('#/q/' + encodeURIComponent(it.pid) + '/' + it.qi); });
    const pr = document.getElementById('srPractice'); if (pr) pr.onclick = () => srPractice(R);
    const mo = document.getElementById('srMore'); if (mo) mo.onclick = () => { srState.more += 30; srRender(res, R, where); };
  }
  async function srPractice(R) {
    if (!confirmReplace()) return;
    const top = R.hits.slice(0, 50); const ids = [...new Set(top.map(h => h.pid))].filter(meta);
    await Promise.allSettled(ids.map(loadPaper));
    const qs = top.map(h => papers[h.pid] && papers[h.pid].questions[h.qi]).filter(q => q && q.answer && q.answer.length);
    if (!qs.length) { toast(isOnline() ? 'Could not load these questions. Please try again.' : 'These papers need internet. Save papers offline to practise without internet.'); return; }
    const exs = [...new Set(qs.map(q => q.exam))];
    const mins = qs.reduce((s, q) => s + (((EXAMS[mxExamCls(q.exam)] || {}).minPerQ) || 1.5), 0);
    const qq = R.q.trim().slice(0, 30);
    begin({ title: `Search “${qq}” · ${qs.length} questions`, exam: exs.length === 1 ? exs[0] : 'Mixed', mode: 'search', qs, durationSec: Math.max(5, Math.ceil(mins)) * 60, rules: {} });
  }
  function viewSearch() {
    app.innerHTML = `<a href="#/" class="backbtn">← ${t('back')}</a><h1>🔍 Search</h1>${srBoxHtml('page')}<div id="srRes"></div>${siteFooter()}`;
    srBind('page');
    const inp = document.getElementById('srIn'); if (inp && !srState.q) try { inp.focus(); } catch (e) { /* ignore */ }
  }
  function srHomeBar() {
    const keep = srState.restore; srState.restore = false; if (!keep) { srState.q = ''; srState.sub = ''; }
    return `${srBoxHtml('home')}<div id="srRes"></div>`;
  }
  // One question on its own: answer, Check, see the correct answer (opened from a search result).
  async function viewQ(pid, i) {
    i = +i; app.innerHTML = `<p class="loading">${t('loading')}</p>`;
    let P; try { P = await loadPaper(pid); } catch (e) { app.innerHTML = `<a href="#/search" class="backbtn">← ${t('back')}</a><section class="card off-card"><p style="margin:0">This question's paper needs internet. Save papers offline to use them without internet.</p></section>`; return; }
    const q = P.questions[i]; if (!q) return go('#/search', true);
    const pos = srState.hits.findIndex(h => h.pid === pid && h.qi === i), next = pos >= 0 ? srState.hits[pos + 1] : null;
    const cinfo = (srState.hits[pos] || {}).chap || '';
    let ans = null, checked = false;
    const render = () => {
      const showQl = paperHasHi(pid); const correct = q.answer.map(v => mxLabel(q, v)).join(' or ');
      let opts;
      if (q.type === 'numerical') opts = `<div class="numin"><input id="numIn" inputmode="decimal" autocomplete="off" placeholder="${t('enterAnswer')}" aria-label="${t('enterAnswer')}" value="${ans != null ? esc(ans) : ''}" ${checked ? 'disabled' : ''}></div>`;
      else opts = `<div class="opts ${q.optionsInImage ? 'grid4' : ''}" role="radiogroup">${q.options.map((o, k) => { const v = String(k + 1), isC = checked && q.answer.includes(v), isW = checked && String(ans) === v && !isC;
        return `<button class="opt${isC ? ' sq-right' : ''}${isW ? ' sq-wrong' : ''}" role="radio" aria-checked="${String(ans) === v}" data-v="${v}" ${checked ? 'disabled' : ''}><span class="k">${esc(q.optionsInImage ? optLabel(q, k) : (optLabels(q) ? optLabel(q, k) : k + 1))}</span><span class="ot">${q.optionsInImage ? t('option') + ' ' + esc(optLabel(q, k)) : fmtText(o)}</span></button>`; }).join('')}</div>`;
      let verdict = '';
      if (checked) { const r = PYQScoring.score([q], { [q.id]: ans }, { marking: { [pid]: (meta(pid) || {}).marking || {} }, rules: {} }); const st = r.perQ[q.id];
        verdict = `<section class="card sq-verdict ${st === 'correct' ? 'ok' : 'bad'}"><b>${st === 'correct' ? '✓ Correct!' : ans == null || ans === '' ? 'Not answered' : '✗ Not quite'}</b><div class="small">${t('correctAnswer')}: <b>${esc(correct)}</b></div>${q.explanation ? `<div class="expl small"><b>${t('explanation')}:</b> ${fmtText(q.explanation)}</div>` : ''}${st !== 'correct' ? '<div class="muted small">Saved to 📒 My Mistakes.</div>' : ''}</section>`; }
      app.innerHTML = `<a href="#/search" class="backbtn">← ${t('back')}</a>
        <h1 class="sq-h">Practice question</h1>
        <p class="muted small" style="margin-top:0">${esc(q.exam)} · ${esc(q.paper)} · Q${esc(mxQno(q))}${cinfo ? ' · ' + esc(cinfo) : ''}</p>
        <section class="card sq-card">${showQl ? `<div class="qlang-row">${qlangToggle()}</div>${qlangNote(q)}` : ''}
          <div class="qbody">${qImg(q) ? `<img src="${qImg(q)}" alt="Question" id="qimg">` : ''}${qTxt(q) ? `<div class="qtext"${qlang === 'hi' && q.questionHi ? ' lang="hi"' : ''}>${fmtText(qTxt(q))}</div>` : ''}</div>
          ${opts}
          ${checked ? '' : `<button class="btn sx block" id="sqCheck">Check answer</button>`}<button type="button" class="fb-q" id="fbQ">⚑ Report a problem with this question</button></section>
        ${verdict}
        <div class="row">${next ? `<button class="btn primary" id="sqNext" style="flex:1">Next result ›</button>` : ''}<a class="btn" href="#/search" style="flex:1">All results</a></div>`;
      math(app);
      app.querySelectorAll('.opt').forEach(b => b.onclick = () => { if (checked) return; ans = b.dataset.v; app.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', x === b)); });
      const ni = document.getElementById('numIn'); if (ni) ni.oninput = () => { ans = ni.value.trim() || null; };
      const img = document.getElementById('qimg'); if (img) img.onclick = () => { const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = `<button class="btn primary">${t('close')}</button><img src="${qImg(q)}" alt="">`; z.querySelector('button').onclick = () => z.remove(); document.body.appendChild(z); };
      if (showQl) bindQlang(app.querySelector('.sq-card'), render);
      document.getElementById('fbQ').onclick = () => fbOpen({ kind: 'question', pid, qno: mxQno(q), title: q.paper });
      const ck = document.getElementById('sqCheck'); if (ck) ck.onclick = () => {
        checked = true;
        try { const r = PYQScoring.score([q], { [q.id]: ans }, { marking: { [pid]: (meta(pid) || {}).marking || {} }, rules: {} }); mxRecord({ finishedAt: Date.now(), mode: 'single', answers: { [q.id]: ans } }, [q], r); bnavRender('q'); } catch (e) { /* ignore */ }
        render();
      };
      const nx = document.getElementById('sqNext'); if (nx) nx.onclick = () => go('#/q/' + encodeURIComponent(next.pid) + '/' + next.qi, true);
    };
    render();
  }


  /* ---------- bottom tab bar (app style): Home · Daily 10 · Chapters · Search · Mistakes ----------
     Filled on every route; hidden during a running test (body.testing). Mistakes shows the to-fix count, Daily 10 a dot
     when today's 10 isn't done yet. */
  function bnavRender(a) {
    const nav = document.getElementById('bnav'); if (!nav) return;
    const cur = a === 'daily' ? 'daily' : a === 'chapters' ? 'chapters' : (a === 'search' || a === 'q') ? 'search' : a === 'mistakes' ? 'mistakes' : (!a || a === 'exam') ? 'home' : '';
    let nmx = 0, dailyDot = false;
    try { nmx = mxActive().length; const st = dailyState(); dailyDot = !Object.keys((st.done || {})[istDay()] || {}).length; } catch (e) { /* ignore */ }
    const tab = (k, href, ico, label, extra) => `<a href="${href}" class="bn-tab${cur === k ? ' on' : ''}" data-tab="${k}"${cur === k ? ' aria-current="page"' : ''}><span class="bn-ico" aria-hidden="true">${ico}${extra || ''}</span><span class="bn-l">${label}</span></a>`;
    nav.innerHTML = tab('home', '#/', '🏠', 'Home') + tab('daily', '#/daily', '🔥', 'Daily 10', dailyDot ? '<i class="bn-dot" aria-label="not done today"></i>' : '')
      + tab('chapters', '#/chapters', '📚', 'Chapters') + tab('search', '#/search', '🔍', 'Search')
      + tab('mistakes', '#/mistakes', '📒', 'Mistakes', nmx ? `<b class="bn-badge" aria-label="${nmx} to fix">${nmx > 999 ? '999+' : nmx}</b>` : '');
    nav.hidden = false;
  }


  /* ---------- 💬 Feedback ----------
     A simple form (rating 1-5 optional, message required, name/contact optional) + auto context (page, paper, question,
     app or browser, Hindi on/off). No backend: posted to the FormSubmit.co AJAX endpoint for the site's contact email
     (the first submission makes FormSubmit mail an "Activate form" link to that inbox). Anything not confirmed as sent
     (offline, error, form not activated yet) waits in localStorage sonexa.v1.fbQueue and is retried on load / when online. */
  const LS_FBQ = 'sonexa.v1.fbQueue';
  const fbEndpoint = () => 'https://formsubmit.co/ajax/' + encodeURIComponent(t('contactEmail'));
  async function fbPost(p) {
    try {
      const r = await fetch(fbEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(p) });
      if (!r.ok) return { ok: false, net: true };
      let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
      return { ok: String(j.success) === 'true', net: true };
    } catch (e) { return { ok: false, net: false }; }
  }
  let fbFlushing = false;
  async function fbFlush() {
    if (fbFlushing || !isOnline()) return; fbFlushing = true;
    try {
      const q = load(LS_FBQ, []); if (!q.length) return;
      const keep = [], now = Date.now();
      for (const e of q) {
        const it = e && e.p ? e : { p: e, t: 0, n: 0 };
        if (it.t && now - it.t < 12 * 3600e3) { keep.push(it); continue; }   // reached the server before: retry at most twice a day
        const r = await fbPost(Object.assign({}, it.p, { _queued: 'yes' }));
        if (!r.ok) { if (r.net) { it.t = now; it.n = (it.n || 0) + 1; } if (it.n < 5) keep.push(it); }
      }
      const cur = load(LS_FBQ, []); save(LS_FBQ, keep.concat(cur.slice(q.length)).slice(-20));
    } finally { fbFlushing = false; }
  }
  window.addEventListener('online', () => setTimeout(fbFlush, 1500));
  setTimeout(fbFlush, 6000);
  function fbOpen(ctx) {
    ctx = ctx || {};
    const isQ = ctx.kind === 'question';
    const bg = document.createElement('div'); bg.className = 'sheet-bg mid fb-bg';
    const where = isQ ? `${esc(ctx.title || ctx.pid || '')} · Q${esc(ctx.qno)}` : ctx.title ? esc(ctx.title) : '';
    bg.innerHTML = `<form class="sheet center fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fbTitle" novalidate>
      <h2 id="fbTitle">${isQ ? '⚑ Report a problem' : ctx.kind === 'test' ? '💬 How was this test?' : '💬 Send feedback'}</h2>
      ${where ? `<p class="muted small fb-where">${where}</p>` : ''}
      <div class="fb-stars" role="radiogroup" aria-label="Rating (optional)">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="fb-star" data-r="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}<span class="muted small fb-opt">optional</span></div>
      ${isQ ? `<div class="chips fb-chips">${['Wrong answer', 'Image unclear / cut', 'Hindi version wrong', 'Wrong chapter', 'Other'].map(x => `<button type="button" class="chip" data-fc="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      <label for="fbMsg">Message</label>
      <textarea id="fbMsg" rows="4" maxlength="1500" required placeholder="${isQ ? 'What is wrong with this question?' : 'Tell us what you like, what is broken, or what to add…'}"></textarea>
      <div class="fb-two"><div><label for="fbName">Name <span class="muted small">(optional)</span></label><input id="fbName" type="text" maxlength="60" autocomplete="name"></div>
        <div><label for="fbContact">Phone or email <span class="muted small">(optional)</span></label><input id="fbContact" type="text" maxlength="80" autocomplete="email" inputmode="email"></div></div>
      <p class="fb-err small" hidden>Please write a message.</p>
      <div class="row"><button type="button" class="btn" data-x style="flex:1">Cancel</button><button type="submit" class="btn sx" style="flex:1.4">Send</button></div>
    </form>`;
    document.body.appendChild(bg);
    let rating = 0;
    const form = bg.querySelector('form'), msg = bg.querySelector('#fbMsg'), err = bg.querySelector('.fb-err');
    const close = () => bg.remove();
    bg.querySelector('[data-x]').onclick = close;
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    bg.querySelectorAll('.fb-star').forEach(b => b.onclick = () => { rating = +b.dataset.r === rating ? 0 : +b.dataset.r; bg.querySelectorAll('.fb-star').forEach(x => { const on = +x.dataset.r <= rating; x.classList.toggle('on', on); x.setAttribute('aria-checked', +x.dataset.r === rating); }); });
    bg.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => { bg.querySelectorAll('[data-fc]').forEach(x => x.setAttribute('aria-pressed', x === b)); if (!msg.value.trim() || bg.querySelector('[data-fc][data-used]')) { msg.value = b.dataset.fc + ': '; bg.querySelectorAll('[data-fc]').forEach(x => x.removeAttribute('data-used')); b.setAttribute('data-used', '1'); } msg.focus(); });
    msg.oninput = () => { err.hidden = true; };
    setTimeout(() => { try { msg.focus(); } catch (e) { /* ignore */ } }, 50);
    form.onsubmit = async e => {
      e.preventDefault();
      const text = msg.value.trim(); if (!text || (isQ && /^[^:]{0,40}:\s*$/.test(text))) { err.hidden = false; msg.focus(); return; }
      const page = (location.pathname + location.hash).replace(/\?.*$/, '');
      const p = { _subject: `SONEXA ${isQ ? 'question report' : 'feedback'}${rating ? ' ' + '★'.repeat(rating) : ''}${ctx.pid ? ' · ' + ctx.pid + (ctx.qno ? ' Q' + ctx.qno : '') : ''}`, _template: 'table', _captcha: 'false',
        type: isQ ? 'Question report' : ctx.kind === 'test' ? 'Test feedback' : 'General feedback', rating: rating ? rating + '/5' : 'not given', message: text,
        name: bg.querySelector('#fbName').value.trim() || '-', contact: bg.querySelector('#fbContact').value.trim() || '-',
        page, paper: ctx.pid || '-', question: ctx.qno ? 'Q' + ctx.qno : '-', paper_title: ctx.title || '-', score: ctx.score || '-',
        device: IN_APP ? 'Android app' : (IS_IOS ? 'iPhone/iPad browser' : 'browser'), hindi: qlang === 'hi' ? 'on' : 'off', site: location.host, sent_at: new Date().toISOString(), ua: (navigator.userAgent || '').slice(0, 180) };
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      let r = { ok: false, net: false };
      if (isOnline()) r = await fbPost(p);
      if (!r.ok) { const q = load(LS_FBQ, []); q.push({ p, t: r.net ? Date.now() : 0, n: r.net ? 1 : 0 }); save(LS_FBQ, q.slice(-20)); }
      form.innerHTML = `<div class="fb-done"><div class="fb-done-ico">✅</div><h2>${r.net ? 'Thanks! Feedback sent ✅' : 'Saved ✅'}</h2><p class="muted small">${r.net ? 'Thank you for helping make SONEXA better.' : (isOnline() ? 'Could not reach the server. It will be sent automatically later.' : 'You are offline. It will be sent automatically when you are back online.')}</p><button type="button" class="btn sx block" data-x>Done</button></div>`;
      form.querySelector('[data-x]').onclick = close;
      setTimeout(() => { if (bg.isConnected) close(); }, 4000);
    };
  }


  /* ---------- "Update ready" bar (a new version arrived during a running test; index.html calls this) ---------- */
  window.sxUpdateReady = function () {
    if (document.getElementById('sxUpd')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'sxUpd'; b.className = 'sx-upd'; b.textContent = 'Update ready – tap to refresh';
    b.onclick = () => location.reload(); document.body.appendChild(b);
  };


  /* ---------- deep links from the static (SEO) pages ----------
     #/start/<paperId>  -> that paper's exam list, then starts the paper (back from the test lands on the list, never loops)
     #/practice/<chapterFile>/<subject>/<unit>/<chapter>  -> chapter list, then starts that chapter's set 1 */
  const examRouteOf = m => !m ? '#/' : m.exam === 'CBSE' ? '#/exam/cbse/' + m.class : '#/exam/' + mxExamCls(m.exam);
  function sxDeepStart(id) {
    const m = meta(id); history.replaceState({ sx: curDepth() ?? 0 }, '', examRouteOf(m)); route();
    if (m) setTimeout(() => startFull(id), 50);
  }
  function sxDeepPractice(k, s, u, c) {
    const s2 = load(LS_CHAP, {}); s2.k = k; s2.s = s; if (u) s2.u = u; else delete s2.u; save(LS_CHAP, s2);
    history.replaceState({ sx: curDepth() ?? 0 }, '', '#/chapters'); route();
    setTimeout(() => chapStart({ k, s, u: u || null, c, set: 0 }), 50);
  }

  /* ---------- language toggle (Hindi strings can be filled in strings.js) ---------- */
  offPill();
  const lb = document.getElementById('langBtn');
  if (STR.hi && Object.keys(STR.hi).length) { lb.hidden = false; lb.textContent = lang === 'hi' ? 'English' : 'हिंदी'; lb.onclick = () => { lang = lang === 'hi' ? 'en' : 'hi'; localStorage.setItem(LS.lang, lang); lb.textContent = lang === 'hi' ? 'English' : 'हिंदी'; route(); }; }

  route();
})();
