[GEN G018]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 밤샘 — 끝나면 `gen-next.md`(G019 상 생성 4차)로 이어서)
TASK: **미니게임 데이터 3차**(docs/18 형식 · 묶음 파일 `items-3.json`) — price 100 · worldprice(기존 5 품목의 **빠진 나라 보충** + 품목 +1 가능하면) · photo 120 · estimate 100 · which 120 = 약 440 + ★ **새 게임 데이터 1차 `photoyear`(이 사진 몇 년도?) 100**(docs/18 §8 신설 — 아래 형식) → 그림 git 밖 · zip · VERIFY 묶음(V023). **적재 없음**(VERIFY 뒤 다음 G). ★ 앞서 "G018" 번호로 쓴 "V020 반영" 브리핑은 `archive/G018-unrun.md` 로 미뤘다(G020). 그 일(photo-0207 · 0141 다식 · 행정 구역 16 · 애매 fix 10 …)은 **이번에 하지 않는다**.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — 다음 **DG-056 · C80**(07 · 13 을 보고) · Q 는 올리지 않는다). 하위 에이전트 **한 번에 1개**(VERIFY · MAIN 이 같이 돈다) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 같은 모델로 이어서 · 임시 폴더 `tmp/g018/`(미추적 도구는 여기 — 작업 폴더에 GEN 미추적 파일 0 · `tmp/g018/STATE.md` 에 단계 기록). 찬종은 자고 있다 — 묻지 말고 13 C 에 적는다.
■ ★★ 동시 라운드(밤샘 — 세 창) — VERIFY(V021 애매 나머지 전수 → V022 활성 상 952 정답 친숙도 전수 — questions 읽기만 · audit/v02x-* · 13 CV · README V 표) · MAIN(R056 문제 평가 버튼 → R057 미니게임만 모드 · 이모티콘 나열 · 복수정답 — server/ client/ shared/ migrations/ · 01 · 03 · 10 · 13 A · README R · **미커밋 server/ client/ 파일이 있다 — add 하지 않는다**). GEN 몫: `data/minigame/<game>/items-3.json`(새 파일만) · `data/minigame/photoyear/items.json`(새 게임 — 1차 파일) · `worldprice/products.json`(**품목 추가만** — 기존 rows 글자 하나도 안 바꿈 · 기존 품목의 나라 보충은 items-3.json 의 새 항목으로) · `assets/minigame/<game>/` 새 그림만(git 밖) · `backups/minigame-g018.zip`(git 밖) · scripts/g008-* 옵션 추가 · scripts/g018-* · audit/g018-* · docs/18(§8 신설 + 7절 한 줄) · 05 Track E · 06(맨 위 새 블록) · 07 DG- · 13 C(C80 = V023 대기) · README G 표. ★ 05 · 06 · 13 · README 는 셋이 같이 쓴다 — 쓰기 직전 `git fetch` · rebase. git: 내 파일만 add · force 금지.
■ ★ DB 쓰기: **불허**(questions · minigame_* 전부 · 마이그레이션은 MAIN 몫). 읽기는 자유(겹침 대조 — minigame_items 1,164).
■ 토큰: 넉넉하다 — 수량을 줄이지 않는다. 하위 에이전트는 수집 · 그림 · 맞혀 보기에만 · 보고서는 표와 바뀐 것만.

