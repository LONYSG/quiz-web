[GEN G010]  (이 파일이 지시 전체다 — docs/16 2장. G009 를 끝낸 같은 창에서 이어서 한다. 다 읽고 시작한다)
TASK: **미니게임 데이터 2차**(docs/18 형식 · 묶음 파일 `items-2.json`) — price 100(1만 원 미만 보충 포함) · worldprice 품목 **+2** · photo 100 · estimate 100 · which 150 → 그림 git 밖 · zip · V014 묶음. V012 가 끝나 있으면 그 반복 오류 유형(6절)을 먼저 읽고 피한다. **적재 · items.json(1차) 수정 · questions 쓰기는 하지 않는다**
실행 모델: Opus 5.5 (같은 창 — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — G009 가 쓴 다음 DG- · C- 부터 · Q 는 올리지 않는다).
■ ★★ 동시 라운드 — VERIFY(V012 가 `items.json` 의 verify·status 를 쓰는 중이거나 끝났고 → V013 이 g009a/b 를 판정) · MAIN(R051 → R052: 미니게임 항목 표 · 적재 스크립트 — `items*.json` 전부를 읽는다 · verified 만 적재)이 같이 돈다.
- GEN 몫: G009 와 같다 + `data/minigame/<game>/items-2.json`(새 파일만) · `worldprice/products.json` 은 **품목 추가만**(기존 품목 rows 는 글자 하나도 바꾸지 않는다 — 바꾸면 V012 판정과 어긋난다) · `assets/minigame/<game>/` 새 그림만 · `backups/minigame-2026-10-<날짜>-2.zip`.
- ★ `items.json`(1차)은 읽기만. `g008-check.mjs` 를 `items*.json` 전부 읽게 고치는 것은 허용(docs/18 0절 묶음 파일 규칙 — id 유일성은 합쳐서).
- git · 메모리 · 429: G009 와 같다(하위 에이전트 ≤2 · `tmp/g010/work-*`).
■ 토큰: 넉넉하다 — 수량을 줄이지 않는다.

■ 먼저 읽기
- ★ `ai-out/V012.txt` 는 **있다**(2026-10-17 12:37 — 573 ok · fix 63 · drop 6 · CV-25~30). 1차 fix 63 의 반영과 CV-30(iPhone 품목 그림)은 **G011**(이번엔 items.json 불변).
- **docs/18 전체**(0 묶음 파일 규칙 · 1~5 · 6) · ai-out/G008.txt(3절 버린 소재 · 4절 수집 방법 · 6절 판단 · 0절 못 한 것) · **ai-out/V012.txt 전체(있으면 — 특히 6절 반복 오류 · 3절 fix 유형 · CV-25~)** · 13 C70 ①
- scripts/g008-img.mjs · g008-check.mjs · g008-build.mjs(그대로 쓰되 round · 파일 이름만 g010) · data/minigame/*/items.json(1차 소재 — 겹치지 않게) · worldprice/products.json

■ 찬종의 말 · 확정
- (2026-10-16) 1차 수량 안: "얼마게요 200 · 사진 200 · 얼마나 150 · 어느 쪽 300 · 빅맥 계열 품목 5~8 × 나라" → 1차에 price 100 · photo 120 · estimate 100 · which 150 · 품목 3 을 했으니 2차로 채운다. "이미지 없으면 몰입이 안돼." · (저작권) 그림은 git 밖.
- 설계 판단(2026-10-17): worldprice 추가 품목 2 = **스타벅스 카페라테(톨)** · **코카콜라(330ml 캔 또는 500ml 페트 — 한 규격으로 통일)**(구할 수 있는 나라 전부 · 출처는 공식 가격 페이지 · 신뢰할 만한 비교 통계(Numbeo 같은 사용자 입력 통계는 note 에 "사용자 입력 통계" 표시) · 환율은 같은 날 ECB). 못 구하면 대신 **휘발유 1L** · **빅맥 대신 맥도날드 감자튀김(M)** 중 하나.
- price 2차는 **1만 원 미만 40 · 1~10만 25 · 10~100만 20 · 100만+ 15** — 1만 원 미만은 1.5 규칙 때문에 58건을 버렸으니 **공식몰 정가가 있는 상품**(편의점 PB · 제과 · 음료 · 문구 — 정가 표기가 있는 것)을 고른다 · 같은 브랜드 3개 이하 · 1차와 상품 안 겹침.
- ★ **CV-27**(V012 — photo fix 28.3% 의 원인): 공용 파일 페이지의 **라이선스 칸과 수정(자름·보정·회전) 표시를 attribution 에 그대로** 옮긴다 · **영문 원어 변형 금지**(15 B2) · 한국어 별칭은 문서 근거 있는 것만 altAnswers 에.
- photo 2차 100: 1차 category 비율을 거꾸로(everyday 25 · object 20 · place 15 · person 15 · food 10 · animal 10 · logo 5) · 난이도 2~3 을 늘린다(1차는 1 이 61) · 1차 "several"(크루통 · 의사봉 · 빵끈 · 애글릿 · 피자 세이버) 꼴 — 이름이 둘 이상이면 altAnswers 에 모두 · V012 가 한국 표기 근거 약하다고 한 꼴은 피한다.
- estimate 100: kind 섞기 · 1차와 대상 안 겹침 · 열량은 kcal 표기가 있는 출처만 · 추정 범위 넓은 것(그린란드상어 꼴) 피함.
- which 150: bigger 90 · earlier 60 · 그림 있는 항목을 70% 이상으로(1차 54+47/150).

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 도구 — g008-build/check 를 `items*.json` · round g010 으로(이름은 그대로 두고 옵션 추가 허용) · check 가 1차+2차 합쳐 id 유일 · 같은 대상 겹침(이름 정규화)을 막는지. ★ **CV-28**(V012): check 의 status/verify 규칙을 `status ∈ candidate·verified·rejected·loaded` · `verify 는 null 또는 {round,…}` 로 넓힌다 — V012 가 채운 1차 642 가 막힘 0 이어야 "전부 막힘 0" 이다(V012 시점엔 이 두 규칙으로만 1221 막힘).
B. 수집 — 하위 에이전트 게임·category 로 나눠(G008 꼴) · 그림 받기·줄이기 · 정답 모르는 에이전트가 photo 100 맞혀 보기(1차와 같은 방법) · GEN 이 무작위 30 항목 그림 직접 보기.
C. 빌드 — `items-2.json`(status candidate · createdRound G010 · verify null) · products.json 품목 추가 · `node scripts/g008-check.mjs` 전부(1차+2차) 막힘 0 · zip.
D. VERIFY 묶음 · 문서 — `data/pipeline/audit/g010-verify-targets.json`(전수 — 표본 표시 없음) · 05 Track E 행 · 06 · 07 DG- · 13 C(V014 대기 · 먼저 볼 것) · README G 표 · `ai-out/G010.txt`(0절: 게임별 수 · 그림 수 · 버린 소재 · 못 한 것 · 그림 예 5장 경로).

■ DB 쓰기: **불허**. ■ 웹·토큰 예산: WebSearch **300회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤2.
■ 하지 말 것: items.json(1차) · products.json 기존 rows 수정 · 적재 · questions · server/ client/ shared/ · VERIFY·MAIN 몫 문서 · 그림 커밋 · NAVER 키 값 노출(쓸 일 없음).
■ 확인할 것 (원칙 7): 1차 수(642 · 그림 508) · docs/18 0절에 묶음 파일 규칙이 있는지 · V012.txt 유무 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것 → 원칙 메모 → A~D → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "G010 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
