#!/usr/bin/env node
// =============================================================================
// G011 — V014 판정을 g009a 생성 파일에 반영 (CV-34 (a) 설계 판단 시행) + CV-38 #3980 비활성
//   node scripts/g011-apply-v014.mjs            확인만 (무엇이 바뀌는지 · 받지 않은 제안)
//   node scripts/g011-apply-v014.mjs --apply    data/pipeline/generated/g009a/*.json 을 고치고 audit/g011-fixes.json 을 쓴다
//   node scripts/g011-apply-v014.mjs --db       (백업 뒤) CV-38 #3980 is_active=false — 지금 값이 BEFORE 와 같을 때만
//   ★ 멱등: 처음 바꿀 때 question.g011Before 에 원래 값을 남기고, 다시 돌리면 같은 결과 · 되돌리기는 g011Before / audit rows[].before
//   반영 내용
//     · fix 109: VERIFY 제안(proposal)을 GEN 이 읽고 받은 것만 — 받은 꼴은 DECIDE 의 값(제안 그대로 · 고쳐 받음) · 받지 않은 제안은 사유
//     · drop 4 → question.discarded (파일엔 남김 · 적재 안 함)
//     · 난이도 = V014 blind 재채점 값(score.version 'score-v3-blind' · 원래 GEN 점수는 g011Before.score)
//     · blind 로 3 이상이 됐는데 힌트가 없는 것 · 제안 힌트가 없는 fix 는 GEN 이 문서로 새로 쓴 힌트(NEW_HINT · hint-v5)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const DB = process.argv.includes('--db');
const DIR = path.join(ROOT, 'data/pipeline/generated/g009a');
const V = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/v014-results.json'), 'utf8')).items;
const DEC = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g011-decisions.json'), 'utf8'));

if (DB) {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
  await c.connect();
  for (const d of DEC.db) {
    const r = await c.query('select id, question_text, display_answer, is_active from questions where id = $1', [d.id]);
    const row = r.rows[0];
    if (!row) { console.log(`#${d.id} 없음 — 건너뜀`); continue; }
    if (row.is_active === d.after.is_active) { console.log(`#${d.id} 이미 반영`); continue; }
    if (row.question_text !== d.before.question_text || row.is_active !== d.before.is_active) { console.log(`#${d.id} 지금 값이 before 와 다름 — 건너뜀`); continue; }
    await c.query('update questions set is_active = $2, updated_at = now() where id = $1', [d.id, d.after.is_active]);
    console.log(`#${d.id} is_active ${d.before.is_active} → ${d.after.is_active} (${d.why})`);
  }
  await c.end();
  process.exit(0);
}

const rows = []; const notTaken = []; const counts = { items: 0, fixApplied: 0, drop: 0, exclude: 0, newHint: 0, blind: 0, unchanged: 0 };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const p = path.join(DIR, f); const doc = JSON.parse(readFileSync(p, 'utf8')); let changed = false;
  for (const it of doc.items) {
    const q = it.question; const ref = it.seed.ref; const v = V[ref];
    if (q.discarded && !q.g011Before) continue; // G009 격리 36 — 그대로
    if (!v) throw new Error(`${ref} V014 판정 없음`);
    counts.items++;
    const before = q.g011Before ?? { question: q.question, explanation: q.explanation ?? null, generalHint: q.generalHint ?? null, generalHintVersion: q.generalHintVersion ?? null, hintSources: q.hintSources ?? null, hintNote: q.hintNote ?? null, acceptedAnswers: q.acceptedAnswers ?? [], layer: q.layer ?? null, score: q.score, discarded: q.discarded ?? null };
    const after = JSON.parse(JSON.stringify(before));
    const d = DEC.items[ref] ?? null;
    // 1) drop · 제외
    if (v.verdict === 'drop') { after.discarded = `V014 drop — ${v.reason}`; counts.drop++; }
    else if (d?.exclude) { after.discarded = `G011 제외 — ${d.exclude}`; counts.exclude++; }
    // 2) 고침 — DECIDE 의 값만 (제안을 받은 꼴 · 고쳐 받은 꼴)
    if (!after.discarded && d) {
      for (const k of ['question', 'explanation', 'layer']) if (d[k] !== undefined) after[k] = d[k];
      if (d.hint !== undefined) { after.generalHint = d.hint; after.generalHintVersion = 'hint-v5'; after.hintSources = d.hintSources ?? after.hintSources; after.hintNote = d.hintNote ?? after.hintNote; if (d.newHint) counts.newHint++; }
      if (d.variants !== undefined) after.acceptedAnswers = d.variants;
      for (const n of d.notTaken ?? []) notTaken.push({ ref, ...n });
      if (v.verdict === 'fix') counts.fixApplied++;
    } else if (v.verdict === 'fix' && !after.discarded) throw new Error(`${ref} fix 인데 결정 없음`);
    // 3) 난이도 = V014 blind
    if (!after.discarded) {
      after.score = { ...before.score, version: 'score-v3-blind', dif: v.score.dif, easiestCue: v.score.easiestCue ?? null, difWhy: `V014 blind: ${v.score.difWhy}` };
      counts.blind++;
    }
    const keys = ['question', 'explanation', 'generalHint', 'generalHintVersion', 'hintSources', 'hintNote', 'acceptedAnswers', 'layer', 'score', 'discarded'];
    const cur = { question: q.question, explanation: q.explanation ?? null, generalHint: q.generalHint ?? null, generalHintVersion: q.generalHintVersion ?? null, hintSources: q.hintSources ?? null, hintNote: q.hintNote ?? null, acceptedAnswers: q.acceptedAnswers ?? [], layer: q.layer ?? null, score: q.score, discarded: q.discarded ?? null };
    const diff = keys.filter((k) => !same(before[k], after[k]));
    for (const k of diff) if (k !== 'score') rows.push({ ref, verdict: v.verdict, field: k, before: before[k], after: after[k], why: k === 'discarded' ? after.discarded : (d?.why ?? `V014 ${v.verdict}`), sources: k === 'generalHint' ? (after.hintSources ?? null) : (d?.sources ?? null) });
    if (!diff.length) counts.unchanged++;
    if (keys.some((k) => !same(cur[k], after[k]))) {
      changed = true;
      if (!q.g011Before) q.g011Before = before;
      for (const k of keys) { if (after[k] === null && (k === 'discarded' || k === 'layer' || k === 'hintSources' || k === 'hintNote')) delete q[k]; else q[k] = after[k]; }
      q.g011 = { round: 'G011', v014: v.verdict, blindDif: v.score.dif };
    }
  }
  if (changed && APPLY) writeFileSync(p, JSON.stringify(doc, null, 1) + '\n');
}
const scoreRows = rows.length;
const out = { round: 'G011', note: 'V014 판정(g009a 464) 반영 — 파일 단계(적재 전) · 난이도는 V014 blind(score-v3-blind) 로 모두 덮어씀(rows 에는 점수 칸을 넣지 않음 — question.g011Before.score 가 원래 GEN 점수) · 받지 않은 제안은 notTaken', counts, rows, notTaken, db: DEC.db };
if (APPLY) writeFileSync(path.join(ROOT, 'data/pipeline/audit/g011-fixes.json'), JSON.stringify(out, null, 1) + '\n');
console.log(counts, 'rows', scoreRows, 'notTaken', notTaken.length, APPLY ? '— 썼다' : '— 확인만(--apply 로 쓴다)');