■ 먼저 읽기
- **docs/18 전체**(0 공통 — 묶음 파일 · 그림 규칙 · 저작권 · 1~5 형식 · 6 VERIFY 기준 · 7 적재 기록) · **ai-out/briefs/archive/G010.md**(2차 브리핑 — 수량 배분 · 소재 규칙 · 도구) · ai-out/G010.txt 0 · 3 · 4 · 6절 · G016.txt 0절(반영 뒤 상태 · rejected 11 사유) · **ai-out/V017.txt 6절 · V020.txt 2절 · 4절**(반복 오류 — 가격 1.5 규칙 · 변형 표기 문서 근거 · photo 라이선스 칸 · unverified 30 유형 · CV-63) · 13 **CV-63 · C78**
- scripts/g008-img.mjs · g008-check.mjs · g008-build.mjs(round g018 · `items-3.json` 옵션) · minigame-load.mjs(형식 검사가 무엇을 막는지 — 이번엔 돌리지 않는다 · dry-run 은 허용) · data/minigame/*/items*.json(1·2차 소재 — 겹치지 않게) · worldprice/products.json · `audit/v020-minigame.json`(unverified 30 — 같은 꼴을 피한다)
- shared/src/minigame.ts(MINIGAMES — 게임 키 · kind) · docs/17 1-2(🟡 후보 줄 — "이 사진 몇 년도?")

■ 찬종의 말 · 확정
- (2026-10-21 밤 · 친구들과 몇 판 뒤) "**미니게임 반응이 생각보다 좋아. 미니게임만 하는 모드도 추가하면 좋을듯. 그리고 미니게임 수집 필요한 게임들은 수집 우선적으로 더 하자. 퀴즈는 일단 충분히 많아.**" · (10-16) "이미지 없으면 몰입이 안돼." · 그림은 공개 저장소에 넣지 않는다(다운 · 표시는 됨) · "쿠팡 말고 네이버로"(가격 출처 — 네이버 쇼핑 API 는 종료 · 페이지 열람은 됨) · 실루엣 안 씀 · 빅맥지수 전 나라 순위 · 이미지 필수.
- 설계 판단(2026-10-21):
  · **수량** — price 100 · photo 120 · estimate 100 · which 120 · worldprice 보충 · photoyear 100. 퀴즈류 미니게임은 **3~5판 × 문항 = 판** 이라 소모가 빠르다(경험 시스템 — 한 사람이 같은 문항을 다시 안 봄) — 지금 게임별 약 200 이면 열 판쯤에 바닥이 보인다.
  · **price** — 1차·2차와 상품 안 겹침 · 버킷 **<1만 30 · 1~10만 30 · 10~100만 25 · 100만+ 15** · 공식몰 정가가 있는 상품 위주(1.5 규칙 탈락을 줄인다) · 같은 브랜드 3개 이하 · "의외로 비싼 · 의외로 싼 · 기괴한 해외 상품" 각 10 이상 · `priceAsOf` 는 수집일.
  · **worldprice** — 기존 5 품목(products.json)에서 **나라가 빠진 곳**을 채운다(목표: 품목마다 40개국 이상 — 지금 수를 0절에) · 출처는 공식 가격 페이지 · 신뢰할 만한 비교 통계(사용자 입력 통계는 note 표시) · 환율 같은 날 ECB. 품목 +1 은 **휘발유 1L**(GPP 요청 제한이면 Trading Economics + 각국 공식 — CV-63 꼴로 출처 차이를 note 에) — 못 구하면 건너뛰고 13 C.
  · **photo** — 2차 비율 유지(everyday 25 · object 25 · place 20 · person 15 · food 15 · animal 10 · logo 10) · 난이도 2~3 을 60% 이상 · **CV-27 규칙**(공용 파일 페이지의 라이선스 칸 · 수정 표시를 attribution 에 그대로 · 영문 원어 변형 금지 · 한국어 별칭은 문서 근거) · 정답 모르는 에이전트가 **120 전부 맞혀 보기** · GEN 이 무작위 30 직접 보기 · ★ CV-59 교훈: 다른 음식·도구는 altAnswers 에 넣지 않는다(다식 ≠ 약과).
  · **estimate** — kind 섞기(무게 · 칼로리 · 숫자 — 인구 · 높이 · 거리 · 개수) · 1·2차 대상 안 겹침 · 열량은 kcal 표기 출처만 · 추정 범위 넓은 것 피함 · 그림 있는 항목 80% 이상.
  · **which** — bigger 70 · earlier 50 · 그림 있는 항목 80% 이상 · 두 대상의 차이가 **1.3배 이상**(검색량·가격·인구) 또는 **5년 이상**(먼저) — 접전은 재미없고 판정 시비가 난다.
  · ★ **photoyear (이 사진 몇 년도?) — 새 게임 1차 100. docs/18 §8 을 이 형식으로 신설**(MAIN 이 게임을 만드는 것은 R058 뒤 — 데이터가 먼저):
    ```json
    { "id": "photoyear-0001", "status": "candidate", "createdRound": "G018",
      "year": 1988, "yearKind": "exact" | "circa", "yearRange": [1986, 1990] 또는 null,
      "title": "공개 뒤 보여 줄 한 줄 (연도 포함 가능 — 예: 1988년 서울 올림픽 개막식 성화 점화)",
      "place": "서울", "region": "kr" | "world", "difficulty": 1 | 2 | 3,
      "cues": "연도를 짐작할 단서 요지 (옷 · 차 · 간판 · 화질 — note 꼴 한 줄)",
      "sources": [{url, note, fetchedAt}], "image": {file, sourceUrl, license, attribution, width, height, bytes}, "tags": [], "verify": null }
    ```
    - 그림은 **자유 라이선스만**(위키미디어 공용 CC0 · CC BY · CC BY-SA · 퍼블릭 도메인 — 파일 페이지에 촬영 연도가 적힌 것) · **그림 안에 연도 · 날짜 · 캡션 글자가 보이면 안 된다**(현수막의 연도 · 신문 날짜 · 워터마크 — 잘라 내고 수정 표시를 attribution 에) · `year` 는 파일 페이지의 촬영일(연도) · 촬영 연도가 "circa" 면 `yearKind: "circa"` + `yearRange`.
    - 소재: **한국 50**(1950~2020 생활 풍경 · 거리 · 교실 · 시장 · 역 · 가전 · 광고판 — 유명 사건 사진은 30% 이내 · 난이도 1 은 전체 30% 이내) · **세계 50**(일상 · 도시 · 교통 · 패션 — 연도가 자명한 상징 사건(달 착륙 1969 · 베를린 장벽 1989)은 10 이내).
    - 판정은 MAIN 몫(오차 |입력 − year| 작은 순 · circa 는 range 안이면 오차 0) — 데이터는 위 칸만 채운다.
  · 적재는 하지 않는다(V023 뒤). 그림 정본은 적재 뒤 DB — 이번엔 `backups/minigame-g018.zip`(그림 + 파일) 을 git 밖에.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 도구 — g008-build/check 를 round g018 · `items-3.json` · 새 게임 `photoyear/items.json` 으로(이름은 그대로 · 옵션) · check 가 1·2·3차 합쳐 id 유일 · 같은 대상 겹침(이름 정규화 · 1,164 DB 와도) · photoyear 칸 규칙(year 정수 · yearKind · range · 연도 글자 없음은 사람 눈) 을 막는지 · minigame-load `--dry-run` 이 새 게임 키를 모르면 **막히는 것을 확인만**(고치는 건 MAIN — 13 C 에 한 줄). 다 됐다 = check 가 기존 1,164+ 에 막힘 0.
B. 수집 — 하위 에이전트 게임·category 로 나눠(한 번에 1개 · G010 꼴 · 조각마다 `tmp/g018/work-*`) · 그림 받기·줄이기(긴 변 1024 · 500KB) · photo 120 + photoyear 100 은 정답 모르는 에이전트가 맞혀 보기(photo: 이름 · photoyear: 연도 — 오차 분포를 난이도 근거로) · GEN 이 게임마다 무작위 10 그림 직접 보기(정답 글자 · 연도 글자 · 워터마크). 다 됐다 = 게임별 수 · 그림 수 · 버린 소재(사유별) 표.
C. 빌드 — `items-3.json` × 5 · `photoyear/items.json`(status candidate · createdRound G018 · verify null) · products.json 품목 추가(가능하면) · `node scripts/g008-check.mjs` 전부 막힘 0 · zip. 다 됐다 = 파일 머리 · id 범위 · 그림 파일 수 = image 칸 수.
D. VERIFY 묶음 · 문서 — `data/pipeline/audit/g018-mg-verify-targets.json`(전수) · docs/18 §8 신설 + 0절 `<game>` 목록에 photoyear + 7절 한 줄(3차 수량 · 적재 전) · 05 Track E · 06 · 07 DG-056(photoyear 형식 · which 1.3배/5년 · price 버킷) · 13 C80(V023 대기 — 먼저 볼 것: photoyear 연도 근거 · 그림 글자 · price 1.5 · which 차이) · README G 표 · `ai-out/G018.txt`(0절: 게임별 수 · 그림 수 · 버린 소재 · 못 한 것 · 그림 예 5장 경로 · worldprice 나라 수 전/후).

■ 웹·토큰 예산: WebSearch **300회 이내** · WebFetch · 공용(commons) API · 공식몰 페이지가 주 수단 · 하위 에이전트 한 번에 1개.
■ 하지 말 것: items.json · items-2.json(1·2차) · products.json 기존 rows 수정 · 적재 · DB 쓰기 · questions · server/ client/ shared/ migrations/ · pipeline/ · 15 · VERIFY·MAIN 몫 문서 · 그림 커밋 · NAVER 키 값 노출(쓸 일 없음) · `archive/G018-unrun.md` 의 일.
■ 확인할 것 (원칙 7): loaded 1,164(price 197 · worldprice 254 · photo 219 · estimate 199 · which 295) · 품목 5 · 그림 1,002 · docs/18 0절 묶음 파일 규칙 · `data/minigame/photoyear/` 없음 · 마지막 DG-055 · C79 · CV-63 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(게임별 수 · photoyear 예 5 · worldprice 나라 수) → 원칙 메모(7 · 동시 라운드 · DB 쓰기 0) → A~D → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ 지난 피드백 (G010 · G016): 잘한 것 — 정답 모르는 에이전트 맞혀 보기 · 1.5 규칙을 판매처 전체에 적용 · 같은 id 재적재 갱신 규칙을 문서로. 고칠 것 — V020 unverified 30 은 "열어 본 페이지 문구" 가 note 에 없어서 생겼다 → 이번엔 sources[].note 에 **열어 본 문장**(또는 "(요지)")을 꼭.
■ ★ 이어서: 이 라운드의 보고서 · 커밋 · push 가 끝나면 **같은 창에서** `ai-out/briefs/gen-next.md` 를 읽고 그 라운드(G019 상 생성 4차)를 바로 시작한다 — 찬종에게 묻지 않는다. 그 파일이 없거나 첫 줄이 "보류" 면 멈춘다. 터미널 마지막 줄에 "G018 끝 — G019 로".
■ 답변: 한국어 · 터미널 5줄 이내.
