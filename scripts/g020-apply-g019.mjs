#!/usr/bin/env node
// =============================================================================
// G020 — g019a · g019b 파일에 V025 · V026 판정 반영 (CV-84 · 87 · 88 · 89 · 90) — DB 는 건드리지 않는다(적재는 pipeline-load)
//   입력  data/pipeline/audit/g020-g019-decisions.json  items["a/C2-11"] = { verdict, rescore, question?, explanation?, hint?(null = 비움),
//          hintNote?, hintSources?, hintGen?, addVariants?, notTaken?, layer?, discard?, undiscard?, wor?, worWhy?, valueStatus?, disputed?, why }
//   출력  data/pipeline/generated/g019a · g019b/*.json (제자리 고침 · 1칸 들여쓰기 아님 — 원래 꼴 2칸 그대로)
//         data/pipeline/audit/g020-undo-g019.json  ★ 되돌리기 파일 — 처음 바꿀 때의 전 값(question 의 바뀐 칸만) · 다시 돌려도 전 값은 덮지 않는다
//   사용  node scripts/g020-apply-g019.mjs [--apply]
//   ★ 반영 내용: 질문 · 해설 · 힌트(+ generalHintVersion hint-v6 · hintBasis web · hintSources) · 변형 더하기 · 층 · drop 격리(discarded)
//     · 격리 풂(CV-88) · score.dif = 판정자 blind 재채점(원래 값은 scoreGen 에 한 번만 남김) · q.g020 = 반영 표시
//   ★ 반영 뒤 검사: checkAnswerSet(막힘 0) · blankCheck · 질문 200자 · checkHint 막힘 0 · 힌트 120자 · 난이도 3 이상인데 힌트 없음 = H0 예외 표시만
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHint } from './hint-check.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { blankCheck } from '../pipeline/lib/question-checks.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const DEC = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g020-g019-decisions.json'), 'utf8')).items;
const UNDO = path.join(ROOT, 'data/pipeline/audit/g020-undo-g019.json');
const undo = existsSync(UNDO) ? JSON.parse(readFileSync(UNDO, 'utf8')) : { round: 'G020', note: 'g019a/b 파일 반영 전 값 — items[key][칸] = 전 값(없던 칸은 null). 되돌리기: 이 값으로 question 칸을 되돌리고 g020 · scoreGen 칸을 지운다(score.dif 는 scoreGen.dif 로)', items: {} };
const KEYS = ['question', 'explanation', 'generalHint', 'generalHintVersion', 'hintBasis', 'hintSources', 'hintNote', 'acceptedAnswers', 'layer', 'discarded', 'score', 'valueStatus', 'disputed'];

