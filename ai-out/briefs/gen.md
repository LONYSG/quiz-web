[GEN G016]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 하나만 · 끝나면 멈춘다)
TASK: **미니게임 데이터 반영 · 적재** — 1차 V012 fix 63 + CV-30 그림(items.json) · 2차 V017 fix 29 · drop 1(items-2.json · CV-47~51) → `g008-check` 1차+2차 막힘 0 → `scripts/minigame-load.mjs --apply`(1차 재적재 갱신 + 2차 적재 · verified 만) → `--mark`(loaded) → 적재 표. **questions 는 손대지 않는다**(G017)
실행 모델: Opus 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — G015 가 쓴 다음 DG- · C- 부터(07 · 13 을 보고) · Q 는 올리지 않는다). 하위 에이전트 ≤1(그림 교체 조각) · 메모리 1.5GB · 429 면 같은 모델로 이어서.
■ ★★ 동시 라운드 — VERIFY(V019 힌트 표본 — audit/v019-* · 13 CV · README V 표 · questions 읽기만) 가 같이 돌 수 있다. MAIN 은 R055 마무리(둘 재실행)만. GEN 몫: `data/minigame/*/items*.json` · `worldprice/products.json` · `assets/minigame/`(그림 교체 · git 밖) · `backups/minigame-*.zip` · scripts/g008-* · `scripts/g016-*` · audit/g016-* · DB **minigame_items · minigame_images · minigame_products** · docs/18 · 05 Track E · 06 · 07 DG- · 13 CV-30 · CV-47~51 처리 표시 · C72 끝 · README G 표. git: 내 파일만 · fetch → rebase → push. 찬종 없이 간다 — 묻지 말고 13 C 에 적는다.
■ 토큰: 넉넉하다 — fix 92 전부 읽고 판단.

■ 먼저 읽기
- **docs/18 전체**(0 묶음 파일 · 6 재검증 칸 · **7 적재** — status 흐름 verified → loaded) · ai-out/V012.txt 3절(1차 fix 63 · drop 6 전문) · **ai-out/V017.txt 2·3·4절**(2차 fix 29 · drop 1 · 그림 문제 13 · 맞혀 보기 못 맞힌 3) · `audit/v012-minigame.json` · `audit/v017-minigame.json`(items[id].proposal · verify) · 13 **CV-30 · CV-47 · CV-48 · CV-49 · CV-50 · CV-51** · C72
- ai-out/R052.txt A 절(적재 스크립트 · 표 · 멱등 · `--mark`) · `scripts/minigame-load.mjs`(옵션 · 같은 id 재적재 = 갱신인지 확인 — 아니면 고친다 · 그림 bytea 갱신 포함) · scripts/g008-img.mjs(그림 받기·줄이기) · g008-check.mjs · ai-out/G010.txt 0절 · docs/DB-ADMIN(미니게임 항목 · 그림)

■ 찬종의 말 · 확정
- "이미지 없으면 몰입이 안돼." · "쿠팡 말고 네이버로" · 그림은 git 밖 · 설계 판단(2026-10-19): **CV-47 (a)** 원화 환산 + note(원래 통화 · 연도) · **CV-48 (a)** 그대로 적재(verified · 틀린 증거 없음 — 재독은 다음 V 표본) · **CV-49** 변형 제거는 "표준국어대사전 · 위키 문서명/넘겨주기 · 언론 기사 중 하나라도 있으면 **유지**"(프로이드 · 토마스 에디슨 · 마크 트와인 · 파리 개선문 · 버즈 칼리파 꼴은 유지 — 항목마다 적는다) · **CV-50** 9장 교체(워터마크 3 · 이름 글자 6 — 못 구하면 자르기 + attribution) · **CV-51** photo-0207 · 0141 은 multi-answer fix(altAnswers 에 다식 · 다식판) · 0213 큰부리새 변형 · 0140 한국 키 그림으로 교체(못 구하면 rejected) · 0214 서명 자르기 · **CV-30** iPhone 그림은 애플 공식 iPhone 17 페이지 대표 이미지와 대조해 다르면 교체 · 1차 그림 교체 8(V012 — price 0013·0018·0030·0049·0098 · estimate 0069 · which 0058·0118) 못 구하면 rejected · 같은 상품 둘(price-0018 · 0098)은 하나를 rejected.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 1차 반영 — `scripts/g016-apply-v012.mjs`(items.json 63: 제안 적용 · 그림 교체 목록 · status candidate → verified(고침 끝) 또는 rejected · `audit/g016-fixes.json` rows[].before) · 그림 8 + iPhone 교체(g008-img) · 다 됐다 = 63 전부 "받음/고쳐 받음/rejected" 표.
B. 2차 반영 — `scripts/g016-apply-v017.mjs`(items-2.json 29 + drop 1 · CV-47 환산 6 · CV-49 변형 판단 표 · CV-50 그림 9 · CV-51) · products.json 새 품목 rows 는 값 불변(verify 는 V017 것 그대로).
C. 검사 — `node scripts/g008-check.mjs`(1차+2차 · --products) 막힘 0 · status 집계(verified · rejected · candidate 0 이어야 — 남으면 사유).
D. 적재 — `npm run db:backup` → `minigame-load --dry-run` 표 → `--apply`(1차 갱신 + 2차 신규 · 그림 갱신) → 표(게임별 전체 · verified · 넣음 · 그림 수) → `--mark` → 다시 돌려 멱등 확인 · DB 수(minigame_items status · images 수).
E. zip — `backups/minigame-2026-10-19.zip`(교체 그림 포함 · 전체).
F. 문서 — docs/18 7절(loaded 표시 · 재적재 규칙 한 줄) · 05 Track E · 06 · 07 DG- · 13(CV-30 · 47~51 끝 · C72 끝 · 다음 C 메모) · README G 표 · `ai-out/G016.txt`(0절: 적재 표 · rejected 목록 · 교체 못 한 그림).

■ DB 쓰기: **허용**(백업 뒤 · minigame_* 표만). **questions 금지**.
■ 웹·토큰 예산: WebSearch **60회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤1.
■ 하지 말 것: questions · 생성 · server/ client/ shared/(적재 스크립트 버그가 아니면 — 갱신이 안 되면 `scripts/minigame-load.mjs` 만 고치고 13 C 에 적는다) · 13 A · README R/V · 그림 커밋.
■ 확인할 것 (원칙 7): 1차 642(verified 573 · candidate 63 · rejected 6) · 2차 533(ok 503 → verified · fix 29 → candidate · drop 1 → rejected — V017 이 썼는지) · DB minigame_items loaded 573 · g008-check 1,175 막힘 0 · 마지막 DG-053 · C77 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(적재 표 · 그림 교체 전/후 경로 5) → 원칙 메모 → A~F → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "G016 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
