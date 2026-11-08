import fs from 'node:fs';
const ins = (f, afterRe, text) => {
  const L = fs.readFileSync(f, 'utf8').split('\n');
  let i = -1; for (let k = 0; k < L.length; k++) if (afterRe.test(L[k])) { i = k; break; }
  if (i < 0) throw new Error('no anchor ' + f + ' ' + afterRe);
  L.splice(i + 1, 0, ...text);
  fs.writeFileSync(f, L.join('\n'));
};
ins('docs/13-PENDING-CHECKS.md', /^\| C102 \|/, ['| C103 | ★ **끝(V040 — 2026-11-08 · G038 다시 쓴 힌트 표본 250 + 핵심 161 판정 · 주제 G039 뒤 재대조) — 바뀐 힌트 표본 250: ok 238(95%) · fix 12(5%) · drop 0 · revert 0 · coreChanged 0(등급 1: 1 · 2: 0 · 3: 5 · 4: 2 · 5: 4) → 전체 2,315 추정 fix ≈115 · 핵심(C) 161 전부: **사실은 누설 137(85%)** · 핵심 맞음 21 · 덧붙임 3 · 태양계 32 verified · 국가하천 verified(+3 fixes: 무심천 · 광주천 · 화포천 — 86+3=89) · 기계 적용 7 세트 44 fixes 전부 items 에 반영(어긋남 0) · 원소 Tin 1 · label 19 확인) | `ai-out/V040.txt` · `audit/v040-hints.json` · `audit/v040-topics.json` · CV-166 · CV-167 | 설계 결정 CV-167 |']);
ins('docs/13-PENDING-CHECKS.md', /^\| CV-165 \|/, [
  '| CV-166 | V040 다시 쓴 힌트 표본 결과 → 다음 G 가 적용할 fix 묶음 | `audit/v040-hints.json` 의 verdict=fix 12(등급 3: 5 · 5: 4 · 4: 2 · 1: 1) — proposal 전문 포함. 꼴: 단서 약화(#6490 · #4573 · #2782) · 빈말(#4282 · #6695 · #5666) · 사실(#5210 · #4995 · #6699) · 누설 남음(#4128 페널티킥 · #2138 하트 · #6069 포르투갈어 돌려 말하기). 표본 5% → 전체 2,315 중 ≈115(오차 큼). 표본 밖은 판정 안 함 — 적용은 표본 12 만, 또는 같은 꼴 기계 검사(돌려 말한 누설) 뒤. 국가하천 fixes 3 · 원소 Tin 1 은 주제 파일 verify.fixes | 다음 G (설계가 묶음 정함) |',
  '| CV-167 | ★ revert 비율 · 핵심(C) 161 의 사실은 누설 (설계 결정) | ① revert 0/250 · coreChanged 0 — 바뀐 힌트에서 "원래 핵심이었는데 나빠진" 것은 표본에서 못 찾았다(undo 는 보관만). 단 조각 p02·p03 이 trueCls 를 전부 L 로 달아 p01 과 기준이 달랐다(판정 일관성 한계). ② G038 이 핵심(C)으로 둔 161 전부 재판정: 누설 137(85%) · 핵심 맞음 21 · 덧붙임 3 — V038 경계 규칙을 엄격히 쓰면 C 대부분이 L. 그러나 15 H12(G028): 핵심에 필요하면 그대로 쓴다, 서버 R050 shownNorm 이 그 문항을 뒤로 미룬다 → 137 이 실제 판에서 얼마나 나오는지가 열쇠. 결정: (a) 서버 지연을 믿고 C 그대로 · (b) A 로도 읽히는 것만 고침 · (c) 137 전부 제안대로(핵심 약화 위험) | 설계 (권장 b 또는 a — R050 지연이 crossans 쌍을 막는 비율을 판 로그로 실측한 뒤) |',
]);
ins('ai-out/README.md', /^\| V039\.txt \|/, ['| V040.txt | ★ **G038 다시 쓴 힌트 표본 + 주제 G039 뒤 재대조** VERIFY — 바뀐 힌트 250: ok 238 · fix 12 · revert 0 · 핵심 161 중 사실은 누설 137(85%) · 태양계 32 · 국가하천(+3) verified → 적재 세트 30 · 7 세트 44 fixes 어긋남 0 · 원소 Tin 1 · C103 · CV-166 · CV-167 |']);
ins('docs/05-STATUS.md', /^> ★ Track D 추가: \*\*V039\*\*/, ['> ★ Track D 추가: **V040**(2026-11-08 · G038 다시 쓴 힌트 표본 250 ok 238 · fix 12 · revert 0 + 핵심 161 중 누설 137(85%) · 태양계 32 · 국가하천(+3 fixes) verified → 적재 세트 30 · 7 세트 44 fixes 어긋남 0 · `ai-out/V040.txt` · `audit/v040-hints.json` · CV-166~167).']);
const W = fs.readFileSync('docs/06-WORKLOG.md', 'utf8');
const head = '## 2026-11-08 — G038 다시 쓴 힌트 표본 · 주제 G039 뒤 재대조 (V040, VERIFY)\n\n' +
  '- **무엇을**: G038 이 고친 crossans 힌트 2,315 중 표본 250(등급별 50) + 핵심(C) 161 전부를 독립 판정하고, G039 가 건드린 주제 세트(태양계 · 국가하천 · 기계 적용 7 · 원소)를 재대조.\n' +
  '- **어떻게**: 입력 411(before/after/cross/기계 판정 포함) → sonnet 조각 5(첫 조각 VERIFY 전부 재독) → fix 12 + p02 4분의 1 재독(보정 3) · 주제는 영문 위키 표 1:1 · 국가하천은 고시 대신 승격 보도 · 지자체 안내 · 위키 항목으로 간접 근거 · 기계 대조 스크립트.\n' +
  '- **결과**: 표본 ok 238 · fix 12 · revert 0 → 전체 fix ≈115 추정. 핵심 161 중 사실은 누설 137(85%) — CV-167 설계 결정. 태양계 32 · 국가하천 verified(+3) → 적재 세트 30.\n' +
  '- **남은 것**: CV-166(fix 12 적용) · CV-167(C 누설 처리). 한계: 표본 11% · 조각 trueCls 기준 불일치 · 제안 문장 기계 재검사 안 함 · 국가하천 고시 원문 못 봄.\n\n';
const marker = '## 2026-11-08 — 미니게임 2차 순서대로';
if (!W.includes(marker)) throw new Error('worklog marker');
fs.writeFileSync('docs/06-WORKLOG.md', W.replace(marker, head + marker));
console.log('docs ok');
