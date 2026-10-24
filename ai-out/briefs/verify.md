[VERIFY V024]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: **미니게임 데이터 3차 609 + 새 게임 photoyear 1차 100 전수 재검증**(C80 · `data/minigame/*/items-3.json` 다섯 + `photoyear/items.json` + `worldprice/products.json` 에 덧붙인 나라 행 69) — V012 · V017 꼴 그대로: 그림 627 전수 Read · 값 전수 · `verify` 칸과 `status` 를 **items-3.json · photoyear/items.json · 덧붙인 나라 행에만** 직접 쓴다. 반영·적재는 GEN(G021). ★ 처음 보는 게임 photoyear 는 docs/18 §8 기준으로 본다.
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING-CHECKS 는 V023 이 쓴 다음 **CV-72** 부터 · C80 처리 표시 · README V 표 · 조각 `audit/v024-raw/`). 판정자 한 번에 1개 · 남는 메모리 1.5GB(모자라면 2분 × 10 · 그래도 1개는 띄운다). 찬종에게 묻지 않는다(결정은 CV 로).
■ ★★ 동시 라운드 — **GEN 이 G019(상 생성 4차 g019b)를 같은 PC 에서 돌리고 있다**(tmp/g019 · data/pipeline/generated · audit/g019-* · 15 · questions 읽기 — **data/minigame 은 안 건드린다**). MAIN 은 쉼(찬종이 플레이 · 제보 중 — 실 서버 3000 · 브라우저 · 터널은 건드리지 않는다). VERIFY 몫: V024.txt · audit/v024-* · **items-3.json 다섯 · photoyear/items.json 의 verify·status 칸 · products.json 덧붙인 나라 행(id 가 G018 addedRows 인 것)의 verify 칸만** — 1·2차 items.json · items-2.json · 기존 나라 행 · 다른 칸은 글자 하나도 안 바꾼다(기계로 확인 · `node scripts/g008-check.mjs` 1·2·3차 + photoyear 막힘 0 유지) · 13 C80 "★ V024 끝" + CV-72~ · README V 표. 05 · 06 · 13 · README 는 GEN 과 같이 쓴다 — 쓰기 직전 `git fetch` · `git rebase origin/main` · 내 파일만 add · force 금지. 하위 에이전트 ≤1(GEN 도 1 — PC 메모리 16GB).
■ 토큰: 넉넉하다 — 709 전수 · 그림 627 전수 · 나라 행 69 전수. 표본으로 줄이지 않는다.

■ 먼저 읽기
- docs/16 · **docs/18 전체**(0 공통 · 1~5 · **6 재검증 기준** · 7 적재 · **★ 8 photoyear** — 연도 1826~2026 정수 · yearKind exact/circa(범위 20년 이하) · region kr/world · difficulty · 그림 필수 자유 라이선스 · 같은 사진·같은 제목 겹침 금지 · 그림 안 연도 글자 금지) · `ai-out/briefs/archive/V017.md`(2차 지시 — 판정 칸 규칙 · 조각 · 2차 새 기준 ①~③ 그대로) · **ai-out/V017.txt 전체**(판정 꼴 · 2절 종류별 · 1차 반복 유형 a~d — 3차에서 또 나오는지 센다 · CV-47~51) · ai-out/V012.txt 6절 · **ai-out/G018.txt 전체**(0절 표 · 버린 소재 175 · 맞혀 보기 결과 · GEN 판단 DG-056 · 못 한 것) · 13 **C80 전체**(먼저 볼 것 ①~⑤)
- `data/pipeline/audit/g018-mg-verify-targets.json`(709 전수 — games.price/photo/estimate/which/photoyear.items · worldprice.items 69 + addedRows) · `audit/g018-gen-fixes.json`(8) · `data/minigame/photoyear/README.md` · scripts/g008-check.mjs(읽기 전용)
- 그림: 이 PC `assets/minigame/<game>/`(git 밖 · 없으면 `backups/minigame-g018.zip` 에서 **assets/minigame 만** 풀어 쓴다 — data/minigame 은 zip 것으로 덮지 않는다)

