#!/usr/bin/env node
// =============================================================================
// ★★ DB 에 적재된 문제 전체에 규칙 검사를 돌린다 (R019 작업 B / Q-90)
//
// ★★ DB 는 **읽기만** 한다. 아무것도 고치지 않는다.
//   ★ 지시: "이번 라운드에는 찾기만 한다. is_active 를 내리지 마라."
//
// ★★ 왜 필요한가
//   규칙 검사(D-081)는 R017 부터 생긴 것이라, 그 전에 적재된 306건에는
//   **한 번도 돌린 적이 없다.** R018 에서 실제로 하나가 걸렸다 —
//     db:33  "무궁화의 학명에 쓰이는 우리나라의 국화 이름은?" → 무궁화
//   ★ 질문을 베끼면 모르는 사람이 이긴다.
//
// ★ shared 의 normalizeAnswer() / generateHint() 를 그대로 쓴다. 다시 만들지 않는다.
//
// 사용법
//   node scripts/db-rule-audit.mjs                 전체
//   node scripts/db-rule-audit.mjs --source manual,opentdb
//   node scripts/db-rule-audit.mjs --out data/pipeline/audit/db-rule-audit.json
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { normalizeAnswer, generateHint } from '../shared/dist/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const SOURCES = arg('source')?.split(',') ?? null;
const OUT = arg('out') ?? 'data/pipeline/audit/db-rule-audit.json';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb',
});
await client.connect();

const rows = (
  await client.query(
    `SELECT q.id, q.source_id, q.source_ref, q.status, q.is_active,
            q.question_text, q.display_answer, q.hint_answer,
            coalesce(t.sub_name, '(소분류 없음)') AS sub_name,
            coalesce(t.major_name, '(없음)')      AS major_name
       FROM questions q
       LEFT JOIN category_tree t ON q.category_id = t.category_id
      ${SOURCES ? 'WHERE q.source_id = ANY($1)' : ''}
      ORDER BY q.id`,
    SOURCES ? [SOURCES] : [],
  )
).rows;

const answers = (
  await client.query('SELECT question_id, answer_text, is_primary FROM question_answers')
).rows;
await client.end();

