#!/usr/bin/env node
// =============================================================================
// 소분류 개정으로 고아가 된 문제를 새 소분류로 재배정한다 (R012 작업 C-2)
//
// ★★ 왜 필요한가
//   R012에서 소분류를 개정하면서 15개를 삭제하고 이름을 바꿨다.
//   ★ 그 소분류로 이미 만든 문제 21건이 트리에 없는 값을 참조하게 된다.
//   카테고리는 중복 검사의 기준이고 통계 단위이므로, 없는 값을 참조하면
//   그 문제들이 어느 집계에도 들어가지 않는다.
//
// ★ 자동으로 재배정할 수 있는 것만 표에 넣었다.
//   ★ 표에 없는 것은 사람이 판단한다. 조용히 아무 소분류에 넣지 않는다.
//
// 사용법
//   node scripts/pipeline-remap-subs.mjs --dry-run
//   node scripts/pipeline-remap-subs.mjs
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS } from '../pipeline/dist/config.js';
import { findMid } from '../pipeline/dist/categories.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

/**
 * ★ 재배정 표. "중분류|옛 소분류" → "새 소분류"
 *
 * ★ 근거를 함께 적는다. 나중에 이 매핑이 맞았는지 확인할 수 있어야 한다.
 */
const REMAP = {
  // 애니메이션: 포함 관계를 풀면서 이름이 바뀌었다
  'animation|디즈니·픽사': ['디즈니·픽사 극장 애니메이션', '이름만 바뀌었다'],
  'animation|서양 애니메이션': ['서양 TV 애니메이션', '극장작을 디즈니·픽사로 옮기고 TV로 좁혔다'],
  'animation|성우·제작사': ['제작사·스튜디오', '성우(인물 축)를 떼고 제작사만 남겼다'],

  // 한국 문학: 시대×장르로 재편
  'kr-lit|고전 문학': ['고전 산문', '고전을 산문과 시가로 나눴다. 산문 쪽으로 보낸다'],
  'kr-lit|근대 문학': ['근대 소설', '"근대 문학" ⊃ "시" 포함 관계를 풀어 산문만 남겼다'],
  'kr-lit|시': ['현대 시', '시는 시대를 나누지 않고 한 소분류로 모았다'],

  // 한국 대중음악: 시대 구간 재조정
  'kr-music|1990년대 이전 가요': ['1980년대 이전 가요', '시대 구간을 셋으로 고르게 나눴다'],
  'kr-music|1990~2000년대 가요': ['1990년대 가요', '구간을 쪼갰다. 1990년대 쪽으로 보낸다'],
  'kr-music|노래 제목·가사': ['2000년대 이후 가요', '모든 소분류에 걸치는 축이라 삭제했다'],

  // 한국 영화·드라마: 인물·기록 축 삭제
  'kr-screen|한국 영화': ['2000년대 이후 한국 영화', '시대로 나눴다'],
  'kr-screen|감독·배우': ['2000년대 이후 한국 영화', '인물 축을 삭제했다'],
  'kr-screen|흥행·수상 기록': ['2000년대 이후 한국 영화', '★ 기록 축을 삭제했다 (알 가치 낮음)'],

  // 한국 방송·예능: 인물 축 삭제
  'kr-tv|방송인·MC': ['예능 프로그램', '인물 축을 삭제했다'],

  // 발명·발견: 시대 축과 분야 축을 갈랐다
  'invention|근현대 발명': ['20세기 이후 발명', '이름을 명확히 했다'],
  'invention|과학적 발견': ['물리·화학 분야 발견', '발견을 분야로 나눴다'],
  'invention|노벨상·과학자': ['물리·화학 분야 발견', '인물·제도 축을 삭제했다'],

  // 만화·웹툰
  'comics|만화 캐릭터': ['만화 용어·형식', '캐릭터는 각 지역 소분류에 포함된다'],

  // 스포츠: 기록 축 삭제
  'baseball|선수·기록': ['야구 용어·전술', '★ 인물+기록 축을 삭제했다 (알 가치 1을 유도했다)'],
  'olympic|기록·메달': ['올림픽 상징·의례', '★ 기록 축을 삭제했다'],

  // 공연: 세계 문학과 축이 겹쳤다
  'theatre|연극 고전': ['연극 사조·연출', '★ 희곡 텍스트는 세계 문학으로. 여기는 무대 축이다'],

  // 종교: "기타 종교·종파" 를 축이 있는 이름으로 바꿨다 (원칙 4)
  'religion|기타 종교·종파': ['고대·소수 종교', '"기타" 를 일관된 축의 이름으로 바꿨다'],
};

