[VERIFY V041 — ★ **노래 293 메타 대조**(docs/18 §10 · G040 bc0f2e93) — trackName ↔ title · artistName ↔ artist **전수**(weak 96 우선) · previewUrl **HEAD 293 전부** · year ↔ releaseDate · Instrumental/Remix 0 · 차트 순위 표본 · 변형 15 §2 → 항목마다 `verify` + `status`(verified / rejected) **파일에 쓴다** + **us-state 50 대조**(§9 · ko 위키 페이지 1:1 · year 연방 가입 · 변형) · 판정만 · 웹 있음 · DB 없음 · C107 · CV-168~169 · Sonnet · 2~3시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: G040 이 iTunes US 로 293곡을 모았다 — **US 메타는 영문**("Good Day"/"IU")이라 한국 표기는 GEN 이 적었고, 영문 ↔ 한국 대응이 **strong 206 · weak 96**(가수 일치 + 연도 ±2 + 관련도 1순위로만 고른 것 — "넘쳐흘러 → After You've Gone" 확신 낮음) · 국민가요 3곡은 iTunes 판이 모음집이라 원곡 연도를 GEN 지식으로 고침 · 미리듣기 HEAD 는 20/20 만 봄. MAIN R084 가 **지금 동시에** 노래 게임을 만들고 있고 실 DB 에는 **verified 항목만** 적재된다(메뉴 1 자동) → 이 라운드가 끝나야 찬종이 들을 곡이 생긴다. us-state 50 은 G040 이 ko 위키 페이지를 받아 썼다(read true) — 대조로 verified.
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 + **예외**: §0 꼴로 `data/minigame/song/items.json` 항목의 **`verify` 칸과 `status` 만** 쓴다(다른 칸 글자 하나 안 바꿈 · 들여쓰기 · UTF-8 · 끝 줄바꿈 그대로 · 쓴 뒤 `node scripts/song-check.mjs` 막힘 0) · `data/minigame/topics/us-state.json` 의 verify · status(V039 꼴). 13 **C107** · **CV-168**(fixes 묶음 → G043) · **CV-169**(형식·규칙 후보 — 영문 제목 변형 · 연도 기준 · 모음집 판) · README V 표 · 05 · 06. 조각 `data/pipeline/audit/v041-raw/`. **DB 없음 · 웹 있음**(UA `quiz-web-v041/1.0` · iTunes lookup 은 키 없는 공개 API — `/lookup?id=<trackId>&country=US` ≤ 300 · 3초 간격 · HEAD 293).
■ ★★ 동시 라운드 — **MAIN R084**(song 파일 **읽기** · quizweb_test 적재 — V041 이 파일을 쓰는 순간과 겹치면 MAIN 이 다시 읽는다 · 파일 쓰기는 **한 번에**(끝에) 하라) · **GEN G042**(힌트 DB · river-national · element). 겹침 없음. 문서 분담: V041 = 13 C107 · CV-168~169 · README V · song · us-state 파일 / G042 = 07 DG-080 · 13 C106 · CV-166 · CV-167 / R084 = 07 D-341 · 13 A111.

■ 먼저 읽기: docs/18 **§10 전체**(칸 · 수집 규칙 · ★ 게임 규칙 줄 — 제목 또는 가수 · 영문 trackName 변형 받음) · §0(status 흐름 · verify 꼴 `{round, verdict: ok|fix|drop, reason, proposal, checked:[…]}`) · §9(us-state 줄) · `ai-out/G040.txt`(0절 ③ 빠진 곡 · ④ weak 96 예 · 3절 선정 · year 고침 3 · 변형 꼴) · `audit/g040-raw/result.json`(strong/weak/ambiguous 표시 · 후보 목록) · `audit/g040-raw/itunes/`(캐시 — 다시 받지 않아도 되는 것) · `scripts/song-check.mjs` · docs/15 §2 · `data/minigame/topics/us-state.json` · `kbo-team.json`(verify 꼴).

■ 판정 틀(노래 — 항목마다)
 (1) **미리듣기**: `curl -I previewUrl` 293 전부 → 200/206 아니면 `lookup?id=trackId` 로 새 previewUrl 을 **제안**(proposal — 파일은 안 고침) · lookup 도 없으면 `drop`.
 (2) **대응**: itunes.trackName ↔ title · artistName ↔ artist — strong 206 은 **기계 + 눈 표본 40** · weak 96 은 **전부 눈으로**(같은 곡인가 — 영문 제목이 공식 영문명인가 · 다른 곡/커버/리메이크 아닌가 · lookup 의 collectionName · releaseDate 로) · 틀리면 `fix`(올바른 trackId 후보를 `search` 로 찾아 proposal — 못 찾으면 drop).
 (3) **연도**: year ↔ releaseDate 연도(±1 정상 · 2 이상이면 어느 쪽이 원곡 발매인지 웹 1 — 멜론/위키 · 모음집 3곡 포함) · 차트 `chart.year/rank` 표본 40(멜론 연도별 차트 페이지 — G040 이 적은 URL 다시 받기).
 (4) **판본**: trackName · collectionName 에 Instrumental · Inst. · Remix · Live · Karaoke · Sped Up · MR · 리마스터 꼴 0 · 커버(다른 가수) 0.
 (5) **변형**: titleVariants · artistVariants 가 15 §2(실제로 치는 표기 · 넓은 말 X · 다른 곡과 겹침 X) · **영문 trackName 변형은 받되 어색한 것(한국에서 아무도 안 치는 영문 — "After You've Gone" 꼴)은 빼기 제안** · 빠진 흔한 표기 보탬 제안(띄어쓰기 — "쏘리쏘리" · 약칭 — "SG워너비" · 영문 그룹 "BTS" ↔ "방탄소년단") · 같은 제목 두 곡 0(정규화).
 (6) **pool 적정** 표본(jpop 28 전부 — 한국 인지도 근거가 있나 · pop 10 · classic 10): 근거 없으면 메모(tagNotes 꼴 · status 는 안 내림).
 (7) **status**: (1)~(4) 문제 없고 변형 메모뿐이면 **verified** · trackId/연도 틀림 = fix(status candidate 그대로 + proposal) · 미리듣기 없음 · 다른 곡 = **rejected** · 결과 `audit/v041-song.json`(293 전부 키 · verdict · category · proposal · reason · sources).
■ 판정 틀(us-state 50): ko.wikipedia "미국의 주" 페이지를 받아 **전수 1:1**(50 · 표기 "~주" 정본 · 빠짐 · 더함 · rename) · year = 연방 가입 연도 50 전부 표와 대조 · 변형 표본 전부(작은 세트 — 옛 표기 오레곤 · 알라바마 … 다른 주와 안 겹치나) · tags 4 지역 표본 10 · qid 1 → verify 칸 + status(V039 꼴 · fixes ≤ 3 이면 verified).
■ 조각: sonnet · 동시 2 · 노래는 100 건 안팎 3 조각(weak 96 은 한 조각으로 모아 VERIFY 가 **전부 재독**) · us-state 는 VERIFY 가 직접 · 첫 조각(strong 50)을 VERIFY 가 전부 읽고 기준 맞춘 뒤 나머지 · HEAD · lookup 은 스크립트(`v041-raw/_work/head.mjs` — 3초 간격).

■ 할 일 (순서대로)
A. 0절 준비: 메모리 · song-check 막힘 0 · 293 · status 전부 candidate · 13 마지막(C106 는 G042 몫 — **C107** · CV-167 → **CV-168~**) · README V 마지막 V040 · 지시서 · HEAD 293 돌리기(먼저 — 시간 걸림). 커밋 없음.
B. 조각 → 재독(weak 96 전부 · fix · drop 전부 · strong ok 표본 40) → `audit/v041-song.json`. 커밋 1(raw + json).
C. 파일 쓰기 **한 번에**: song 293 의 verify · status → song-check 막힘 0 · us-state verify · status → topics-check 막힘 0 · `audit/v041-topics.json`. 커밋 2.
D. 13 **C107** · **CV-168**(fixes 묶음 — trackId 교체 n · 연도 n · 변형 빼기/보탬 n · us-state fixes → G043 이 그대로 적용) · **CV-169**(규칙 후보 — 영문 변형 범위 · 모음집 판 연도 · jpop 인지도 기준 · 미리듣기 만료 재조회 주기) · README V · 05 · 06 · `ai-out/V041.txt`(0 ★ 찬종이 볼 것: ① verified / fix / rejected 수 → "**지금 실 DB 에 적재되는 노래 n**" · pool 별 ② HEAD 결과(200 n · 아님 n) ③ weak 96 중 틀린 것 n + 예 5 ④ 연도 어긋남 예 5 ⑤ us-state verdict · 1 건수 · 2 종류별 · 3 fix·drop 전부 · 4 unsure · 6 반복 유형 · 7 자기 점검 — 듣지 않았다 · 표본으로만 본 것). 커밋 3.
■ 하지 말 것: 항목 다른 칸 고치기(제안만) · 파일 새로 만들기 · DB · 코드 · song-check.mjs · 18 고치기 · 13 A · C106 · CV-166 · CV-167 · README G · R 표 · ox(V042 — verify-next.md) · 같은 항목 두 번 판정.
■ 커밋: 위 파일만 · 1~3 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): song 293 · candidate 293 · strong 206 · weak 96(result.json) · HEAD 20/20 · 국민가요 연도 고침 3(개똥벌레 · 거리에서 · 나도야 간다) · us-state 50 · year 1787~1959 · 13 마지막 · README V 마지막 V040 · MAIN R084 · GEN G042 돎.
■ 지난 피드백(V040): 잘한 것 — revert 를 after 와 독립으로 먼저 봄 · 조각 간 trueCls 불일치를 7절에 숨기지 않음 · 국가하천을 별표 삭제 사실까지 확인해 3 추가. 이번에도 못 들은 것(소리)은 못 들었다고 적는다.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 **`ai-out/briefs/verify-next.md`(V042 OX 400 전수)를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤). 그 전 터미널 마지막 줄 "V041 끝 — verify-next(V042) 이어서 · /clear 아직".
■ 답변: 한국어 · 터미널 5줄 이내.
