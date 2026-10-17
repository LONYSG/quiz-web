import fs from 'node:fs';
const f = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md'; let t = fs.readFileSync(f, 'utf8').split('\n');
const i = t.findIndex((l) => l.startsWith('| CV-33 |')); if (i < 0) throw new Error('CV-33 없음');
const rows = [
  '| CV-34 | g009a 판정 결과 처리 — ok 351 · fix 109 · drop 4 · 상(4) 유지율 41% (V014 0·2절 · `audit/v014-results.json`) | 464 전수. 질문·해설 사실 문제는 적고(fact-error 3 · assertive 7 · not-unique 3) **힌트 fix 76**(대표 정체·일화 famous-one 59) · 변형 21 · 2회차 37 중 drop 4 + fix 12. blind 재채점 4 이상 191(GEN 251) · 독립 채점자 100건에서는 23%(판정자 같은 100건 44%). 선택: (a) fix 109 를 G011 이 제안대로 고치고 drop 4 를 빼서 적재(들어가면 상 약 190판) (b) 4 이상이 41% 라 g009b 와 합쳐 상 비율을 보고 적재 범위를 정함 (c) 적재 전에 판정자 한 명이 더 본다(famous-one 경계). 기본값 (a) — 적재 뒤 "상 목표 4" 는 재채점 값을 따른다(CV-14 선례) |',
  '| CV-35 | g009b 미판정 (V014 0절) | V014 종료 시점까지 origin/main 에 g009b-verify-targets.json 이 없었다(g009a 만 올라옴). 올라오면 다음 V 에서 V014 g009a 꼴(RUBRIC · 조각 g · 독립 채점)로 판정 — 기준 파일 `v014-raw/g009a/` 재사용 |',
  '| CV-36 | 활성 난이도 3 전체 2,386 fix 586(24.6%) — 처리 순서·범위 (V014 2절 · `audit/v014-active3.json`) | 표본(20%)보다 전수(25.2%)가 높다 — 옛 라운드 legacy# 34~35%(1,196건 중 약 410) · r030g 24% · 최근 g001·g003·g005 8~10%. 선택: (a) 전체 586 을 G011 이 순서대로 고침(legacy# 먼저 · 제안 힌트 없는 45 는 문서에서 새로 찾음) (b) 힌트 사유(h-*) 331 만 먼저 (c) 적재된 최근 생성분(g001~g005)은 두고 legacy# · r030 만. 기본값 (a) — 제안은 판정자 한 명 읽기라 새 사실(힌트·변형)을 적용 전 열어 본다 |',
  '| CV-37 | H9 "대표 일화·정체" 경계 — 힌트 famous-one (V014 3절 · 6절 ①) | g009a 힌트 422 중 famous-one 59(14%) · 난이도 3 나머지 h-famous 51 + h-letters 103. 판정자 사이에서 "아는 사람에겐 직접적"인 힌트(예: S3-10 여자 단식 · H2-21 두려움 없는 소녀 · C2-18 K-Ar 연대 측정)가 ok/fix 로 갈린다(note "애매" 176). 15 §4-1 H9 에 "대표 쓰임·대표 일화·상징 동상은 정체로 센다" 한 줄 예를 더할지(설계 판단) |',
  '| CV-38 | 사실 확인이 갈려 판정자 ok 인 채 남은 것 (V014 4절) | #4339 수영 연도(질문 1934 · 문서 1935) · #4365 켈름스콧 설립 1891/1892 · #3980 아치교·고가교(쓰임 한정을 넣으면 #493 정의가 범주 단서) fix vs drop · g009a S3-42 윈드서핑 1984 지위(문서 간 상충) · K3-11 이상 힌트 · M1-22 — G011 이 문서로 닫는다 |',
];
t.splice(i + 1, 0, ...rows);
let s = t.join('\n');
const a = '마지막 갱신: **V013** ((나) 난이도 3 표본 300 · CV-31~33)'; if (!s.includes(a)) throw new Error('header');
s = s.replace(a, () => '마지막 갱신: **V014** (난이도 3 나머지 2,086 전수 · g009a 464 판정 · CV-34~38) · 그 전 **V013** ((나) 난이도 3 표본 300 · CV-31~33)');
fs.writeFileSync(f, s);
const r = 'C:/work/quiz-web/ai-out/README.md'; const u = fs.readFileSync(r, 'utf8').split('\n'); const k = u.findIndex((l) => l.startsWith('| V013.txt'));
u.splice(k + 1, 0, '| V014.txt | 활성 난이도 3 나머지 2,086 전수(ok 1,560 · fix 526 = 25.2% · 전체 2,386 중 fix 586 = 24.6% · legacy# 35% vs 최근 8~10%) + 중간에 올라온 g009a 464 전수(ok 351 · fix 109 · drop 4 · blind 재채점 4 이상 191 = 41% ← GEN 54% · 독립 채점자 100건 23%) → `audit/v014-active3.json` · `v014-results.json` · `v014-raw/` · g009b 미판정 · 반영은 G011 · Sonnet 5.5 · CV-34~38 |');
fs.writeFileSync(r, u.join('\n'));
console.log('ok');
