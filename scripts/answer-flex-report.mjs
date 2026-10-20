#!/usr/bin/env node
// =============================================================================
// ★★★ 복수정답 유연화 측정 (R057 · D-251) — 읽기만
//
//   npm run answers:flex            ← 콘솔 요약 + tmp/answer-flex-report.md(git 밖)
//
// ★ 원래 계획은 "틀린 제출 로그"로 유형을 세는 것이었지만 answer_events 는 **맞은 제출만** 적는다(matched=false 0 행 ·
//   raw · normalized 칸 없음 — 채팅 원문은 DB 에 없다). 그래서 **활성 정답 집합**으로 잰다:
//   (가) 변환마다 바뀌는 정답 수 · 예 · 빈 글 · ★ 충돌(변환 뒤 두 문항의 정답이 같아짐 — 원래 같은 정답을 나누지 않던 문항끼리)
//   (나) ③ 끝맺음(제출 쪽만): 정답 쪽에 쓰면 망가지는 정답 · 제출 쪽 위험(정답 + 끝맺음 = 다른 문항 정답)
//   (다) 넣지 않는 것 — 호칭 · 조사 · 오타(거리 1): 건수 · 위험 예
//   (라) 변형 누락 후보 — 문제 평가(question_feedback) 사유 "답이 틀렸거나 다른 답도 맞을 듯"
// ★ 변환 정의는 shared/src/answerFlex.ts(빌드 뒤 shared/dist) — 서버 판정과 같은 함수.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { flexCanon, normalizeAnswer, stripEnding } from '../shared/dist/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();

