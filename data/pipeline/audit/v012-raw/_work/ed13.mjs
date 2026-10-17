import fs from 'node:fs';
const f = 'C:/work/quiz-web/docs/13-PENDING-CHECKS.md'; let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('not unique: ' + a.slice(0, 50)); s = s.replace(a, () => b); };
rep('마지막 갱신: **G008**', '마지막 갱신: **V012** (C70 ① 판정 · CV-25~30) · 그 전 **G008**');
const rows = [
  '| CV-25 | worldprice `cc: "EU"` 처리 (V012) — EU 가 targetCc 인 문항 1(worldprice-0046) · shownCc 에 든 3(0001 · 0029 · 0031) | 설계 판단(2026-10-17)대로 적용: 0046 drop(rejected) · 나머지 3 ok(R052 가 "유로 지역" 으로 표시). 나라 행 값(빅맥 EU)은 ok ★ **끝 (V012)** |',
  '| CV-26 | photo several 5(크루통 · 의사봉 · 빵끈 · 애글릿 · 피자 세이버)의 altAnswers (V012) | 판정자 5건 모두 "사진만으로 하나(one)" · altAnswers 추가 제안 0 — 후보 이름(크루톤 · 판사봉 · 빵끈/트위스트 타이)은 문서 근거를 못 열어 unverified 라 그대로 둔다(틀린 증거 없음). 기본값: 지금 변형 유지 · 더 넣지 않는다. 다른 이름을 받고 싶으면 설계 판단 |',
  '| CV-27 | photo fix 율 28.3%(34/120 — 20% 초과 원인 유형) (V012 6절) | (a) CC BY/BY-SA 자름·보정 표시 누락 attribution 13 (b) image 칸 라이선스 틀림 4(처칠·에펠탑·자유의 여신상·0093) (c) 영문 원어 변형 11(B2 위반) (d) 한국어 별칭 누락 9. 사실·그림 문제 0. 기본값: G010 이 제안(attribution 문구·라이선스·변형)대로 고치고, 다음 photo 생성 지시에 "공용 파일 페이지의 라이선스·수정 표시를 그대로 옮긴다 · 영문 변형 금지" 를 넣는다(설계 판단) |',
  '| CV-28 | `scripts/g008-check.mjs` 규칙 (V012) — status 가 `candidate` · verify 가 `null` 이어야 통과(86·87줄) | VERIFY 가 status(verified·rejected)·verify 를 채우자 막힘 1221(642 + 579)이 전부 이 두 규칙이다(다른 규칙 막힘 0). 코드는 VERIFY 가 못 고쳐 두었다 → G010/MAIN 이 "verify 는 null 또는 {round,…} · status 는 candidate/verified/rejected/loaded" 로 넓힌다 |',
  '| CV-29 | 문서로 못 열어 unverified 로 둔 값 76(price 26 · photo 16 · estimate 17 · which 17) (V012 1절) | 틀린 증거는 없다(verdict ok 유지). price 는 사치품 정가·자동차 가격표·막힌 판매처(네이버쇼핑 · SSG · 쿠팡 403)라 독립 재확인이 약하다. 기본값: unverified ok 는 verified 로 적재하되 `reason` 에 남겨 두고, 사치품(병행수입 시세)은 R052 가 "시세 기준" 표시를 붙이거나 G010 이 뺄지 설계 판단 |',
  '| CV-30 | worldprice 품목 그림 iphone.jpg (V012 4절) — 검은 폰 뒷면 세로 이중 렌즈(iPhone 16 계열처럼 보임) · 품목은 iPhone 17 256GB | 판정자가 "17 이 아닐 수 있다" 고 적었으나 기본형 17 의 카메라 배열을 문서로 못 닫아 ok(unverified). 애플 iPhone 17 공식 페이지의 대표 이미지와 대조해 필요하면 G010 이 교체 |',
];
rep('| C61 | 활성 #3930', rows.join('\n') + '\n| C61 | 활성 #3930');
rep('③ **G009**:', '★ **V012 끝** (`ai-out/V012.txt` · `audit/v012-minigame.json` · items.json 의 verify·status): 642 전수 — ok 573 · fix 63 · drop 6 · 그림 508 전수(문제 15) · **CV-25~30** ③ **G009**:');
fs.writeFileSync(f, s);
const r = 'C:/work/quiz-web/ai-out/README.md'; let t = fs.readFileSync(r, 'utf8').split('\n'); const i = t.findIndex((l) => l.startsWith('| V011.txt'));
t.splice(i + 1, 0, '| V012.txt | G008 미니게임 1차 642 전수 재검증(그림 508 · 값 642): ok 573 · fix 63 · drop 6(status verified 573 · candidate 63 · rejected 6) · photo fix 28.3% · worldprice 286 나라 행 전부 ok · g008-check 규칙 CV-28 → `audit/v012-minigame.json` · `v012-raw/` · items.json verify·status. 반영은 G010 · Sonnet 5.5 · CV-25~30 |');
fs.writeFileSync(r, t.join('\n'));
