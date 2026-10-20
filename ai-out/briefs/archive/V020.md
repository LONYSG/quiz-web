[VERIFY V020]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 하나만 · 끝나면 멈춘다)
TASK: **표본 셋 + 기계 검색 하나** — A. 미니게임 적재본(G016 · DB 1,164) 전수 기계 대조 + 사람 읽기 표본(C78 ② + CV-48 46행 재독 + 무작위 40) B. g009a/b 2회차 "애매" 표본 60 + 3-3 경계 7(C74 ③) C. unverified 로 남긴 질문·해설 문장 전부(C76 ③ · C77 ④ + G013~G015 decisions 의 q/e unverified) D. CV-42 행정 구역 **기계 검색** → 시간 의존 후보 표(설계 판단 재료). 반영은 다음 G
실행 모델: Sonnet 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING 은 V019 가 쓴 다음 **CV-59** 부터 · README V 표 · 조각 `audit/v020-raw/`). 판정자 한 번에 1개 · 메모리 1.5GB.
■ ★★ 동시 라운드 — GEN(G017 — questions 난이도 1 fix 98 + 힌트 52 + 정리 — **questions 를 쓴다**) · MAIN(R055 마무리 — 봇 계정 기록만). VERIFY 몫: V020.txt · audit/v020-* · 13 CV · C74 ③ · C76 ③ · C77 ④ · C78 ②③ 처리 표시 · README V 표. **questions · minigame_* 읽기만**(`docker exec quiz-web-db psql -U quiz -d quizweb` 읽기 질의). B·C 대상 행을 G017 이 그 사이 고쳤으면 `audit/g017-fixes.json` 의 before 값으로 읽고 0절에 적는다(난이도 1 · 힌트 행이 주로 바뀐다 — B 는 g009a/b 라 거의 안 겹친다). git: 내 파일만 · fetch · rebase.
■ 토큰: 넉넉하다 — 네 덩어리 · 판정자는 덩어리마다 1(순서대로).