const ansById = new Map();
for (const a of answers) {
  const k = String(a.question_id);
  const arr = ansById.get(k) ?? [];
  arr.push(a.answer_text);
  ansById.set(k, arr);
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ 질문에 정답이 노출됐는가 — D-081 과 **같은 방식**으로 판정한다.
//   expose        낱말 경계를 갖추고 들어갔다 → 실제 노출
//   exposeSuspect 문자열로는 있으나 낱말 경계가 아니다 → ★ 격리. 사람이 본다
//   ★ 원문에서 판정한다. 정규화는 공백을 지워 경계를 볼 수 없게 만든다
// ─────────────────────────────────────────────────────────────────────────────
const BOUNDARY = /[\s.,!?'"()[\]{}·~:;/‘’“”–—-]/;
function findInQuestion(question, answer) {
  const q = (question ?? '').normalize('NFC');
  const a = (answer ?? '').normalize('NFC').trim();
  if (a.length === 0) return 'none';
  let from = 0;
  let sawSubstring = false;
  for (;;) {
    const i = q.indexOf(a, from);
    if (i < 0) break;
    sawSubstring = true;
    const before = i === 0 ? '' : q[i - 1];
    const after = i + a.length >= q.length ? '' : q[i + a.length];
    if ((before === '' || BOUNDARY.test(before)) && (after === '' || BOUNDARY.test(after))) return 'word';
    from = i + 1;
  }
  return sawSubstring ? 'substring' : 'none';
}

/**
 * ★ 시간이 지나면 답이 바뀌는 문제인가.
 * ★★ 이것은 **자동으로 판정할 수 없다.** 낱말로 후보만 올리고 사람이 본다.
 *   ★ 근거: "현재"가 들어가도 "현재 쓰이는 표기는?" 처럼 안 바뀌는 것이 있다.
 */
const TIME_WORDS = [
  '현재', '지금', '최근', '올해', '작년', '요즘', '현직', '가장 최신', '최신',
  '오늘날', '이번', '역대 최다', '역대 최고',
];

const findings = {
  expose: [],
  exposeSuspect: [],
  hintNull: [],
  hintEqualsAnswer: [],
  answerNormCollisionInside: [],
  longAnswer: [],
  timeDependentSuspect: [],
  noAnswerRow: [],
  primaryMissingInRows: [],
  // ★★ R019: 표기 변형에 외국어·한자가 섞인 것. 프롬프트 v1/v2 가 금지한 유형이다.
  //   ★ 이것을 세는 이유 — 변형이 많을수록 그중 하나가 질문에 들어갈 확률이 올라간다.
  //     실제로 이번 감사에서 '진짜 노출' 6건 중 4건이 **변형 때문**이었다.
  foreignVariant: [],
  manyVariants: [],
};

for (const r of rows) {
  const id = String(r.id);
  const rowAnswers = ansById.get(id) ?? [];
  const display = r.display_answer ?? '';
  const ref = `db:${r.id}`;
  const base = {
    ref,
    source: r.source_id,
    sourceRef: r.source_ref,
    active: r.is_active,
    category: `${r.major_name} > ${r.sub_name}`,
    question: r.question_text,
    answer: display,
  };

  if (rowAnswers.length === 0) findings.noAnswerRow.push(base);
  if (rowAnswers.length > 0 && !rowAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(display))) {
    findings.primaryMissingInRows.push({ ...base, rows: rowAnswers });
  }

  // ── 질문에 정답 노출
  let worst = 'none';
  let worstAnswer = null;
  for (const cand of [display, ...rowAnswers]) {
    const kind = findInQuestion(r.question_text, cand);
    if (kind === 'word') {
      worst = 'word';
      worstAnswer = cand;
      break;
    }
    if (kind === 'substring' && worst === 'none') {
      worst = 'substring';
      worstAnswer = cand;
    }
  }
  if (worst === 'word') findings.expose.push({ ...base, matched: worstAnswer });
  else if (worst === 'substring') findings.exposeSuspect.push({ ...base, matched: worstAnswer });

  // ── 힌트
  const hintSource = r.hint_answer ?? display;
  const h = generateHint(hintSource);
  if (h === null) findings.hintNull.push({ ...base, hintSource });
  else if (normalizeAnswer(h) === normalizeAnswer(hintSource)) {
    findings.hintEqualsAnswer.push({ ...base, hintSource, hint: h });
  }

  // ── 한 문제 안에서 정답 표기가 정규화 후 겹치는가
  const seen = new Map();
  for (const a of rowAnswers) {
    const n = normalizeAnswer(a);
    if (seen.has(n) && seen.get(n) !== a) {
      findings.answerNormCollisionInside.push({ ...base, pair: [seen.get(n), a] });
    }
    seen.set(n, a);
  }

  // ── 서술형·긴 정답
  const len = [...display].length;
  // ★ 어미 검사는 다섯 글자 이상일 때만 한다.
  //   ★ 근거(실측): "아이다"(오페라)가 '이다' 어미로 잡혔다. 짧은 고유명사에서 오탐이 난다.
  if (len >= 12 || (len >= 5 && /(습니다|이다|한다|였다|입니다)$/.test(display))) {
    findings.longAnswer.push({ ...base, len });
  }

  // ── ★ 표기 변형 품질
  const variants = rowAnswers.filter((a) => normalizeAnswer(a) !== normalizeAnswer(display));
  const foreign = variants.filter((a) => /[A-Za-z]|[㐀-鿿]|[぀-ヿ]/.test(a));
  if (foreign.length) findings.foreignVariant.push({ ...base, variants: foreign });
  if (variants.length >= 3) findings.manyVariants.push({ ...base, count: variants.length, variants });

  // ── 시간 의존 후보
  const hit = TIME_WORDS.find((w) => (r.question_text ?? '').includes(w));
  if (hit) findings.timeDependentSuspect.push({ ...base, word: hit });
}

// ─────────────────────────────────────────────────────────────────────────────
const bySource = {};
for (const r of rows) bySource[r.source_id] = (bySource[r.source_id] ?? 0) + 1;

function countBySource(list) {
  const o = {};
  for (const x of list) o[x.source] = (o[x.source] ?? 0) + 1;
  return o;
}

const report = {
  generatedAt: new Date().toISOString(),
  scanned: rows.length,
  bySource,
  counts: Object.fromEntries(
    Object.entries(findings).map(([k, v]) => [k, { total: v.length, bySource: countBySource(v) }]),
  ),
  findings,
};

await mkdir(path.join(ROOT, path.dirname(OUT)), { recursive: true });
await writeFile(path.join(ROOT, OUT), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`[감사] 문제 ${rows.length}건 / 소스별 ${JSON.stringify(bySource)}`);
console.log('');
for (const [k, v] of Object.entries(report.counts)) {
  console.log(`  ${k.padEnd(26)} ${String(v.total).padStart(3)}   ${JSON.stringify(v.bySource)}`);
}
console.log(`\n  → ${OUT}`);
