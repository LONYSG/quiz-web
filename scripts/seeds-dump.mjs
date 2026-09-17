#!/usr/bin/env node
// =============================================================================
// 한 라운드의 생성 결과를 **사람이 읽는 형태**로 뽑는다
//
// ★ 정본은 data/pipeline/generated/<round>/*.json 이다. 이 파일은 읽기용이다.
// ★ 격리된 문항도 함께 싣되 사유와 함께 표시한다 — 왜 버렸는지가 보여야 한다.
//
// 사용법
//   node scripts/seeds-dump.mjs r018
// =============================================================================

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateHint } from '../shared/dist/index.js';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv[2];
if (!ROUND) {
  console.error('라운드를 지정한다. 예: node scripts/seeds-dump.mjs r018');
  process.exit(1);
}

const dir = generatedDir(ROUND);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

const out = [];
const line = (s = '') => out.push(s);

line('='.repeat(78));
line(`${ROUND.toUpperCase()} 생성 전문`);
line('★ 이 파일은 읽기용이다. 정본은 data/pipeline/generated/' + ROUND + '/*.json 이다.');
line('='.repeat(78));

let ok = 0;
let rejected = 0;
let discarded = 0;

for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  const m = d._meta;
  const r = m.seedResult ?? {};
  line('');
  line('#'.repeat(78));
  line(`# ${m.subId}   ${m.categoryPath}`);
  line(`#   프롬프트: ${m.seedPrompt ?? '?'} + ${m.questionPrompt ?? '?'}`);
  line(
    `#   나열 ${r.listedCandidates ?? '?'} → 선택 ${r.actualCount ?? '?'} / ` +
      `남은 쓸 만한 것 ${r.remainingUsable ?? '?'}`,
  );
  if (r.shortfallReason) line(`#   ★ 미달: ${r.shortfallReason}`);
  if (r.estimatedCeiling) line(`#   ${r.estimatedCeiling}`);
  for (const x of r.droppedForOverlap ?? []) line(`#   [제외] ${x.subject} + ${x.aspect} :: ${x.reason}`);
  for (const x of r.consideredButKept ?? []) line(`#   [살림] ${x.subject} + ${x.aspect} :: ${x.reason}`);
  if (r.note) line(`#   [메모] ${r.note}`);
  line('#'.repeat(78));

  for (const it of d.items) {
    const q = it.question ?? {};
    line('');
    line(`[${it.seedId}]`);
    line(`  소재    ${it.seed.subject}  +  ${it.seed.aspect}`);
    line(`  지식축  ${it.seed.knowledgePoint}`);
    if (q.status === 'pending') {
      line('  ★ 아직 문제가 붙지 않았다');
      continue;
    }
    if (q.ok !== true) {
      rejected += 1;
      line(`  ★★ 거절: ${q.rejectReason}`);
      continue;
    }
    line(`  문제    ${q.question}`);
    line(
      `  정답    ${q.answer}` +
        (q.acceptedAnswers?.length ? `   [인정: ${q.acceptedAnswers.join(' / ')}]` : ''),
    );
    line(`  힌트    ${generateHint(q.answer) ?? '(없음 — 한 글자 정답)'}`);
    line(`  평가    접근성 ${q.accessibility} / 난이도 ${q.difficulty} / 알 가치 ${q.worthKnowing}`);
    line(`  해설    ${q.explanation}`);
    if (q.answerRevision) {
      line(`  ★ 정답 개정 (${q.answerRevision.rule}): "${q.answerRevision.previousAnswer}" → "${q.answer}"`);
    }
    if (q.discarded) {
      discarded += 1;
      line(`  ★★ 격리됨 — ${q.discarded.reason}`);
      line(`     판단: ${q.discarded.decidedBy}${q.discarded.duplicateOf ? ` / 중복 상대: ${q.discarded.duplicateOf}` : ''}`);
    } else {
      ok += 1;
    }
  }
}

line('');
line('='.repeat(78));
line(`합계: 적재 가능 ${ok} / 거절 ${rejected} / 격리 ${discarded}`);
line('='.repeat(78));

await mkdir(path.join(ROOT, 'data', 'pipeline', 'samples'), { recursive: true });
const outFile = path.join(ROOT, 'data', 'pipeline', 'samples', `${ROUND.toUpperCase()}-full.txt`);
await writeFile(outFile, `${out.join('\n')}\n`, 'utf8');
console.log(`적재 가능 ${ok} / 거절 ${rejected} / 격리 ${discarded}`);
console.log(`→ ${path.relative(ROOT, outFile).split(path.sep).join('/')} (${out.length}줄)`);
