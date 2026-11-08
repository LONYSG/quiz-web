[VERIFY V042 — ★ **OX 400 전수 판정**(docs/18 §11 · G041 d31930c4) — 참/거짓이 맞나(웹 · **knowledge 226 우선** · 인문·사회 web 5/58 먼저) · "거의 맞는 거짓" · 애매(시점 · 해석 · 정의) · 부정문 · 길이 · explanation 사실 · grade 표본 · 쌍 → 항목마다 `verify` + `status` **파일에** · 판정만 · 웹 있음 · DB 없음 · C108 · CV-170~171 · Sonnet · 3~4시간 · V041 과 같은 창에서 이어서]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: G041 이 OX 400 을 새로 생성(참 200 · 거짓 200 · 대분류 7 · 중분류 63 전부 · grade 165/158/77 · trap name 40 · place 44 · number 43 · cause 39 · time 34 · 쌍 44) — 사실 확인 **web 174 · knowledge 226**(인문·사회 5/58 · 문화·예술 14/58 이 가장 약함) · "거의 맞는 거짓" 은 지시서로만 막았고 기계 검사 없음. OX 는 한 문장이 곧 정답이라 **틀린 문장 하나가 그대로 오답 판정**이 된다 → 전수. MAIN R085 가 OX 게임을 만들고 실 DB 에는 verified 만.
실행 모델: Sonnet 5.5 (V041 과 같은 창)

■ 고정 규칙: docs/16 5-3 그대로 + **예외**: `data/minigame/ox/items.json` 항목의 **`verify` · `status` 만**(한 번에 쓰기 · `node scripts/ox-check.mjs` 막힘 0). 13 **C108** · **CV-170**(fixes 묶음 → G043) · **CV-171**(규칙 후보 — 거의 맞는 거짓 기계 기준 · grade 눈금 · 쌍 비율) · README V · 05 · 06. 조각 `audit/v042-raw/`. **DB 없음 · 웹 있음**(UA `quiz-web-v042/1.0` · WebFetch/WebSearch ≤ 400 — knowledge 226 전부 + web 174 중 표본 60 재확인 · 위키 REST 자유).
■ 동시 라운드 — MAIN R084/R085(ox 파일 읽기만) · GEN G042(힌트 · topics 2) — 겹침 없음. 문서 분담: V042 = 13 C108 · CV-170~171 · README V · ox 파일.

■ 먼저 읽기: docs/18 **§11 전체**(칸 · 생성 규칙 — 한 축 · 2배 숫자 · 시점 의존 금지 · 부정문 금지 · ★ 게임 규칙 줄) · `ai-out/G041.txt`(0절 ①②③④⑤ · 4 한계) · `audit/g041-raw/_work/INSTRUCTIONS.md`(조각 기준 · 나쁜 예 5) · `scripts/ox-check.mjs` · docs/15 §7(소재) · `data/minigame/ox/items.json`(factClaim · sources.basis).

■ 판정 틀(문장마다)
 (1) **사실**: `basis: knowledge` 226 — 전부 웹으로 닫는다(문서 1 · 못 닫으면 `unverified` 로 두고 status 는 candidate) · `web` 174 — 출처 URL 을 WebFetch 로 대조 표본 60(분야 고르게) + 나머지는 출처가 주장을 담는지 제목·요지로 · 참 문장은 **문장 전체**가 참인가(한 부분만 틀려도 거짓) · 거짓 문장은 **explanation 의 "실제로는"** 이 참인가 + 함정 축 하나만 틀렸나(두 축이면 fix) · 숫자 함정은 **2배 또는 자릿수**(§11) — "거의 맞는" 이면 fix(다른 숫자 제안).
 (2) **애매**: 시점 의존(현직 · 최신 · 최다 · 최고) · 해석(최초 · 대표 · 가장 유명) · 정의 다툼 · 지역차 → `drop` 또는 fix(문장을 닫히게 고침 제안).
 (3) **문장**: 40~90자 · "다." · 부정문 · 두 사실 접속(한 문장에 주장 둘 — 어느 쪽이 거짓인지 흐림) · 질문꼴 · 맞춤법 → fix.
 (4) **grade 표본** 분야마다 10(70): g1 이 정말 국민 상식인가 · g3 가 너무 전문적인가(15 §5-4 친숙도 꼴) → 메모(tagNotes · status 안 내림 · CV-171).
 (5) **쌍 44**: 같은 사실 · 참/거짓 하나씩 · pairId 대칭 → 깨진 것 fix.
 (6) **status**: 사실 맞음 + 문장 문제 없음 → **verified** · 고칠 것 → candidate + proposal(fix) · 애매 · 사실 못 닫음 · 소재 위반 → **rejected**/unverified · 결과 `audit/v042-ox.json`(400 전부 키).
■ 조각: sonnet · 동시 2 · 분야별 7 조각(≈57) · 첫 조각(한국)을 VERIFY 가 전부 읽고 기준 맞춘 뒤 나머지 · 재독 = **fix · drop · unverified 전부 + 거짓 200 중 ok 표본 40**(거짓 문장의 "실제로는" 이 틀리면 치명적) + 참 ok 표본 20.

■ 할 일: A 준비(ox-check 막힘 0 · 400 · candidate · 13 마지막(C107 → **C108**) · README V 마지막 V041 · 지시서 · knowledge 226 목록) · B 조각 → 재독 → `audit/v042-ox.json`(커밋 1) · C 파일 verify · status 한 번에 → ox-check 막힘 0(커밋 2) · D 13 C108 · CV-170(fixes 묶음 — 숫자 다시 n · 문장 n · 축 n · 쌍 n → G043) · CV-171 · README V · 05 · 06 · `ai-out/V042.txt`(0 ★ 찬종이 볼 것: ① verified / fix / rejected / unverified 수 · 참/거짓별 · 분야별 → "지금 실 DB 에 적재되는 OX n" ② 틀린 참 문장 수 + 예 5 ③ 거짓인데 "실제로는" 이 틀린 수 + 예 ④ 거의 맞는 거짓 수 ⑤ grade 메모 · 1~7절 — 못 닫은 것 수)(커밋 3).
■ 하지 말 것: statement · explanation 고치기(제안만) · DB · 코드 · ox-check.mjs · 18 · 13 A · C106 · C107 · CV-166~169 · README G · R · song · topics · 같은 문장 두 번 판정.
■ 커밋: 위 파일만 · 1~3 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): ox 400 · 참 200 · 거짓 200 · knowledge 226 · 인문·사회 web 5 · 쌍 44 · grade 165/158/77 · 13 마지막 C107 · README V 마지막 V041 · MAIN · GEN 돎.
■ ★ 이어서: 끝나면 멈춘다(verify-next2.md 없음). 터미널 마지막 줄 "V042 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
