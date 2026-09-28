#!/usr/bin/env node
// =============================================================================
// 전역 정답 경고 — 소재 초안을 **전체 정답 목록**에 대조한다 (R022 / Q-96 / seed-v3)
//
// ★★ 왜 만들었는가
//   지금까지 금지 목록은 **같은 소분류 안**만 담았다 (usedSeeds / usedAnswers).
//   그런데 열하일기는 한국사에도 한국 문학에도 합법적으로 들어간다.
//   ★ V001 실측: R021 의 라운드 밖 후보 242쌍 중 **same 이 76.4%** 였다.
//     → 답이 겹치면 3/4 이 실제 중복이다. 답 일치는 강한 신호다.
//
// ★★★ 그러나 **경고지 금지가 아니다** (Q-96 확정)
//   포르투갈어처럼 답만 같고 지식이 다른 것은 여전히 살린다 (Q-91 기준 유지).
//   → 이 스크립트는 걸러내지 않는다. **걸린 것을 기존 질문 전문과 함께 보여 줄 뿐이다.**
//     판단은 소재를 만드는 쪽이 하고, 그 판단을 seedResult.globalCheck 에 적는다.
//
// ★ 토큰을 어떻게 아끼는가
//   정답 2,600개를 매 프롬프트에 넣는 대신, 소재를 먼저 뽑고 **예상 정답(probableAnswer)** 만 대조한다.
//   ★ 걸린 것만 기존 질문과 함께 보여 준다. 걸린 건수 × 한 줄이다.
//
// 대조 대상
//   · DB 의 활성 문항 (대표 정답 + 표기 변형 전부)
//   · 아직 적재되지 않은 라운드 파일의 문항 (--rounds 로 지정. 격리된 것은 뺀다)
//   · ★ 같은 초안 안의 다른 소재 (라운드 안 같은 답 / D-090)
//
// 사용법
//   node scripts/seeds-global-check.mjs --draft tmp/r022/seeds/batch-a.json [--rounds r022] [--out <경로>] [--no-c37]
//     draft: seeds-ingest 와 같은 형식. seeds[].probableAnswer 가 있어야 한다
//
// ★ R023 (C37) — R022 에서 놓친 두 가지를 잡는다
//   (1) 한글 2글자 정답의 포함 관계 — 열섬 ⊂ 열섬 현상. ★ 오탐 때문에 **개념 꼬리말(현상·효과·작용…)이 붙을 때만** 본다
//   (2) 된소리·예사소리 — 쎄시봉 / 세시봉. 된소리(ㄲㄸㅃㅆㅉ)를 예사소리로 바꾼 열쇠로 한 번 더 대조한다 (kind: 'soft')
//   --no-c37 로 끄면 R022 와 같은 방식으로 돈다 (효과 측정용)
// ★ R023 — 2회차 짝 면제: 소재에 pairedWith(1회차 seedId) 가 있으면 그 문항에 걸린 것은 exempted 로 따로 둔다
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { normalizeAnswer } from '../shared/dist/index.js';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRAFT = opt('--draft', null);
const ROUNDS = (opt('--rounds', '') || '').split(',').filter(Boolean);
const OUT = opt('--out', null);
const C37 = !args.includes('--no-c37');
if (!DRAFT) { console.error('--draft 가 필요하다'); process.exit(1); }