const stat = { files: 0, changedFiles: 0, items: 0, changed: 0, q: 0, e: 0, h: 0, hNull: 0, v: 0, layer: 0, discard: 0, undiscard: 0, rescore: 0, notTaken: 0 };
const problems = []; const notTaken = []; const h0 = []; const warn = [];
for (const r of ['a', 'b']) {
  const dir = path.join(ROOT, `data/pipeline/generated/g019${r}`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    const p = path.join(dir, f); const raw = readFileSync(p, 'utf8'); const doc = JSON.parse(raw); stat.files++;
    for (const it of doc.items) {
      const key = `${r}/${it.seed.ref}`; const d = DEC[key]; const q = it.question; if (!d) continue;
      stat.items++;
      const before = Object.fromEntries(KEYS.map((k) => [k, q[k] === undefined ? null : JSON.parse(JSON.stringify(q[k]))]));
      if (d.discard) q.discarded = `G020 ${d.discard}`;
      if (d.undiscard && q.discarded && !q.discardedBefore) { q.discardedBefore = q.discarded; delete q.discarded; }
      if (d.undiscard) { q.score.wor = d.wor; q.score.worWhy = d.worWhy; q.score.worBy = 'G020 재채점(CV-88)'; }
      if (d.question) q.question = d.question;
      if (d.explanation) q.explanation = d.explanation;
      if (d.hint !== undefined) {
        q.generalHint = d.hint; q.generalHintVersion = d.hint ? 'hint-v6' : null;
        if (d.hint) { q.hintBasis = 'web'; q.hintSources = d.hintSources ?? []; delete q.hintNote; } else q.hintNote = d.hintNote;
      }
      if (d.addVariants) {
        const have = new Set([q.answer, ...(q.acceptedAnswers ?? [])]);
        const add = d.addVariants.filter((v) => !have.has(v));
        q.acceptedAnswers = [...(q.acceptedAnswers ?? []), ...add];
      }
      for (const n of d.notTaken ?? []) notTaken.push({ key, ...n });
      if (d.layer) q.layer = d.layer;
      if (d.valueStatus) q.valueStatus = d.valueStatus;
      if (d.disputed) q.disputed = d.disputed;
      if (d.rescore != null && !d.undiscard) { if (!q.scoreGen) q.scoreGen = { ...q.score }; q.score = { ...q.score, dif: d.rescore, difBy: 'V025/V026 판정자 blind 재채점(G020)' }; }
      const after = Object.fromEntries(KEYS.map((k) => [k, q[k] === undefined ? null : q[k]]));
      const ch = KEYS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (ch.length) {
        stat.changed++; undo.items[key] ??= {}; for (const k of ch) if (!(k in undo.items[key])) undo.items[key][k] = before[k];
        q.g020 = { why: d.why, verdict: d.verdict, ...(d.hintGen ? { hintGen: true } : {}), ...(d.hintGenNote ? { hintGenNote: d.hintGenNote } : {}) };
      }
      if (d.question) stat.q++; if (d.explanation) stat.e++; if (d.hint) stat.h++; if (d.hint === null) stat.hNull++; if (d.addVariants) stat.v++; if (d.layer) stat.layer++; if (d.discard) stat.discard++; if (d.undiscard) stat.undiscard++; if (d.rescore != null && !d.undiscard) stat.rescore++;
      if (q.discarded) continue;
      // 반영 뒤 검사
      if (!blankCheck(q.question, q.answer).ok) problems.push(`${key}: 빈칸 수`);
      if ([...q.question].length > 200) problems.push(`${key}: 질문 ${[...q.question].length}자`);
      const g = checkAnswerSet(q.question, q.answer, q.acceptedAnswers ?? [], normalizeAnswer, { originalTitles: q.originalTitleVariants ?? [] });
      if (g.blocked.length) problems.push(`${key}: 정답 노출 ${JSON.stringify(g.blocked)}`);
      for (const x of g.dropped) if ((d.addVariants ?? []).includes(x.answer)) notTaken.push({ key, field: 'variants', proposal: [x.answer], why: `넣지 않음(게이트가 뺌) — ${x.kind}` });
      if (q.generalHint) {
        if ([...q.generalHint].length > 120) problems.push(`${key}: 힌트 120자 초과`);
        const k = checkHint({ hint: q.generalHint, answer: q.answer, variants: q.acceptedAnswers ?? [], question: q.question, explanation: q.explanation ?? '' });
        if (k.block.length) problems.push(`${key}: checkHint 막힘 ${JSON.stringify(k.block)}`);
        if (k.warn.length && d.hint) warn.push(`${key}: ${JSON.stringify(k.warn)}`);
      } else if ((q.score?.dif ?? 0) >= 3) { if (!(q.hintNote ?? '').startsWith('H0 예외')) problems.push(`${key}: 난이도 ${q.score.dif} 인데 힌트 없음`); else h0.push(key); }
    }
    const out = JSON.stringify(doc, null, 2) + '\n';
    if (out !== raw) { stat.changedFiles++; if (APPLY) writeFileSync(p, out); }
  }
}
stat.notTaken = notTaken.length;
console.log('[g020 B]', JSON.stringify(stat));
console.log('  H0 예외(힌트 없음 · 난이도 3 이상):', h0.join(' '));
for (const n of notTaken) console.log('   notTaken', n.key, JSON.stringify(n.proposal), n.why);
for (const w of warn) console.log('   (힌트 경고)', w);
if (problems.length) { for (const p of problems) console.error('★', p); process.exit(1); }
if (APPLY) { undo.at ??= new Date().toISOString(); undo.notTaken = notTaken; undo.h0 = h0; writeFileSync(UNDO, JSON.stringify(undo, null, 1) + '\n'); console.log('[g020 B] 썼다'); }
else console.log('[g020 B] 확인만 — 쓰려면 --apply');