■ 찬종의 말 · 확정(V012 · V017 과 같다): "이미지 없으면 몰입이 안돼." · EU 는 순위 표만 · 목표 나라 불허 · 영문 원어 변형 금지(B2) · photo 라이선스 칸은 공용 페이지와 같아야 · CC BY/BY-SA 손질은 attribution 에 표시 · 한국어 별칭은 문서 근거 있는 것만 · worldprice 콜라 Numbeo 는 "통계 그대로인가" + note "사용자 입력 통계" · estimate 외화는 fix(원화 환산 · 원래 통화 note) · 세븐일레븐 ajax 출처는 상품 페이지 안 열리면 unverified.
■ ★ 3차 새 기준(설계 판단 — CV 로 확정)
 ① **photoyear 연도 근거**: sources[0].note 의 파일 페이지 날짜 칸(촬영일 · "date" 칸)이 year 와 맞는가 — 업로드 날짜 · 출판 날짜를 촬영 연도로 쓴 것은 fix(circa 로 바꾸거나 근거 연도로) · 근거 자체가 없으면 drop. circa 4 는 범위 ≤20년 · 중앙값이 year 인지. 그림 안 **연도 글자**(간판 · 자막 · 날짜 스탬프)는 drop 후보 — 단 창업 연도 같은 "다른 연도" 글자(C80 ① 0032 'Since 1974' · 0035 '1937')는 ok 로 두되 note. 같은 기관 묶음(Agence Rol 3 · Bundesarchiv 6 · Anefo 5)은 사진끼리 장면이 겹치지 않는지. **얼굴이 크게 나온 개인 사진**은 drop(GEN 이 9 버림 — 남은 것 중 더 있는지).
 ② **photoyear 맞혀 보기**: 정답 모르는 판정자(그림 + cues 만 · 연도 없음 · 웹 없음)가 연도를 적는다 → 중앙 오차 · 난이도별 오차 → difficulty 100 재매김(1 = ±3년 · 2 = ±10년 · 3 = 그 밖 — GEN 배분 1:9 · 2:51 · 3:40 과 비교). ★ V019 blind 교훈: 판정자가 사람보다 잘 맞힌다 — 재매김은 "판정자 오차 × 1.5" 로 본다(CV 에 적는다).
 ③ price 1.5 규칙은 다나와 첫 화면 기준(C80 ②) · 사치품 2(오메가 · 티파니 — 두 출처가 같은 회사 페이지 → 다른 판매처 하나 더 열어 닫히면 ok · 안 열리면 unverified) · 자동차 4.
 ④ which 차이 1.45배 · 8년 — 경계 근처(1.45~1.6 · 8~10년)는 값을 두 문서로 · 측우기 1441/1442 · 명동성당 1898 축성(C80 ③)은 CV 로 정한다(어느 연도를 쓰는지 — 공식 문서 하나를 근거로).
 ⑤ worldprice 덧붙인 나라 행 69: 콜라 Numbeo 10월 값(기존 행보다 사흘 뒤 — 같은 품목 안 asOf 가 둘인 것을 CV 로 ok/fix) · 불가리아 EUR(2026 유로 도입 — 통화 칸이 맞는지) · 환율 ±3%. V017 처럼 429 가 나면 다른 표(Trading Economics 등) ±10% 로 닫고 unverified 수를 적는다.
 ⑥ photo 맞혀 보기 못 맞힘 2(0300 구세주 그리스도상 · 0303 손기정 unknown — C80 ⑤) · 이웃 열쇠 5쌍 바뀜 사고는 G018 이 고쳤는지(결과 파일 키 대조).

■ 할 일
A. 그림 627 전수(대상인가 · 정답/연도 글자 노출 · 워터마크 · 흐림 · which 그림 쌍 108 · photoyear 100 — 얼굴 · 연도 글자 · 라이선스 칸 = 공용 페이지).
B. 값 전수 — price 100(출처 · 1.5 규칙 · 단위/묶음 ↔ 그림) · worldprice 문항 69 + 나라 행 69 + 환율 · photo 120(변형 · 라이선스 · attribution · 유일성) · estimate 100(단위 · 환산 · asOf · 출처 문장) · which 120(값 · 연도 · 차이) · photoyear 100(①).
C. 맞혀 보기 — photo 120 정답 모르는 판정자(V017 꼴) · **photoyear 100(②)** → photo difficulty 120 · photoyear difficulty 100 재매김.
D. 반복 유형(V012 6절 a~d · V017 2절)이 3차에서 몇 건인지 — 1·2·3차 표.
E. verify·status 쓰기(ok→verified · drop→rejected · fix→candidate) — items-3.json 다섯 · photoyear/items.json · 나라 행 verify 칸.
F. g008-check 1·2·3차 + photoyear(1,784) 막힘 0 확인(시작 · 끝) · 1·2차 파일 · 기존 나라 행 바이트 불변(git diff 로).
G. 직접 재독(fix · drop 전부 · ok 10%).
■ 웹·토큰 예산: WebSearch **80회 이내** · WebFetch 주 수단(판정자도 WebFetch 만 · url 을 JSON 에) · 판정자 ≤1 · 조각 30~40.
■ 산출물: `ai-out/V024.txt`(0~7절 — 0절 게임별 표 ok/fix/drop · 1·2차와 fix 율 비교 · photoyear 맞혀 보기 오차 표 · unverified 수) · `audit/v024-minigame.json`(709 모두 키로 · 나라 행은 worldprice 아래) · `v024-raw/` · items-3.json 다섯 · photoyear/items.json · products.json(덧붙인 행 verify 만) · 13 C80 "★ V024 끝" + CV-72~ · README V 표.
■ 하지 말 것: DB 쓰기 · 항목 고치기(제안만 — fix 는 proposal 에) · 그림 파일 수정 · 1·2차 파일 · 기존 나라 행 · 규칙/프롬프트/코드 수정 · Q · 서버 · 빌드 · questions 판정(g019a 는 V025) · GEN 의 tmp/g019 · generated 건드리기.
■ 커밋: 위 파일만 · 묶음(게임)마다 커밋 · fetch → rebase → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 3차 609(price 100 · worldprice 69 · photo 120 · estimate 100 · which 120) + photoyear 100 · 그림 627 · 덧붙인 나라 행 69(iphone 2 · 콜라 34 · 휘발유 33) · 전부 candidate · verify null · g008-check 1,784 막힘 0 · assets/minigame/photoyear 100장 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "V024 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
