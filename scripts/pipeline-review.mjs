#!/usr/bin/env node
// =============================================================================
// 검수 도우미 (작업 F-3)
//
// ★ 검수 방식은 "JSON 직접 편집" 이다 (R008 판단).
//   CSV 왕복은 인코딩·따옴표 사고가 나기 쉽고, git diff 로 무엇을 고쳤는지 볼 수 없다.
//   ★ 다만 JSON 을 손으로 열어 status 를 바꾸는 것은 실수하기 쉽다
//     (쉼표 하나 빠지면 파일 전체가 깨진다).
//   → 이 스크립트가 그 부분만 대신한다. **판단은 사람이 한다.**
//
// 흐름
//   1. npm run pipeline:review                  검수 시트를 출력한다 (사람이 읽는다)
//   2. npm run pipeline:review -- --approve <ref,ref>   승인
//      npm run pipeline:review -- --reject <ref> --note "이유"
//      npm run pipeline:review -- --approve all           전부 승인
//   3. npm run pipeline:review -- --collect     approved/ rejected/ 로 나눠 저장
//   4. npm run pipeline:load                    DB 적재
//
// ★ 문제 내용을 고치고 싶으면 processed/ 의 JSON 을 직접 편집한다.
//   questionKo / displayAnswer / answers 를 손으로 고쳐도 된다. git diff 에 남는다.
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIRS } from '../pipeline/dist/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const APPROVE = opt('--approve', null);
const REJECT = opt('--reject', null);
const NOTE = opt('--note', null);
const COLLECT = args.includes('--collect');

const processedRoot = path.join(ROOT, DATA_DIRS.processed);
const files = [];
async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith('.json')) files.push(full);
  }
}
await walk(processedRoot);

if (files.length === 0) {
  console.log('[review] processed/ 에 배치가 없다. 먼저 npm run pipeline:process 를 실행한다.');
  process.exit(0);
}

const batches = [];
for (const f of files.sort()) {
  batches.push({ file: f, data: JSON.parse(await readFile(f, 'utf8')) });
}

// ── 승인/반려 적용
if (APPROVE || REJECT) {
  const approveSet = APPROVE === 'all' ? 'all' : new Set((APPROVE ?? '').split(',').filter(Boolean));
  const rejectSet = new Set((REJECT ?? '').split(',').filter(Boolean));
  let changed = 0;

  for (const b of batches) {
    for (const item of b.data.items ?? []) {
      if (item.verdict !== 'accept') continue;
      const isApprove = approveSet === 'all' || approveSet.has?.(item.sourceRef);
      const isReject = rejectSet.has(item.sourceRef);
      if (!isApprove && !isReject) continue;
      item.review.status = isReject ? 'rejected' : 'approved';
      if (NOTE) item.review.note = NOTE;
      item.review.reviewedAt = new Date().toISOString();
      changed += 1;
    }
    await writeFile(b.file, JSON.stringify(b.data, null, 2) + '\n', 'utf8');
  }
  console.log(`[review] ${changed}건의 검수 상태를 갱신했다.`);
  console.log('[review] 다음: npm run pipeline:review -- --collect');
  process.exit(0);
}

// ── approved/ rejected/ 로 나눠 저장
if (COLLECT) {
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const b of batches) {
    const items = b.data.items ?? [];
    const approved = items.filter((i) => i.review?.status === 'approved');
    const rejected = items.filter(
      (i) => i.review?.status === 'rejected' || i.verdict === 'reject',
    );
    const rel = path.relative(processedRoot, b.file);

    if (approved.length) {
      const out = path.join(ROOT, DATA_DIRS.approved, rel);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(
        out,
        JSON.stringify({ _meta: { ...b.data._meta, collectedAt: new Date().toISOString() }, items: approved }, null, 2) + '\n',
        'utf8',
      );
      approvedCount += approved.length;
    }
    if (rejected.length) {
      const out = path.join(ROOT, DATA_DIRS.rejected, rel);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(
        out,
        JSON.stringify({ _meta: { ...b.data._meta, collectedAt: new Date().toISOString() }, items: rejected }, null, 2) + '\n',
        'utf8',
      );
      rejectedCount += rejected.length;
    }
  }
  console.log(`[review] approved/ 에 ${approvedCount}건, rejected/ 에 ${rejectedCount}건 저장`);
  console.log('[review] ★ rejected/ 는 버리지 않는다. 필터 품질 평가와 프롬프트 개선의 근거다.');
  console.log('[review] 다음: npm run pipeline:load -- --dry-run 으로 확인 후 npm run pipeline:load');
  process.exit(0);
}

// ── 검수 시트 출력
const pending = [];
for (const b of batches) {
  for (const item of b.data.items ?? []) {
    if (item.verdict !== 'accept') continue;
    if (item.review?.status !== 'pending') continue;
    pending.push({ ...item, _file: path.relative(ROOT, b.file) });
  }
}

console.log('════ 검수 시트 ════');
console.log(`검수 대기 ${pending.length}건\n`);
if (pending.length === 0) {
  console.log('검수할 것이 없다. (이미 승인/반려했거나 통과한 문제가 없다)');
  process.exit(0);
}

for (const [n, i] of pending.entries()) {
  const g = i.generated;
  console.log(`[${n + 1}] ${i.sourceRef}`);
  console.log(`  질문   ${g.questionKo}`);
  console.log(`  정답   ${g.displayAnswer}`);
  console.log(`  변형   ${g.answers.join(' | ')}`);
  console.log(`  분류   ${g.category} / ${g.difficulty}`);
  if (g.explanation) console.log(`  해설   ${g.explanation}`);
  console.log(`  원문   ${i.source.question}  (정답 ${i.source.correct})`);
  console.log(`  판정   krAccessible=${i.ai.krAccessible} conf=${i.ai.confidence} / 역검증 ${i.backcheck.result}`);
  if (i.review.note) console.log(`  ★ 메모 ${i.review.note}`);
  console.log('');
}

console.log('── 확인해야 할 것');
console.log('  1. ★ 한국인이 답할 수 있는 문제인가');
console.log('  2. ★ 표기 변형이 충분한가. 내가 칠 것 같은 표기가 빠져 있지 않은가');
console.log('  3. 질문에 정답이 드러나 있지 않은가');
console.log('  4. 정답이 유일한가');
console.log('  ★ 메모가 붙은 항목은 반드시 본다. 역검증이 집합 밖 대안을 제시한 것이다');
console.log('');
console.log('── 명령');
console.log('  전부 승인      npm run pipeline:review -- --approve all');
console.log('  일부 승인      npm run pipeline:review -- --approve otdb-xxxx,otdb-yyyy');
console.log('  반려           npm run pipeline:review -- --reject otdb-zzzz --note "이유"');
console.log('  내용 수정      processed/ 의 JSON 을 직접 편집한다 (git diff 에 남는다)');
console.log('  나눠 저장      npm run pipeline:review -- --collect');