/**
 * ★★ 재배정하지 않고 **검수 대기로 올릴** 것.
 *
 * ★ 새 소분류 원칙에 맞는 자리가 없는 문제다. 억지로 어디에 넣지 않는다.
 *   근거: 원칙 2·3은 그런 문제를 **만들지 않기 위한** 것이다.
 *   이미 만들어진 것을 새 자리에 끼워 넣으면 원칙을 우회하는 셈이 된다.
 *   → 카테고리를 비우고 검수 메모를 남겨 사람이 결정하게 한다.
 */
const FLAG_FOR_REVIEW = {
  'esports|e스포츠 대회·선수': [
    '★ 인물의 신상을 묻는 문제다 (원칙 2). 새 트리에 자리가 없다.',
    '개정된 "e스포츠 대회·리그" 는 제도·역사만 다룬다. 이 문제는 선수 본명을 묻는다.',
  ].join(' '),
};

const dir = path.join(ROOT, DATA_DIRS.processed);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

let remapped = 0;
let unresolved = [];
const flagged = [];
const log = [];

for (const f of files) {
  const file = path.join(dir, f);
  const batch = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;

  for (const item of batch.items ?? []) {
    if (!item.gen) continue;
    const mid = findMid(item.gen.midKey);
    if (!mid) {
      unresolved.push({ file: f, ref: item.sourceRef, reason: `없는 중분류 ${item.gen.midKey}` });
      continue;
    }
    if (mid.subs.includes(item.gen.sub)) continue;

    const key = `${item.gen.midKey}|${item.gen.sub}`;

    // ★ 자리가 없는 것은 검수 대기로 올린다. 억지로 재배정하지 않는다
    const flag = FLAG_FOR_REVIEW[key];
    if (flag) {
      item.gen.subBefore = item.gen.sub;
      item.gen.sub = null;
      item.gen.needsCategoryDecision = true;
      item.review.status = 'pending';
      item.review.note = item.review.note ? `${item.review.note} / ${flag}` : flag;
      flagged.push({ file: f, ref: item.sourceRef, key, note: flag });
      changed += 1;
      continue;
    }

    const entry = REMAP[key];
    if (!entry) {
      unresolved.push({ file: f, ref: item.sourceRef, reason: `재배정 표에 없다: ${key}` });
      continue;
    }
    const [newSub, why] = entry;
    if (!mid.subs.includes(newSub)) {
      unresolved.push({ file: f, ref: item.sourceRef, reason: `새 소분류가 트리에 없다: ${newSub}` });
      continue;
    }

    log.push(`  ${item.gen.midKey}: "${item.gen.sub}" → "${newSub}"  (${why})`);
    // ★ 옛 값을 지우지 않고 남긴다. 재배정이 맞았는지 나중에 확인할 수 있어야 한다.
    item.gen.subBefore = item.gen.sub;
    item.gen.sub = newSub;
    item.gen.remappedAt = 'R012';
    // source.question 에 요청 경로가 적혀 있으므로 함께 고친다
    if (typeof item.source?.question === 'string') {
      item.source.question = item.source.question.replace(
        new RegExp(`> ${item.gen.subBefore}$`),
        `> ${newSub}`,
      );
    }
    changed += 1;
    remapped += 1;
  }

  if (changed > 0 && !DRY) {
    batch._meta.subsRemappedAt = new Date().toISOString();
    await writeFile(file, JSON.stringify(batch, null, 2) + '\n', 'utf8');
  }
  if (changed > 0) console.log(`[rm] ${f}: ${changed}건`);
}

console.log('');
for (const l of log) console.log(l);
console.log('');
console.log(`[rm] ★ 재배정 ${remapped - flagged.length}건${DRY ? ' (dry-run — 저장하지 않았다)' : ''}`);
if (flagged.length > 0) {
  console.log(`[rm] ★★ 자리가 없어 검수 대기로 올린 것 ${flagged.length}건:`);
  for (const g of flagged) console.log(`   ${g.ref} (${g.key})\n      ${g.note}`);
}
if (unresolved.length > 0) {
  console.log(`[rm] ★★ 사람이 판단해야 할 것 ${unresolved.length}건:`);
  for (const u of unresolved) console.log(`   ${u.file} ${u.ref} — ${u.reason}`);
  process.exit(2);
}
console.log('[rm] 해결하지 못한 항목 없음');