// ★ 정확 일치 + 포함 관계(양쪽 3자 이상) — "마라톤 ⊂ 마라톤 전투" 같은 것
const MIN_CONTAIN = 3;
// ★ C37: 한글만으로 된 2글자는 **개념 꼬리말이 붙은 경우만** 본다 — "열섬" ⊂ "열섬 현상"
//   ★ R023 실측: 앞·끝 일치를 다 보면 R022 7배치에서 새 걸림 33건 중 진짜는 1건(열섬)뿐이었다
//     (반고↔반고리관, 초가↔사면초가, 소닉↔소닉붐 …). 꼬리말로 좁히면 열섬만 남는다
const HANGUL_ONLY = /^[가-힣]+$/;
const CONCEPT_SUFFIX = ['현상', '효과', '작용', '법칙', '이론', '제도', '반응', '증후군'];
// ★ C37: 된소리 → 예사소리 (초성·종성). 한글 음절을 풀어 바꾼 뒤 다시 모은다
const FORTIS_L = { 1: 0, 4: 3, 8: 7, 10: 9, 13: 12 };        // 초성 ㄲ→ㄱ ㄸ→ㄷ ㅃ→ㅂ ㅆ→ㅅ ㅉ→ㅈ
const FORTIS_T = { 2: 1, 20: 19 };                          // 종성 ㄲ→ㄱ ㅆ→ㅅ
export const soften = (t) => [...t].map((ch) => {
  const c = ch.charCodeAt(0) - 0xac00; if (c < 0 || c > 11171) return ch;
  let L = Math.floor(c / 588), V = Math.floor((c % 588) / 28), T = c % 28;
  L = FORTIS_L[L] ?? L; T = FORTIS_T[T] ?? T;
  return String.fromCharCode(0xac00 + L * 588 + V * 28 + T);
}).join('');

// ── 색인
const index = new Map(); // norm → [{where, sub, answer, q}]
const addIdx = (norm, e) => { if (!norm) return; if (!index.has(norm)) index.set(norm, []); index.get(norm).push(e); };

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const rows = (await c.query(`
  SELECT q.id, q.source_ref, q.display_answer, q.question_text, t.mid_key, t.sub_name
    FROM questions q LEFT JOIN category_tree t ON q.category_id = t.category_id
   WHERE q.is_active`)).rows;
const ans = (await c.query('SELECT question_id, answer_text FROM question_answers')).rows;
await c.end();
const byQ = new Map();
for (const a of ans) { const k = String(a.question_id); if (!byQ.has(k)) byQ.set(k, []); byQ.get(k).push(a.answer_text); }
for (const r of rows) {
  const e = { ref: r.source_ref ?? null, where: `db:${r.id}`, sub: r.mid_key ? `${r.mid_key} > ${r.sub_name}` : '(소분류 없음)', answer: r.display_answer, q: r.question_text };
  const seen = new Set();
  for (const a of byQ.get(String(r.id)) ?? [r.display_answer]) { const n = normalizeAnswer(a); if (seen.has(n)) continue; seen.add(n); addIdx(n, e); }
}
for (const round of ROUNDS) {
  let files = [];
  try { files = (await readdir(generatedDir(round))).filter((f) => f.endsWith('.json') && !f.startsWith('_')); } catch { continue; }
  for (const f of files) {
    const doc = JSON.parse(await readFile(path.join(generatedDir(round), f), 'utf8'));
    for (const it of doc.items) {
      const q = it.question;
      // ★ 아직 문제가 없는 소재는 예상 정답(probableAnswer)으로 색인한다 — 같은 라운드의 다른 배치와 겹치는지 보려는 것이다
      if (q?.status === 'pending' && it.seed?.probableAnswer) {
        addIdx(normalizeAnswer(it.seed.probableAnswer), { ref: it.seedId, where: `${round}:${it.seedId}(소재)`, sub: doc._meta.categoryPath, answer: it.seed.probableAnswer, q: `[소재] ${it.seed.subject} — ${it.seed.knowledgePoint}` });
        continue;
      }
      if (!q?.ok || q.discarded) continue;
      const e = { ref: it.seedId, where: `${round}:${it.seedId}`, sub: doc._meta.categoryPath, answer: q.answer, q: q.question };
      const seen = new Set();
      for (const a of [q.answer, ...(q.acceptedAnswers ?? [])]) { const n = normalizeAnswer(a); if (seen.has(n)) continue; seen.add(n); addIdx(n, e); }
    }
  }
}
const keys = [...index.keys()];
const softIndex = new Map(); // 예사소리 열쇠 → 원래 열쇠들
for (const k of keys) { const sk = soften(k); if (sk === k) continue; (softIndex.get(sk) ?? softIndex.set(sk, []).get(sk)).push(k); }

