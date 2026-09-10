#!/usr/bin/env node
// =============================================================================
// Claude Code 가 매긴 알 가치를 반영한다 (R012 작업 E-1)
//
// ★★ 왜 Claude Code 가 매기는가
//   R011의 257건은 **Gemini 가 생성**했다. 그래서 Claude Code 가 평가하는 것이
//   교차 평가다. 자기 생성분을 자기가 평가하는 문제가 없다.
//   ★ Gemini 로 매기려 했으나 429 를 맞았고, Q-62 규칙대로 15분 대기 후 1회 재개했다가
//     또 429 를 맞아 그날 중단했다 (확정 규칙대로 두 번 재개하지 않았다).
//
// ★ 파일(_worth-r011.json)의 scores 에 없는 항목은 defaultScore 를 쓴다.
//   ★ 근거는 그 파일의 defaultReason 에 적었다 — 선별 기준에서 4와 5는 결과가 같다.
//
// 사용법
//   node scripts/pipeline-apply-worth.mjs --dry-run
//   node scripts/pipeline-apply-worth.mjs
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
// ★ 재평가. 이미 매겨진 값도 다시 쓴다 (척도가 바뀐 경우)
const RESCORE = process.argv.includes('--rescore');
const SPEC_FILE = RESCORE
  ? 'data/pipeline/claude-gen/_worth-r011-g4.json'
  : 'data/pipeline/claude-gen/_worth-r011.json';

const spec = JSON.parse(await readFile(path.join(ROOT, SPEC_FILE), 'utf8'));
console.log(`[aw] 척도 파일: ${SPEC_FILE}${RESCORE ? ' (★ 재평가)' : ''}`);
const explicit = new Map(spec.scores.map((s) => [s.ref, s]));
const DEFAULT = spec._meta.defaultScore;

const dir = path.join(ROOT, DATA_DIRS.processed);
// ★ R011 배치만 대상으로 한다. R012 비교 배치는 이미 알 가치가 있다
const files = (await readdir(dir)).filter((f) => f.startsWith('2026-09-09-gen') && f.endsWith('.json'));

let applied = 0;
let byExplicit = 0;
const dist = {};
const low = [];

for (const f of files) {
  const file = path.join(dir, f);
  const batch = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;

  for (const item of batch.items ?? []) {
    if (!item.gen || !item.generated?.questionKo) continue;
    // ★ 재평가가 아니면 이미 매겨진 것은 건너뛴다
    if (!RESCORE && (item.gen.worthKnowing ?? 0) > 0) continue;

    const e = explicit.get(item.sourceRef);
    const v = e ? e.worthKnowing : DEFAULT;
    item.gen.worthKnowing = v;
    // ★ 누가 매겼는지와 근거를 남긴다. 생성 때 매긴 것과 구분해야 한다
    item.gen.worthScoredBy = RESCORE ? 'claude-code-R013-g4' : 'claude-code-R012';
    item.gen.worthReason = e ? e.reason : spec._meta.defaultReason.join(' ');
    dist[v] = (dist[v] ?? 0) + 1;
    if (e) byExplicit += 1;
    if (v <= 3) {
      low.push({
        ref: item.sourceRef,
        score: v,
        mid: item.gen.midKey,
        sub: item.gen.sub,
        access: item.gen.accessibility,
        diff: item.gen.difficultyScore,
        q: item.generated.questionKo,
        a: item.generated.displayAnswer,
        reason: item.gen.worthReason,
      });
    }
    applied += 1;
    changed += 1;
  }

  if (changed > 0 && !DRY) {
    batch._meta.worthScoredAt = new Date().toISOString();
    batch._meta.worthScoredBy = RESCORE ? 'claude-code-R013-g4' : 'claude-code-R012';
    await writeFile(file, JSON.stringify(batch, null, 2) + '\n', 'utf8');
  }
  if (changed > 0) console.log(`[aw] ${f}: ${changed}건`);
}

console.log('\n──────────────────────────────────────────');
console.log(`[aw] 반영 ${applied}건 (직접 판단 ${byExplicit}건 / 기본값 ${applied - byExplicit}건)${DRY ? ' (dry-run)' : ''}`);
console.log(`[aw] 알 가치 분포: ${[1, 2, 3, 4, 5].map((k) => `${k}:${dist[k] ?? 0}`).join(' ')}`);
console.log('');
console.log(`★ 알 가치 3 이하 ${low.length}건 — 건우가 기준이 맞는지 확인할 목록:`);
for (const l of low.sort((a, b) => a.score - b.score)) {
  console.log(`  [알가치 ${l.score}] 접${l.access}/난${l.diff}  ${l.mid} > ${l.sub}`);
  console.log(`     Q. ${l.q}`);
  console.log(`     A. ${l.a}`);
  console.log(`     판단 근거: ${l.reason}`);
}