try {
  const rows = (
    await db.query(
      `SELECT q.id::text qid, a.answer_text raw, a.answer_norm norm
         FROM question_answers a JOIN questions q ON q.id = a.question_id
        WHERE q.is_active AND a.answer_norm <> ''`,
    )
  ).rows;
  const qids = new Set(rows.map((r) => r.qid));
  /** 문항 → 정규화 정답 · 정답 → 문항들 */
  const exactOf = new Map();
  const ownersOf = new Map();
  for (const r of rows) {
    if (!exactOf.has(r.qid)) exactOf.set(r.qid, new Set());
    exactOf.get(r.qid).add(r.norm);
    if (!ownersOf.has(r.norm)) ownersOf.set(r.norm, new Set());
    ownersOf.get(r.norm).add(r.qid);
  }
  const sharesExact = (a, b) => [...exactOf.get(a)].some((n) => exactOf.get(b).has(n));
  const pick = (arr, n = 5) => arr.slice(0, n);

  // ── (가) 정답 · 제출 둘 다 쓰는 변환
  const measure = (enabled) => {
    const changed = [];
    const empty = [];
    const canonOwners = new Map(); // 표준형 → 문항들(정규화 정답도 넣는다)
    for (const [n, qs] of ownersOf) canonOwners.set(n, new Set(qs));
    const canonOf = [];
    for (const r of rows) {
      const c = flexCanon(r.raw, enabled);
      if (c === r.norm) continue;
      if (c === '') {
        empty.push(r);
        continue;
      }
      changed.push({ ...r, canon: c });
      canonOf.push([r.qid, c]);
      if (!canonOwners.has(c)) canonOwners.set(c, new Set());
      canonOwners.get(c).add(r.qid);
    }
    const pairs = new Map();
    for (const [a, c] of canonOf) {
      for (const b of canonOwners.get(c)) {
        if (b === a || sharesExact(a, b)) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!pairs.has(k)) pairs.set(k, c);
      }
    }
    return { changed, empty, collisions: [...pairs.entries()].map(([k, c]) => ({ pair: k, canon: c })) };
  };
  const SINGLE = [['paren', '① 괄호'], ['punct', '② 가운뎃점·마침표·쉼표·물결'], ['article', '④ 영문 관사']];
  const results = SINGLE.map(([k, label]) => ({ k, label, ...measure([k]) }));
  const all = measure(['paren', 'punct', 'article']);

  // ── (나) ③ 끝맺음 — 제출 쪽만
  const ENDINGS = ['입니다', '이다', '요', '임'];
  const endsWithEnding = rows.filter((r) => stripEnding(r.raw) !== r.raw && normalizeAnswer(stripEnding(r.raw)) !== r.norm);
  const allNorms = new Set(rows.map((r) => r.norm));
  const endingRisk = [];
  for (const r of rows) {
    if ([...r.norm].length < 2) continue;
    for (const e of ENDINGS) {
      const w = r.norm + e;
      if (allNorms.has(w) && !exactOf.get(r.qid).has(w)) endingRisk.push({ qid: r.qid, ans: r.raw, typed: w, owners: [...ownersOf.get(w)].join(',') });
    }
  }

  // ── (다) 넣지 않는 것
  const TITLES = ['장군', '대왕', '선생', '씨', '님'];
  const PARTICLES = ['은', '는', '이', '가'];
  const titleEnd = rows.filter((r) => TITLES.some((t) => r.norm.endsWith(t) && [...r.norm].length > [...t].length));
  const titleRisk = rows.filter((r) => TITLES.some((t) => r.norm.endsWith(t) && allNorms.has(r.norm.slice(0, -t.length)) && !exactOf.get(r.qid).has(r.norm.slice(0, -t.length))));
  const particleEnd = rows.filter((r) => [...r.norm].length >= 2 && PARTICLES.some((p) => r.norm.endsWith(p)));
  const particleRisk = particleEnd.filter((r) => allNorms.has(r.norm.slice(0, -1)) && !exactOf.get(r.qid).has(r.norm.slice(0, -1)));
  // 오타 거리 1 — 서로 다른 문항의 정답끼리(2자 이상) · 같은 길이 바꿈 또는 한 글자 넣기/빼기
  const lev1 = (a, b) => {
    const A = [...a];
    const B = [...b];
    if (Math.abs(A.length - B.length) > 1) return false;
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i += 1;
    if (A.length === B.length) return A.slice(i + 1).join('') === B.slice(i + 1).join('');
    return A.length > B.length ? A.slice(i + 1).join('') === B.slice(i).join('') : A.slice(i).join('') === B.slice(i + 1).join('');
  };
  const byLen = new Map();
  for (const n of allNorms) {
    const L = [...n].length;
    if (L < 2) continue;
    if (!byLen.has(L)) byLen.set(L, []);
    byLen.get(L).push(n);
  }
  const typoPairs = [];
  for (const [L, list] of byLen) {
    const cands = [...list, ...(byLen.get(L + 1) ?? [])];
    for (const a of list) {
      for (const b of cands) {
        if (a >= b && [...b].length === L) continue;
        if (a === b || !lev1(a, b)) continue;
        const qa = ownersOf.get(a);
        const qb = ownersOf.get(b);
        if ([...qa].some((x) => qb.has(x))) continue; // 같은 문항의 변형끼리
        typoPairs.push([a, b]);
      }
    }
  }
  const shortAnswers = [...allNorms].filter((n) => [...n].length <= 2).length;

  // ── (라) 문제 평가 "답" 사유
  let fbAnswer = [];
  try {
    fbAnswer = (
      await db.query(
        `SELECT f.question_id::text qid, q.display_answer, f.comment FROM question_feedback f JOIN questions q ON q.id = f.question_id
          JOIN accounts a ON a.id = f.account_id
         WHERE 'answer' = ANY(f.reasons) AND a.login_id !~ '^(bot|uic|r10_)' ORDER BY f.updated_at DESC`,
      )
    ).rows;
  } catch {
    /* 0020 전 */
  }

  // ── 출력
  const ex = (list, f) => pick(list).map(f).join(' · ') || '—';
  const lines = [];
  const log = (s = '') => {
    lines.push(s);
    console.log(s);
  };
  log(`# 복수정답 유연화 측정 — 활성 문항 ${qids.size.toLocaleString()} · 정답 행 ${rows.length.toLocaleString()}`);
  log('');
  log('## (가) 정답 · 제출 둘 다 쓰는 변환');
  log('');
  log('| 변환 | 바뀌는 정답 | 빈 글(버림) | ★ 충돌(문항 쌍) | 예 |');
  log('|---|---|---|---|---|');
  for (const r of [...results, { label: '①②④ 함께', ...all }]) {
    log(`| ${r.label} | ${r.changed.length} | ${r.empty.length} | ${r.collisions.length} | ${ex(r.changed, (x) => `${x.raw} → ${x.canon}`).replace(/\|/g, '/')} |`);
  }
  for (const r of [...results, { label: '①②④ 함께', ...all }]) {
    if (r.collisions.length) log(`- ${r.label} 충돌 예: ${pick(r.collisions, 10).map((c) => `#${c.pair.replace('|', '·#')}(${c.canon})`).join(' · ')}`);
  }
  log('');
  log('## (나) ③ 끝맺음 — 제출 쪽만');
  log('');
  log(`- 정답 쪽에 쓰면 망가지는 정답(끝이 이다 · 입니다 · 요 · 임): ${endsWithEnding.length} — ${ex(endsWithEnding, (x) => x.raw)}`);
  log(`- 제출 쪽 위험(정답 + 끝맺음 = 다른 문항의 정답 — 그 문항에서 그 단어를 치면 이 정답으로 인정): ${endingRisk.length} — ${ex(endingRisk, (x) => `#${x.qid} ${x.ans} ← "${x.typed}"`)}`);
  log('');
  log('## (다) 넣지 않는 것 — 찬종 결정(13 A82)');
  log('');
  log('| 유형 | 건수 | 위험 건수 | 예 |');
  log('|---|---|---|---|');
  log(`| 호칭(장군 · 대왕 · 선생 · 씨 · 님) 으로 끝나는 정답 | ${titleEnd.length} | 떼면 다른 문항 정답 ${titleRisk.length} | ${ex(titleEnd, (x) => x.raw)} |`);
  log(`| 조사(은 · 는 · 이 · 가) 로 끝나는 정답(2자 이상) | ${particleEnd.length} | 떼면 다른 문항 정답 ${particleRisk.length} | ${ex(particleRisk.length ? particleRisk : particleEnd, (x) => `${x.raw}→${x.norm.slice(0, -1)}`)} |`);
  log(`| 오타(거리 1) — 서로 다른 문항 정답 쌍(2자 이상) | ${typoPairs.length} | 1~2자 정답 ${shortAnswers} | ${ex(typoPairs, ([a, b]) => `${a}/${b}`)} |`);
  log('');
  log('## (라) 변형 누락 후보 — 문제 평가 "답이 틀렸거나 다른 답도 맞을 듯"(봇 제외)');
  log('');
  log(fbAnswer.length ? fbAnswer.map((f) => `- #${f.qid} ${f.display_answer}${f.comment ? ` — ${f.comment}` : ''}`).join('\n') : '- 0 건 (R056 부터 모은다 — 쌓이면 GEN 반영 후보)');
  lines.push('');
  mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const out = path.join(ROOT, 'tmp', 'answer-flex-report.md');
  writeFileSync(out, lines.join('\n'));
  console.log(`\n[answers:flex] → ${path.relative(ROOT, out)}`);
} finally {
  await db.end();
}
