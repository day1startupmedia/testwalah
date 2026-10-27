/* Marking rules, shared by the site and the tests (node). */
(function (root) {
  function isNum(s) { return s !== null && s !== undefined && String(s).trim() !== '' && !isNaN(Number(String(s).trim())); }
  // Is a response correct? q.answer is a list of accepted values.
  function isCorrect(q, resp) {
    if (resp === null || resp === undefined || String(resp).trim() === '') return false;
    if (q.type === 'numerical') {
      if (!isNum(resp)) return false;
      const v = Number(String(resp).trim());
      return q.answer.some(a => {
        const r = String(a).match(/^\s*(-?[\d.]+)\s*(?:to|-|–)\s*(-?[\d.]+)\s*$/);
        if (r) return v >= Number(r[1]) - 1e-9 && v <= Number(r[2]) + 1e-9;
        return isNum(a) && Math.abs(Number(a) - v) < 1e-6;
      });
    }
    return q.answer.map(String).includes(String(resp));
  }
  // marking: {mcq:[+4,-1], numerical:[+4,0]}
  function marksFor(q, marking) {
    const m = (marking && marking[q.type]) || (q.type === 'numerical' ? [4, 0] : [4, -1]);
    return { right: m[0], wrong: m[1] };
  }
  // Which responses count. NEET 2024 rule: in each subject's Section B only the first 10 answered (by question number) count.
  function countedIds(questions, answers, rules) {
    const counted = new Set(questions.map(q => q.id));
    const max = rules && rules.sectionBAttemptMax;
    if (!max) return counted;
    const seen = {};
    for (const q of questions) {
      if (q.part !== 'B') continue;
      const key = q.paperId + '|' + (q.section || q.subject);
      const a = answers[q.id];
      if (a === null || a === undefined || a === '') { counted.delete(q.id); continue; }
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] > max) counted.delete(q.id);
    }
    return counted;
  }
  // Score a test. questions: [{id, type, answer, subject, part, section, paperId}], answers: {id: response}
  function score(questions, answers, opts) {
    opts = opts || {};
    const marking = opts.marking || {};
    const rules = opts.rules || {};
    const counted = countedIds(questions, answers, rules);
    const res = { score: 0, max: 0, correct: 0, wrong: 0, skipped: 0, notCounted: 0, bySubject: {}, perQ: {} };
    // max marks: NEET 2024 full paper counts 45 of 50 per subject
    const sectionBTotals = {};
    for (const q of questions) {
      const mk = marksFor(q, marking[q.paperId] || marking);
      const s = res.bySubject[q.subject] || (res.bySubject[q.subject] = { total: 0, attempted: 0, correct: 0, wrong: 0, skipped: 0, score: 0, max: 0 });
      s.total++;
      let countsForMax = true;
      if (rules.sectionBAttemptMax && q.part === 'B') {
        const key = q.paperId + '|' + (q.section || q.subject);
        sectionBTotals[key] = (sectionBTotals[key] || 0) + 1;
        if (sectionBTotals[key] > rules.sectionBAttemptMax) countsForMax = false;
      }
      if (countsForMax) { res.max += mk.right; s.max += mk.right; }
      const a = answers[q.id];
      const answered = !(a === null || a === undefined || String(a).trim() === '');
      if (!answered) { res.skipped++; s.skipped++; res.perQ[q.id] = 'skipped'; continue; }
      if (!counted.has(q.id)) { res.notCounted++; s.skipped++; res.perQ[q.id] = 'not-counted'; continue; }
      s.attempted++;
      if (isCorrect(q, a)) { res.correct++; s.correct++; res.score += mk.right; s.score += mk.right; res.perQ[q.id] = 'correct'; }
      else { res.wrong++; s.wrong++; res.score += mk.wrong; s.score += mk.wrong; res.perQ[q.id] = 'wrong'; }
    }
    // fractional marking (NDA +2.5/−0.83): round to 2 decimals so 6.67 never shows as 6.669999…; integers are unchanged
    const r2 = x => Math.round(x * 100) / 100;
    res.score = r2(res.score); res.max = r2(res.max);
    for (const k in res.bySubject) { res.bySubject[k].score = r2(res.bySubject[k].score); res.bySubject[k].max = r2(res.bySubject[k].max); }
    const att = res.correct + res.wrong;
    res.accuracy = att ? Math.round((res.correct / att) * 1000) / 10 : 0;
    return res;
  }
  const api = { isCorrect, marksFor, score, countedIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PYQScoring = api;
})(typeof window !== 'undefined' ? window : this);