■ 먼저 읽기
- **ai-out/G016.txt 0 · B · D 절**(적재 표 · rejected 11 · 그림 교체/자름 목록 · CV-47 환산 6 · CV-49 변형 표) · `audit/g016-fixes.json` · 13 **C78 · CV-48** · V017.txt 0절(CV-48 — 46행 429 로 미재독 · GPP · Numbeo) · docs/18(7절 적재 · 값 칸 뜻) · `data/minigame/*/items.json` · `items-2.json` · `worldprice/products.json`
- 13 **C74 ③**(V016 note "애매" · 3-3 경계 S3-07 · S2-21 · S2-12 · L2-26 · C1-22 · S3-05 · L2-04) · `audit/v014-results.json` · `v016-results.json`(items[ref].note · score · facts) · G012.txt(적재 난이도 = blind) · 15 §3-3
- 13 **C76 ③ · C77 ④** · `audit/g013-decisions.json` · `g014-decisions.json` · `g015-decisions.json` · `g0xx-fixes.json`(facts result=unverified · where q/e — 예 #1441 포장지 일화 · #3811 씨 개수 · #2557 주력 총기 · #666 "우리나라에서 딱 하나" · #670 파란 바탕 · #2137 비광 인물)
- 13 **CV-42**(V015 4절 — #2945 · #2956 나주 · #1690 광주광역시) · docs/15 §3-2(한정어)

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · "이미지 없으면 몰입이 안돼." · 설계 판단(2026-10-20): 미니게임 적재본은 **DB 값 = 파일 값** 이 먼저(화면은 MAIN 몫 — VERIFY 는 서버를 띄우지 않는다) · "애매" 는 판정자 한 명의 읽기였으니 다른 판정자가 다시 읽고 blind 난이도도 다시 잰다(G012 적재 난이도와 비교 — 수치만) · unverified 는 **출처 둘 이상**(공식 · 사전 · 기사)으로 닫되 못 닫으면 "still-unverified" 로 두고 틀린 증거가 나오면 fix · CV-42 는 **실제 시행 여부를 공식 문서(법률 · 행안부 고시)로 먼저 확인**하고 — ko 위키 서술만으로 "바뀌었다" 고 하지 않는다.

■ 할 일
A. 미니게임 — ① 기계: DB minigame_items 1,164 ↔ 파일 status=loaded 항목 **전수** 대조(값 · unit · altAnswers · note · explanation · sources · 그림 md5 ↔ assets/minigame 파일 · products.json ↔ minigame_products) → 다른 것 0 이어야 ② 사람: C78 ② 목록(이름 2 price-0018 · 0144 · 새 그림 3 price-0013 · estimate-0069 · which-0286-a · 자른 12 · CV-49 유지 변형 13 · 다식/다식판/큰부리새) **전부** + 무작위 40(게임별 8 · 시드 20261020) 사실 재독(가격 · 값 · 설명 · 출처가 열리는가) + 그림 15 를 Read 로 직접 봄(워터마크 · 글자 · 엉뚱한 대상) ③ CV-48 46행(휘발유 9 · 콜라 37) 현지가 재독 — GPP · Numbeo 다시(429 면 Trading Economics · 공식 통계 등 다른 출처) · ±10% 밖이면 fix ④ 표: 게임별 읽은 수 · ok/fix · 그림 문제.
B. 애매 — v014 · v016 note 에 "애매" 가 든 항목(약 200)에서 표본 60(묶음 고르게 · 시드) + 3-3 경계 7 전부 = 67: 사실(문서 열기) · 질문 규칙(15 §3) · 난이도 blind 재채점(score-v3 꼴 — 질문만 보고 1~5) → DB 난이도와 비교 표 · fix/ok.
C. unverified — g013~g015 decisions/fixes 에서 facts result=unverified · where q/e 인 문장 **전부** 모으기(명시 6 포함 · 수를 0절에) → 출처 둘 이상으로 닫기 → true / false(fix 제안 — 문장 고치기 또는 unverified 문장 빼기) / still-unverified(출처 적기).
D. 행정 구역 — 활성 6,043 의 question_text · explanation · general_hint 를 기계 검색(특별시 · 광역시 · 특별자치시/도 · 도 이름 · 시·군·구 이름 목록 · "통합" · "폐지" · "승격") → 후보 목록 → 2025~2026 개편 사실을 공식 문서로 확인(전남광주통합특별시 · 광주광역시 · 대전충남 등 — **시행됐는가 · 시행일**) → 영향 받는 문항 표(id · 문장 · 무엇이 바뀌나 · 제안: 날짜 한정어 / 행정 구역 소재 빼기 / 그대로) · 영향 없는 후보 수도 적는다. 설계 판단 재료 — 고치지 않는다.
E. 집계 · 보고 — 네 덩어리 fix 율 · 반복 유형 · 다음 G 가 반영할 목록(`audit/v020-*.json` 에 proposal 키로).
■ 웹·토큰 예산: WebSearch **60회 이내** · WebFetch 주 수단 · 판정자 ≤1(덩어리마다 1 · 순서대로).
■ 산출물: `ai-out/V020.txt`(0~7절 · 0절에 A 전수 대조 결과 · 네 표) · `audit/v020-minigame.json` · `v020-ambiguous.json` · `v020-unverified.json` · `v020-admin.json` · `v020-raw/` · 13 CV-59~ · C74 ③ · C76 ③ · C77 ④ · C78 ②③ 끝 표시 · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 · 미니게임 파일 고치기 · 규칙/프롬프트/코드 수정 · Q · 서버 · assets/minigame 파일 바꾸기.
■ 커밋: 위 파일만 · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): DB minigame_items loaded 1,164(price 197 · worldprice 254 · photo 219 · estimate 199 · which 295) · minigame_images 1,002 · products 5 · 파일 status loaded 1,164 · rejected 11 · "애매" note 수(v016 약 218 · v014 는 세서) · unverified q/e 수(세서) · 활성 6,043 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "V020 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
