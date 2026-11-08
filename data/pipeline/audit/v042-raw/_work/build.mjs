import { readFileSync, writeFileSync } from 'node:fs';
const items = JSON.parse(readFileSync('data/minigame/ox/items.json', 'utf8')).items;
const P = ['kr','hs','sc','tm','ar','sp','lf'];
const J = {}; const IN = {};
for (const p of P) { Object.assign(J, JSON.parse(readFileSync(`data/pipeline/audit/v042-raw/_work/out/${p}.json`, 'utf8'))); for (const r of JSON.parse(readFileSync(`data/pipeline/audit/v042-raw/_work/in/${p}.json`, 'utf8'))) IN[r.id] = r; }
const EASY = new Set(['ox-0335','ox-0336','ox-0348','ox-0360','ox-0371','ox-0291','ox-0292','ox-0309','ox-0380','ox-0236']);
const GRADE_MEMO = /높음|어려|쉬운 편|전문적|안전|가까움/;
const out = {}; const upd = [];
for (const it of items) {
  const x = J[it.id]; if (!x) throw new Error('누락 ' + it.id);
  const status = x.verdict === 'ok' ? 'verified' : x.verdict === 'drop' ? 'rejected' : 'candidate';
  const cat = x.verdict === 'ok' ? 'ok' : EASY.has(it.id) ? 'easy-trap' : x.nearMiss ? 'near-miss' : (x.fact !== 'true' ? 'fact' : 'sentence');
  const pairIssue = /배제/.test(x.pairIssue || '') ? '' : (x.pairIssue || '');
  const gradeNote = GRADE_MEMO.test(x.gradeNote || '') && !/적절/.test(x.gradeNote) ? x.gradeNote : '';
  out[it.id] = { id: it.id, answer: it.answer, l1: it.category.l1, verdict: x.verdict, status, category: cat, fact: x.fact, factNote: x.factNote, nearMiss: !!x.nearMiss, ambiguous: !!x.ambiguous, sentenceIssues: x.sentenceIssues, gradeNoteAll: x.gradeNote || '', gradeNote, pairIssue, proposal: x.proposal, reason: x.reason, sources: x.sources };
  upd.push({ id: it.id, status, verify: { round: 'V042', checkedAt: new Date().toISOString(), verdict: x.verdict, reason: x.reason || '사실 맞음 · 문장 이상 없음', proposal: x.proposal, checked: [`fact ${x.fact}: ${x.factNote}`, `nearMiss ${!!x.nearMiss} · ambiguous ${!!x.ambiguous}`, ...(x.sources || []).map((s) => `${s.basis} ${s.url}`)], ...(x.sentenceIssues?.length ? { notes: x.sentenceIssues } : {}), ...(gradeNote ? { gradeNote } : {}) } });
}
writeFileSync('data/pipeline/audit/v042-ox.json', JSON.stringify(out, null, 1) + '\n');
writeFileSync('data/pipeline/audit/v042-raw/_work/items-verify.json', JSON.stringify(upd));
const c = {}; for (const o of Object.values(out)) { const k = o.answer + ' ' + o.status; c[k] = (c[k] || 0) + 1; } console.log(c, Object.keys(out).length);
const l = {}; for (const o of Object.values(out)) { const k = o.l1 + ' ' + o.status; l[k] = (l[k] || 0) + 1; } console.log(l);
console.log('gradeMemo', Object.values(out).filter((o) => o.gradeNote).map((o) => o.id + ':' + o.gradeNote.slice(0, 30)));
console.log('pairIssue', Object.values(out).filter((o) => o.pairIssue).length, 'unv', Object.values(out).filter((o) => o.fact !== 'true').length);
