import fs from 'node:fs';
const f = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md'; let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('not unique: ' + a.slice(0, 50)); s = s.replace(a, () => b); };
rep('마지막 갱신: **V012**', '마지막 갱신: **V013** ((나) 난이도 3 표본 300 · CV-31~33) · 그 전 **V012**');
const rows = [
  '| CV-31 | G009 묶음(g009a · g009b) 미판정 (V013 0절) | V013 시점에 origin/main 에 g009a/b-verify-targets.json · G009.txt 가 없어(g009-fixes.json 만) 브리핑대로 (나) 로 진행했다. 묶음이 올라오면 다음 V(V009 꼴 — 전수 판정 · blind 재채점 · 2회차 양방향 · 힌트 H0~H12)에서 판정. G011 은 그 판정 뒤 |',
  '| CV-32 | 활성 난이도 3 표본 300 fix 60(20%) — 처리 범위 (V013 2절 · `audit/v013-active3.json`) | 표본(2,386 중 12.6%)에서 fix 20% — 힌트 35(정답 조각 12 · 같은 정답 활성과 같은 사실 11) · 변형 누락 16 · 단정 13 · 해설 9 · 사실 틀림 5 · 정답 비유일 3. 출처별: 옛 라운드(`#NNN` legacy 151) 27.2% · r030g 17.1% · g003 11.4% · g005 5.3% · g001 6.7% — 최근 생성일수록 낮다(생성 규칙 효과). 선택: (a) 60 건만 G011 이 제안대로 고침 (b) 나머지 2,086 도 같은 기준으로 훑는 전수 점검 라운드(힌트 H2·H12 와 변형 누락은 기계 검사가 가능 — 아래 CV-33) (c) 옛 라운드(legacy)만 우선. 기본값 (a) + 변형·H2 기계 검사로 (b) 를 좁힌다. 같은 문항의 V011 CV-20 fix(#2187 · #2412)와 겹침 — 한 번에 고침 |',
  '| CV-33 | H2 에 "번역·한자 뜻풀이로 정답 조각을 건네는 꼴"을 예로 더할지 (V013 6절) | 표본 300 중 12건(4%) — 바우하우스 "짓다+집"(Bau+Haus) · 아파넷 "영문 약칭+망" · 용승 "샘물이 솟는 한자" · 이명법 "첫 글자는 숫자를 뜻하는 한자" · 시즈닝 "길이 들고". hint-check 의 글자 겹침 검사는 못 막는 꼴이라 사람/판정자가 본다. 15 §4-1 H2 에 한 줄 예를 더하면 G011 이후 생성 힌트에 반영된다(설계 판단) |',
];
rep('| C61 | 활성 #3930', rows.join('\n') + '\n| C61 | 활성 #3930');
fs.writeFileSync(f, s);
const r = 'C:/work/quiz-web/ai-out/README.md'; let t = fs.readFileSync(r, 'utf8').split('\n'); const i = t.findIndex((l) => l.startsWith('| V012.txt'));
t.splice(i + 1, 0, '| V013.txt | G009 묶음이 아직 없어 (나) 기존 활성 난이도 3 표본 300(시드 20261017) 품질 점검: ok 240 · fix 60(20%) — 힌트 35 · 변형 누락 16 · 단정 13 · 사실 틀림 5 · 옛 라운드 27% vs 최근 5~11% → `audit/v013-active3.json` · `v013-results.json` · `v013-raw/`. g009a·g009b 미판정 · 반영은 G011 · Sonnet 5.5 · CV-31~33 |');
fs.writeFileSync(r, t.join('\n'));
