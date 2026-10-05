#!/usr/bin/env node
// =============================================================================
// R036 — 미디어·콘텐츠 샘플 60 → 건우 검토 파일 docs/media-samples-review.md
//   입력 data/pipeline/samples/r036-media.json (★ 적재하지 않는다 — 검토용)
//   사용법  node scripts/r036-media-review.mjs
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/samples/r036-media.json'), 'utf8'));
const ACC = Object.fromEntries(JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/criteria/mid-accessibility.json'), 'utf8')).mids.map((m) => [m.midKey, m.acc]));
const SUB = {
  'L3:kr-screen#2': '한국 영화·드라마 > 2000년대 이후 한국 영화', 'L3:kr-screen#3': '한국 영화·드라마 > 한국 드라마',
  'L3:world-cinema#2': '세계 영화 > 현대 할리우드', 'L3:animation#1': '애니메이션 > 일본 애니메이션', 'L3:animation#2': '애니메이션 > 디즈니·픽사',
  'L3:esports#1': 'e스포츠·비디오게임 > 고전 게임', 'L3:esports#2': 'e스포츠·비디오게임 > 콘솔 게임', 'L3:esports#3': 'e스포츠·비디오게임 > PC·온라인 게임',
  'L3:comics#1': '만화·웹툰 > 일본 만화', 'L3:comics#2': '만화·웹툰 > 미국 코믹스·히어로', 'L3:comics#3': '만화·웹툰 > 한국 만화·웹툰',
  'L3:kr-tv#1': '한국 방송·예능 > 예능 프로그램', 'L3:kr-music#2': '한국 대중음악 > 1990년대 가요', 'L3:kr-music#3': '한국 대중음악 > 2000년대 이후 가요',
  'L3:kr-music#4': '한국 대중음악 > 아이돌·K팝', 'L3:football#3': '축구 > 유럽 리그 (★ 지금 분야 묶음은 "스포츠")', 'new:해외 드라마': '★ 새 소분류 제안 — 세계 영화 > 해외 드라마',
};
const midKey = (sub) => (sub.startsWith('new:') ? 'L2:world-cinema' : sub.replace(/^L3:/, 'L2:').replace(/#\d+$/, ''));
const GENRES = ['영화', '애니', '게임', '드라마', '만화·웹툰', '예능', '가요', '해외축구'];
const items = F.items;
const cnt = (f) => items.filter(f).length;

const L = [];
L.push('# 미디어·콘텐츠 문제 샘플 60 — 건우 검토 (R036)', '');
L.push('> ★ **적재하지 않았다.** 파일로만 있다 (`data/pipeline/samples/r036-media.json`). 깊이의 선을 긋기 위한 샘플이다.');
L.push('> 칸마다 하나만 표시하면 된다 — **☐좋음 ☐너무 쉬움 ☐너무 마니악함** (☐ → ☑ 로 바꾸거나 x 를 넣어 주면 된다)', '');
L.push('## 먼저 볼 것', '');
L.push('- **층** — `대중`: 그 작품을 본 적 없어도 이름은 아는 수준 (지금 기준으로도 출제) / `팬 세부`: 좋아했던 사람이 "아 그거!" 하는 수준 (지금 기준이면 알 가치 2 라 출제하지 않는다)');
L.push(`- 대중 **${cnt((i) => i.layer === '대중')}** · 팬 세부 **${cnt((i) => i.layer === '팬 세부')}** — 채점자(score-v1, 장르를 섞어 따로 매김)는 대중을 전부 알 가치 3, 팬 세부를 2 (${cnt((i) => i.layer === '팬 세부' && i.score.wor === 2)}) / 3 (${cnt((i) => i.layer === '팬 세부' && i.score.wor === 3)}) 으로 갈랐다`);
L.push('- ★ 정하고 싶은 것: **팬 세부 가운데 어디까지 내도 되는가.** "알 가치 2" 라도 이 모임에서 재밌으면 내는 쪽으로 기준을 바꿀 수 있다');
L.push('- 점수: 난이도 1~5 (높을수록 어렵다) · 알 가치 1~5 (3 이상 출제) · 접근성 = 중분류 값 (같은 중분류는 같다). 힌트는 난이도 3 이상에만 붙였다', '');
L.push('| 장르 | 건수 | 대중 | 팬 세부 |', '|---|---|---|---|');
for (const g of GENRES) L.push(`| ${g} | ${cnt((i) => i.genre === g)} | ${cnt((i) => i.genre === g && i.layer === '대중')} | ${cnt((i) => i.genre === g && i.layer === '팬 세부')} |`);
L.push('');
for (const g of GENRES) {
  L.push(`## ${g}`, '');
  for (const i of items.filter((x) => x.genre === g)) {
    const s = i.score;
    L.push(`### ${i.ref} · ${i.layer === '대중' ? '대중' : '★ 팬 세부'} · ${i.era}`);
    L.push(`**Q.** ${i.q}  `);
    L.push(`**A.** **${i.a}**${i.v.length ? ` (그 밖에 인정: ${i.v.join(', ')})` : ''}  `);
    L.push(`해설: ${i.e}  `);
    if (i.hint) L.push(`힌트: ${i.hint}  `);
    L.push(`점수: 난이도 ${s.dif} (${s.difWhy}) · 알 가치 ${s.wor} (${s.worWhy}) · 접근성 ${ACC[midKey(i.sub)] ?? '?'}  `);
    L.push(`소분류: ${SUB[i.sub] ?? i.sub}  `);
    L.push('☐좋음 ☐너무 쉬움 ☐너무 마니악함', '');
  }
}
writeFileSync(path.join(ROOT, 'docs/media-samples-review.md'), L.join('\n'));
console.log(`docs/media-samples-review.md — ${items.length}건`);
