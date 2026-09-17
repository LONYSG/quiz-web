#!/usr/bin/env node
// =============================================================================
// R018 작업 A-2 — 인명 대표 정답 개정을 반영한다 (Q-85 확정)
//
// ★★ DB 에 쓰지 않는다. 파일만 고친다.
//
// 고치는 곳이 **두 군데**다. 하나만 고치면 어긋난다 —
//   (1) data/pipeline/generated/<round>/<slug>.json   문제 본문의 answer
//   (2) data/pipeline/seeds/<midKey>.json             seeds[].question.answer 와 usedAnswers
//
// ★ usedAnswers 를 같이 고치지 않으면 다음 라운드의 금지 목록이 **옛 표기**를 들고 있게 된다.
//   그러면 "이미 만든 답" 과 실제 DB 의 답이 달라져 금지 목록이 제 구실을 못 한다.
//
// ★ 원본 표기를 지우지 않는다. question.answerRevision 에 남긴다 —
//   어느 문항이 어떤 규칙으로 바뀌었는지 추적할 수 있어야 한다.
//
// 사용법
//   node scripts/r018-apply-name-revision.mjs --dry-run
//   node scripts/r018-apply-name-revision.mjs
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeAnswer, generateHint } from '../shared/dist/index.js';
import { loadMid, saveMid, generatedDir } from '../pipeline/lib/seedstore.mjs';
import { resolveSubId, slugOf } from '../pipeline/lib/subid.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = 'r017';
const DRY = process.argv.includes('--dry-run');

const revFile = path.join(generatedDir(ROUND), '_name-revision.json');
const rev = JSON.parse(await readFile(revFile, 'utf8'));

// ── 개정 대상을 소분류별로 모은다 (같은 파일을 여러 번 쓰지 않는다)
const bySub = new Map();
for (const c of rev.changed) {
  const subId = c.ref.split('#')[0];
  const arr = bySub.get(subId) ?? [];
  arr.push(c);
  bySub.set(subId, arr);
}

let applied = 0;
const problems = [];

for (const [subId, list] of bySub) {
  const r = resolveSubId(subId);
  const genFile = path.join(generatedDir(ROUND), `${slugOf(subId)}.json`);
  const doc = JSON.parse(await readFile(genFile, 'utf8'));
  const midDoc = await loadMid(r.midKey);
  const bucket = midDoc.subs[subId];
  if (!bucket) throw new Error(`소재 저장소에 ${subId} 가 없다`);

  for (const c of list) {
    const item = doc.items.find((x) => x.seedId === c.ref);
    if (!item) throw new Error(`${c.ref} 를 찾을 수 없다`);
    if (item.question.answer !== c.from) {
      throw new Error(`${c.ref} 의 현재 정답이 "${item.question.answer}" 다. "${c.from}" 을 기대했다`);
    }

    // ── ★ 표기만 바꾸지 않는다. 질문과 힌트를 다시 검사한다
    const q = item.question.question;
    const checks = checkAnswer(q, c.to, item.question.acceptedAnswers);
    if (checks.length) problems.push({ ref: c.ref, to: c.to, checks, question: q });

    if (!DRY) {
      item.question.answerRevision = {
        round: 'r018',
        rule: 'question-v2',
        previousAnswer: c.from,
        reason: c.reason,
      };
      item.question.answer = c.to;

      // 소재 저장소 쪽
      const seed = bucket.seeds.find((s) => s.seedId === c.ref);
      if (!seed) throw new Error(`소재 저장소에 ${c.ref} 가 없다`);
      seed.question.answer = c.to;
      seed.question.answerRevision = { round: 'r018', rule: 'question-v2', previousAnswer: c.from };

      const ua = bucket.usedAnswers.find((a) => a.origin === `${ROUND}:${c.ref}`);
      if (!ua) throw new Error(`usedAnswers 에 ${ROUND}:${c.ref} 가 없다`);
      ua.answer = c.to;
      ua.note = `r018 인명 개정 (이전: ${c.from})`;
    }
    applied += 1;
    console.log(`  ${c.ref.padEnd(24)} "${c.from}" → "${c.to}"   힌트 ${generateHint(c.to) ?? '(없음)'}`);
  }

  if (!DRY) {
    doc._meta.answerRevision = {
      round: 'r018',
      rule: 'question-v2',
      note: '★ 인명 대표 정답만 개정했다. 질문·해설·평가는 question-v1 으로 만든 그대로다',
      count: list.length,
    };
    await writeFile(genFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    await saveMid(midDoc);
  }
}

/** ★ 새 정답이 질문에 노출되는지 / 힌트가 정답과 같아지는지 다시 본다 */
function checkAnswer(question, answer, variants) {
  const out = [];
  const BOUNDARY = /[\s.,!?'"()[\]{}·~:;/‘’“”–—-]/;
  const qn = question.normalize('NFC');
  for (const cand of [answer, ...(variants ?? [])]) {
    const a = cand.normalize('NFC').trim();
    let from = 0;
    for (;;) {
      const i = qn.indexOf(a, from);
      if (i < 0) break;
      const before = i === 0 ? '' : qn[i - 1];
      const after = i + a.length >= qn.length ? '' : qn[i + a.length];
      if ((before === '' || BOUNDARY.test(before)) && (after === '' || BOUNDARY.test(after))) {
        out.push(`★ 질문에 "${a}" 가 낱말로 노출된다`);
        break;
      }
      from = i + 1;
    }
    if (qn.includes(a) && !out.length) out.push(`격리: 질문에 "${a}" 가 부분 문자열로 들어 있다`);
  }
  const h = generateHint(answer);
  if (h === null) out.push('힌트를 만들 수 없다 (한 글자)');
  else if (normalizeAnswer(h) === normalizeAnswer(answer)) out.push('★ 힌트가 정답과 같아진다');
  return out;
}

console.log(`\n[${DRY ? 'dry-run' : '반영'}] 개정 ${applied}건 / 유지 ${rev.kept.length}건`);
if (problems.length) {
  console.log('\n★★ 다시 봐야 할 것');
  for (const p of problems) {
    console.log(`  ${p.ref} → "${p.to}"`);
    for (const c of p.checks) console.log(`    ${c}`);
    console.log(`    질문: ${p.question}`);
  }
} else {
  console.log('★ 질문 노출·힌트 문제 없음');
}