// ── 초안
const batches = JSON.parse(await readFile(DRAFT, 'utf8'));
const draftIdx = new Map();
for (const b of batches) for (const s of b.seeds) {
  if (!s.probableAnswer) continue;
  const n = normalizeAnswer(s.probableAnswer);
  if (!draftIdx.has(n)) draftIdx.set(n, []);
  draftIdx.get(n).push(`${b.subId}:${s.subject}`);
}

const report = [];
let checked = 0, missing = 0, exemptTotal = 0;
for (const b of batches) {
  for (const s of b.seeds) {
    if (!s.probableAnswer) { missing += 1; continue; }
    checked += 1;
    const n = normalizeAnswer(s.probableAnswer);
    let hits = [];
    for (const e of index.get(n) ?? []) hits.push({ kind: 'exact', ...e });
    if (n.length >= MIN_CONTAIN) {
      for (const k of keys) {
        if (k === n || k.length < MIN_CONTAIN) continue;
        if (k.includes(n) || n.includes(k)) for (const e of index.get(k)) hits.push({ kind: 'contain', ...e });
      }
    } else if (C37 && n.length === 2 && HANGUL_ONLY.test(n)) {
      // ★ C37 (1): 2글자 한글 + 개념 꼬리말 — "열섬" ⊂ "열섬현상"
      for (const k of keys) {
        if (k === n || k.length <= 2) continue;
        if (k.startsWith(n) && CONCEPT_SUFFIX.includes(k.slice(n.length))) for (const e of index.get(k)) hits.push({ kind: 'contain2', ...e });
      }
    }
    if (C37) {
      // ★ C37 (2): 된소리·예사소리 — 양쪽을 예사소리로 바꿔 같으면 걸린다 (이미 같은 열쇠는 뺀다)
      const sn = soften(n);
      for (const k of [...(softIndex.get(sn) ?? []), ...(index.has(sn) && sn !== n ? [sn] : [])]) {
        if (k === n) continue;
        for (const e of index.get(k)) hits.push({ kind: 'soft', ...e });
      }
    }
    // ★ 2회차 짝 면제 — 자기 1회차 문항에 걸린 것은 경고가 아니다
    const exempted = s.pairedWith ? hits.filter((h) => h.ref === s.pairedWith) : [];
    if (exempted.length) { exemptTotal += exempted.length; hits = hits.filter((h) => h.ref !== s.pairedWith); }
    const sameDraft = (draftIdx.get(n) ?? []).filter((x) => x !== `${b.subId}:${s.subject}`);
    if (hits.length || sameDraft.length || exempted.length) report.push({ subId: b.subId, subject: s.subject, probableAnswer: s.probableAnswer, hits, sameDraft, exempted });
  }
}

console.log(`[전역 대조] 색인 정답 ${index.size}개 (DB 활성 ${rows.length}건${ROUNDS.length ? ' + ' + ROUNDS.join(',') : ''})`);
const hitItems = report.filter((r) => r.hits.length || r.sameDraft.length).length;
console.log(`[전역 대조] 소재 ${checked}개 대조 / ★ 걸린 소재 ${hitItems}개` + (missing ? ` / ★ probableAnswer 없음 ${missing}개` : '') + (exemptTotal ? ` / 2회차 짝 면제 ${exemptTotal}건` : '') + (C37 ? '' : ' / (C37 끔)'));
for (const r of report.filter((x) => x.hits.length || x.sameDraft.length)) {
  console.log(`\n■ ${r.subId} · ${r.subject}  → 예상 정답 "${r.probableAnswer}"`);
  for (const h of r.hits.slice(0, 6)) console.log(`   ${({ exact: '같음', contain: '포함', contain2: '포함2', soft: '된소리' })[h.kind]} ${h.where}  [${h.sub}]  답 "${h.answer}"\n        ${h.q}`);
  if (r.hits.length > 6) console.log(`   … 외 ${r.hits.length - 6}건`);
  for (const d of r.sameDraft) console.log(`   ★ 같은 초안 안 — ${d}`);
}
if (OUT) await writeFile(OUT, JSON.stringify({ draft: DRAFT, checkedAt: new Date().toISOString(), indexSize: index.size, checked, hitCount: report.filter((r) => r.hits.length || r.sameDraft.length).length, exemptTotal, c37: C37, report }, null, 2) + '\n', 'utf8');
