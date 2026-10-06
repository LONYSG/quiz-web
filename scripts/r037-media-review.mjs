#!/usr/bin/env node
// =============================================================================
// R037 — 미디어 200 → 건우 검토 표본 30  docs/media-deep-review.md
//   입력 data/pipeline/samples/r037-media.json (★ 적재하지 않는다)
//   표본: 장르마다 대중 1 + 팬 세부 3 (예능·가요는 팬 세부 2) = 30 — 팬 세부는 난이도 4 · 3 · 2 를 고루
//   사용법  node scripts/r037-media-review.mjs
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/samples/r037-media.json'), 'utf8'));
const GENRES = ['영화', '애니', '게임', '드라마', '만화·웹툰', '예능', '가요', '해외축구'];
const pick = [];
for (const g of GENRES) {
  const inG = F.items.filter((i) => i.genre === g);
  const pop = inG.filter((i) => i.layer === '대중').sort((a, b) => b.score.dif - a.score.dif || a.ref.localeCompare(b.ref));
  const fan = inG.filter((i) => i.layer === '팬 세부');
  const nFan = g === '예능' || g === '가요' ? 2 : 3;
  const chosen = [pop[0]];
  // 팬 세부 — 난이도 높은 것부터 한 단계씩 돌아가며 (4 → 3 → 2 → 4 …), 같은 단계에서는 알 가치 2 를 먼저
  const byDif = [4, 3, 2].map((d) => fan.filter((i) => i.score.dif === d).sort((a, b) => a.score.wor - b.score.wor || a.ref.localeCompare(b.ref)));
  for (let k = 0; chosen.length < nFan + 1 && k < 30; k++) { const list = byDif[k % 3]; const x = list.shift(); if (x) chosen.push(x); }
  pick.push(...chosen.filter(Boolean));
}
const L = [];
L.push('# 미디어 문제 — 새 깊이 표본 30 (R037 · 건우 검토)', '');
L.push(`> ★ 200건 중 30건. **적재하지 않았다** (\`data/pipeline/samples/r037-media.json\`). 깊이가 맞는지만 보면 된다.`);
L.push('> 칸마다 하나만 표시 — **☐좋음 ☐너무 쉬움 ☐너무 마니악함**', '');
L.push(`- 200건: 대중 ${F.items.filter((i) => i.layer === '대중').length} · 팬 세부 ${F.items.filter((i) => i.layer === '팬 세부').length} (R036 은 55 : 45 → 이번 30 : 70)`);
L.push(`- 이 표본: 대중 ${pick.filter((i) => i.layer === '대중').length} · 팬 세부 ${pick.filter((i) => i.layer === '팬 세부').length}. 팬 세부는 난이도 4·3·2 를 고루 뽑았다`);
L.push('- 점수: 난이도 1~5 · 알 가치(미디어는 2 도 출제, 축구는 3 이상). 힌트는 난이도 3 이상에만', '');
for (const g of GENRES) {
  L.push(`## ${g}`, '');
  for (const i of pick.filter((x) => x.genre === g)) {
    L.push(`**${i.ref}** · ${i.layer === '대중' ? '대중' : '★ 팬 세부'} · 난이도 ${i.score.dif} · 알 가치 ${i.score.wor}  `);
    L.push(`Q. ${i.q}  `);
    L.push(`A. **${i.a}**${i.v.length ? ` (${i.v.join(', ')})` : ''}  `);
    L.push(`해설: ${i.e}  `);
    if (i.hint) L.push(`힌트: ${i.hint}  `);
    L.push('☐좋음 ☐너무 쉬움 ☐너무 마니악함', '');
  }
}
writeFileSync(path.join(ROOT, 'docs/media-deep-review.md'), L.join('\n'));
console.log(`docs/media-deep-review.md — 표본 ${pick.length}건 (대중 ${pick.filter((i) => i.layer === '대중').length} · 팬 세부 ${pick.filter((i) => i.layer === '팬 세부').length})`);
