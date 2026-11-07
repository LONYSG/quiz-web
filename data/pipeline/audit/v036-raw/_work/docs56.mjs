import fs from 'node:fs';
// 06 — 최신순(맨 위쪽, V035 항목 앞)
let w = fs.readFileSync('docs/06-WORKLOG.md', 'utf8');
const entry = `## 2026-11-07 — G032 pending 나머지 484 일곱 눈 전수 (V036, VERIFY)

- **무엇을**: V035 가 안 본 pending 484 를 사실·알가치·독립 등급·읽기·힌트·유일성·중복으로 전수 판정. 활성 전환 자료.
- **어떻게**: 문항 고정(targets-g032-484) → sonnet 조각 10(50씩 · 동시 2 · WebFetch 위키 원문 필수) → VERIFY 가 fix 230 전부 + keep 표본 26 + 직접 웹 3 재독 · 정답 대조·crossans 기계 대조.
- **결과**: keep 252 · fix 232 · drop 0 · 질문/힌트 사실 틀림 4(7446 · 7179 · 7043 · 7425) · 해설 틀림 9 · unverified 78 · 독립 등급 일치 70%, 647 합산 편향 없음(v4 3·4 가 후함 · 독립 4 는 7건) · 권고 CV-153 (b).
- **남은 것**: CV-153~156(G034) — ai-out/V036.txt · audit/v036-g032.json. 한계: 조각 엄격함 편차 · keep 252 중 226 은 조각만.

`;
const k = '## 2026-11-07 — G032 pending 표본 163 일곱 눈';
if (!w.includes(k)) console.log('MISS 06'); else { w = w.replace(k, entry + k); fs.writeFileSync('docs/06-WORKLOG.md', w); }
// 05 — V035 줄 다음
let s = fs.readFileSync('docs/05-STATUS.md', 'utf8');
const lines = s.split('\n');
const i = lines.findIndex((l) => l.startsWith('> ★ Track D 추가: **V035**'));
if (i < 0) console.log('MISS 05'); else {
  lines.splice(i + 1, 0, '> ★ Track D 추가: **V036**(G032 pending 나머지 484 일곱 눈 전수 — keep 252 · fix 232 · drop 0 · 질문/힌트 사실 틀림 4 · 해설 틀림 9 · 독립 등급 일치 70%, 647 합산 편향 없음(v4 3·4 후함 · 독립 4 는 7건) · 활성 전환 권고 (b) G034 가 fix 묶음 적용 뒤 484 활성 · DB 미적용 · CV-153~156 · `ai-out/V036.txt`)');
  fs.writeFileSync('docs/05-STATUS.md', lines.join('\n'));
}
