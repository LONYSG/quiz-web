[VERIFY V017]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. ★ 밤샘 사슬 1/2 — 끝나면 같은 창에서 `verify-next.md` 를 읽고 V018 을 바로 시작한다)
TASK: **미니게임 데이터 2차 533 전수 재검증**(C72 · `data/minigame/*/items-2.json` + `worldprice/products.json` 새 품목 2) — V012 꼴 그대로: 그림 503 전수 Read · 값 전수(새 품목 휘발유 42국 · 콜라 43국 나라 행 전부 · 환율) · `verify` 칸과 `status` 를 **items-2.json 과 새 품목 rows 에만** 직접 쓴다. 반영·적재는 GEN(다음 라운드)
실행 모델: Sonnet 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING 은 V016 이 쓴 다음 **CV-47** 부터 · README V 표 · 조각 `audit/v017-raw/`). 판정자 한 번에 1개 · 메모리 1.5GB(모자라면 2분 × 10 · 그래도 1개는 띄운다).
■ ★★ 동시 라운드(밤샘 — 세 창) — GEN(G012 g009b 적재 → G013~G015 활성 fix 반영 — questions · 15 · pipeline · 13 CV-3x/4x 처리 표시) · MAIN(R055 검사 — server/ client/ docs/design · 13 A). VERIFY 몫: V017.txt · audit/v017-* · **items-2.json 의 verify·status 칸 · products.json 새 품목 2(gasoline · cocacola) rows 의 verify 칸만** — 1차 items.json · 1차 품목 3 · 다른 칸은 글자 하나도 안 바꾼다(기계로 확인 · `node scripts/g008-check.mjs` 1차+2차 막힘 0 유지) · 13 C72 처리 표시 + CV-47~ · README V 표. git: 내 파일만 · fetch · rebase · force 금지. 찬종은 없다 — 묻지 않는다.
■ 토큰: 넉넉하다 — 533 전수 · 그림 503 전수 · 나라 행 85 전수. 표본으로 줄이지 않는다.

■ 먼저 읽기
- docs/16 · **docs/18 전체**(0 공통 칸 · 묶음 파일 규칙 · 1~5 · 6 재검증 기준 · 7 적재) · **`ai-out/briefs/archive/V012.md`**(1차 때 지시 — 판정 칸 규칙 · 조각 방식 · C70 ① 꼴 · 그대로 따른다) · **ai-out/V012.txt 전체**(판정 꼴 · 3절 fix 꼴 · 6절 반복 유형 — 2차에서 같은 유형이 또 나오는지 센다 · CV-25~30) · ai-out/G010.txt(0절 표 · 버린 소재 · 못 한 것 · 9절 estimate 외화 6) · 13 **C72 전체**(먼저 볼 것 ①~④)
- `data/pipeline/audit/g010-verify-targets.json`(533 전수) · `audit/g010-gen-fixes.json`(4) · scripts/g008-check.mjs(읽기 전용 — items*.json · --products)

■ 찬종의 말 · 확정
- "이미지 없으면 몰입이 안돼." · 그림은 git 밖(이 PC `assets/minigame/` · `backups/minigame-2026-10-18-2.zip`) · 설계 판단(V012 와 같다): EU 는 순위 표만 · 목표 나라 불허 · 영문 원어 변형 금지(B2) · photo 라이선스 칸은 공용 페이지와 같아야 · CC BY/BY-SA 손질(자름·보정)은 attribution 에 표시 · 한국어 별칭은 문서 근거 있는 것만. **2차 새 기준**: ① worldprice 콜라는 Numbeo 사용자 입력 통계 — 값은 "통계 그대로인가" 만 보고 note 에 "사용자 입력 통계" 표시가 있는지 ② estimate 외화 6(역사 금액) — docs/18 §0 "원 단위 정수" 와 어긋나면 **fix(원화 환산 + 원래 통화를 note)** 로 제안 · drop 아님 ③ price 세븐일레븐 출처(ajax 목록)는 상품 페이지가 안 열리면 "unverified" · 다른 판매처 정가로 닫히면 ok.

■ 할 일 — A. 그림 503 전수(대상 · 글자 노출 · 워터마크 · which 그림 쌍 111 · 품목 그림 2) B. 값 전수(price 100 · worldprice 83 문항 + 나라 행 85 + 환율 · photo 100 변형·라이선스·attribution · estimate 100 단위·환산·asOf · which 150 값·연도·margin) C. photo difficulty 100 재매김 · 정답 모르는 판정자 맞혀 보기 D. 1차 반복 유형(V012 6절 a~d)이 2차에서 몇 건인지 E. verify·status 쓰기(ok→verified · drop→rejected · fix→candidate) F. g008-check 1차+2차 막힘 0 확인 G. 직접 재독(fix·drop 전부 · ok 10%).
■ 웹·토큰 예산: WebSearch **80회 이내** · WebFetch 주 수단(판정자도 WebFetch 만 · url 을 JSON 에) · 판정자 ≤1.
■ 산출물: `ai-out/V017.txt`(0~7절 — 0절 게임별 표 · 1차와 fix 율 비교) · `audit/v017-minigame.json`(533 모두 키로 · 나라 행은 worldprice 아래) · `v017-raw/` · items-2.json · products.json(새 품목 rows 만) · 13 C72 "★ V017 끝" + CV-47~ · README V 표.
■ 하지 말 것: DB 쓰기 · 항목 고치기(제안만) · 그림 파일 수정 · 1차 items.json · 1차 품목 · 규칙/프롬프트/코드 수정 · Q · 서버 · questions 판정(V018).
■ 커밋: 위 파일만 · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 2차 533(price 100 · worldprice 83 · photo 100 · estimate 100 · which 150) · 그림 503 · 새 품목 2(휘발유 42국 · 콜라 43국) · 전부 candidate · verify null · g008-check 1,175 막힘 0 — 다르면 0절에.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 같은 창에서 **`ai-out/briefs/verify-next.md`** 를 읽고 V018 을 바로 시작한다(파일이 없거나 첫 줄이 "보류" 면 멈춘다).
■ 답변: 한국어 · 터미널 5줄 이내.
