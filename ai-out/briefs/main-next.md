[MAIN R088 — ★ **라이어 바보형 모드 + 제시어 데이터 칸 + 추첨**(docs/18 §12 · D-330 ⑶ 확장 · 찬종 "기본형 / 바보형") — **0034**(topic_items.fool jsonb · era · sub · diff) · topics-load 갱신 · 방식 "라이어" 안 **모드 토글(기본형 · 바보형)** · 바보형 = 라이어에게 fool 중 하나를 정답처럼(라이어 표시 없음) · 들킨 뒤 맞히기 점수 기본 +2 · 바보형 +1 · 제시어 **추첨 = 항목 수 가중** · 풀 = **머리 liar/draw 가 true 인 open 세트만**(closed 무시) · 캐치마인드 **diff 섞기** · 정규화 콜론·하이픈·아포스트로피 영향 측정 · 반나절~하루 · 실 DB 쓰기 0 · D-345 · A115 · R087 과 같은 창에서 이어서]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: 찬종 2026-11-09: "라이어 게임에도 2가지 모드 — **기본형**은 라이어에게 '당신은 라이어이기 때문에 키워드를 알 수 없다' 문구 · **바보형**은 라이어에게 라이어라는 사실을 밝히지 않고 정답이 아닌 다른 키워드 … 바보형은 게임성에 따라 폐기할 수도 있지만 일단 생성". 데이터는 GEN G047(라이어 15 세트 · 항목마다 `fool` 2~3 · `era` · `sub` · `diff`) · G048(캐치 `draw-*` · `diff`) → V044 · V045 → G049 적용 — **이 라운드가 시작할 때 G047 이 끝나 있어야 한다**(파일에 fool 이 있어야 적재 · 확인 · 없으면 0034 + 코드는 만들고 quizweb_test 는 candidate 적재로 검사). 정본 = docs/18 **§12**(칸 · 두 모드 · 0034 · 추첨 가중) · 13 CV-173 ④(정규화).
실행 모델: Opus 5.5 (R087 과 같은 창)

■ 고정 규칙: docs/16 그대로 (번호 — R087 다음 · R087 보고서에서 확인: **D-345** · **A115** · 마이그레이션 **0034** · 10 **68절** · 01 **16-R088** · 03 · 04). 하위 에이전트 0. quizweb_test · 메뉴 15. 동시 라운드(GEN · VERIFY — topics 파일)와 겹침 없음 · **topics-load.mjs 는 MAIN 것**(이 라운드가 고침 — GEN 은 안 건드림). 문서 분담은 R087 과 같다.

■ 먼저 읽기: `ai-out/R087.txt` · docs/18 **§12** · `ai-out/G047.txt`(있으면 — fool 예) · `scripts/topics-load.mjs`(칸 매핑 · checkTopic) · `scripts/topics-check.mjs`(G047 이 더한 ITEM_OK) · `migrations/0031` · `server/src/db/topics.ts`(TopicStore · liarTopics · drawTopics — 세트 균등 · 항목 플래그) · `server/src/liar/engine.ts` 100~115(제시어 고르기) · `server/src/draw/engine.ts` 75~90 · `shared/src/liar.ts` · `shared/src/normalize.ts` · `answerFlex.ts` · `scripts/question-check.mjs`(정규화 영향 측정 꼴) · docs/13 CV-173.

■ 설계 결정
① **0034**: `topic_items` 에 `fool jsonb`(문자열 배열 · null 허용) · `era text`(classic|modern|null) · `sub text` · `diff smallint`(1~3 · null) · DROP 머리 · topics-load 가 네 칸을 올림(없으면 null) · TopicStore 항목에 네 칸.
② **라이어 모드**: settings 에 `liarMode: 'basic' | 'fool'`(기본 basic · 방식이 라이어일 때만 보임 — 방식 버튼 아래 두 버튼 · 한 줄 설명) · **바보형**: 배정 단계에서 라이어에게 **fool 중 하나를 무작위로 "키워드" 로**(라이어라는 표시 없음 · 시민과 같은 화면) · fool 이 없는 항목은 바보형에서 뽑지 않음(전부 없으면 기본형으로 자동 · 안내 한 줄) · 공개 때 "라이어가 받은 단어: ○○" 표시 · 들킨 뒤 **키워드 맞히기 점수: 기본형 +2 · 바보형 +1**(§12 설계 제안 — 바꾸면 0절) · 안 들킴 +3 은 같음 · liar_rounds 에 mode · foolWord.
③ **제시어 풀·추첨**: liarTopics/drawTopics = **머리 `liar`/`draw` true 인 kind open 세트만**(closed 무시 — 데이터가 이미 false 지만 코드로도) · 세트 추첨 = **항목 수 가중**(남은 항목 수 비례 · 한 판 같은 세트 연속 금지 유지) · 항목은 경험 적은 순(그대로).
④ **캐치마인드 diff 섞기**: 한 판(라운드 n)에서 diff 1:2:3 ≈ 4:4:2 로 고르기(세트 무관 · 전체 draw 풀에서 · diff 없으면 2 로 봄) · 공개 때 난이도 표시 작게 · 힌트 버튼(R087)은 그대로.
⑤ **정규화 측정**(CV-173 ④ — 고치지 않고 **재기만**): normalizeAnswer 에 콜론 · 하이픈 · 아포스트로피 제거를 넣으면 **활성 문항 7,151 의 정답·변형 · 주제 세트 전체**에서 canon 이 새로 겹치는 쌍이 몇 개 생기는지(스크립트 · 표) → 0절 + 13 CV-173 줄 끝에 숫자 → 설계가 결정(이 라운드는 측정만 — 겹침 0 이면 다음 라운드에 넣음).
⑥ **주제 범위 한 줄 `scope`**(18 §9 · 테스트 1 제보 #116~118): 0034 에 `topic_sets.scope text`(null 허용) · topics-load 가 올림 · **많이 말하기 · 겹치면 무효 · 빙고 · 순서대로** 의 주제 이름 아래 작게 한 줄(없으면 안 보임 · 사무실 테마 글자 규칙) · 봇 topicsets 에 "scope 보임" 한 줄.
⑦ **겹치는 이름 안내**(찬종 2026-11-09 "중복 정답이 존재하는 경우('서구') 앞 동네도 같이 적도록 안내문구 표기하고 오답 처리"): TopicStore 판정 맵을 만들 때 **세트 안에서 꼬리 이름이 둘 이상에 겹치는 꼴**(서구 · 중구 · 동구 · 남구 · 북구 · 고성군 · 강서구 …)을 `ambiguous` 집합으로 모아 두고, 입력이 그 꼴이면 **✗ 대신 본인에게만 "어느 서구? '부산 서구' 처럼 앞 동네를 붙여 주세요"**(오답 처리 — 점수 없음 · 틀린 답 목록에 넣음) · 캐치마인드·라이어 채팅 판정에도 같은 안내(겹치는 꼴이 있을 때만) · 많이 말하기 공개 때 "앞 동네가 필요했던 답" 표시는 안 함(단순하게).
⑧ 되돌리기: 0034 DROP 머리 · liarMode 기본 basic · 추첨 상수 · scope 는 null 이면 안 보임.

■ 할 일: A 0034(+ scope 열) + topics-load + TopicStore(+ ambiguous 집합)(커밋 1) · A2 scope 표시 ⑥ + 겹치는 이름 안내 ⑦(커밋 1에 같이 또는 따로) · B 라이어 모드 토글 + 바보형 + 점수 + 기록(2) · C 풀·추첨 가중 + 캐치 diff 섞기(3) · D 정규화 측정 스크립트 + 표(4) · E 봇(liar 바보형 — fool 받음 · 들킨 뒤 +1 · fool 없으면 기본형 · 추첨 가중 · diff 비율) · ui-check r088(모드 토글 · 바보형 배정 화면 · 공개 표시 · m360 · 세 테마 · 125%) · 그림 보고 고침(5) · F 끝 점검(단계별 — typecheck · vitest · build · smoke · 봇 liar · draw · topicsets · mgonly · result · ui-check r088 + r087 · main-behavior) · G 문서(07 D-345 · 01 16-R088(라이어 두 모드 규칙) · 03 0034 · 04 · 10 68절 · 11(메뉴 1 적재 줄 — 칸 늘어남) · 18 §12 "적재(R088)" 줄 · 13 **A115**(바보형 체감 — 라이어가 눈치채는 시점 · fool 거리 · 점수 · 폐기할지) · CV-173 줄 끝(측정 수) · 05 · 06 · README R · `ai-out/R088.txt` 0절 첫 줄 "메뉴 3 → 1 → 적용 대상 0034 → A114 · A115").
■ DB 쓰기: quizweb 없음 · test/dev 자유(0034 · G047 파일이 있으면 `--allow-candidate` 적재로 fool 확인).
■ 하지 말 것: 정규화 바꾸기(측정만) · 제시어 데이터 고치기 · topics-check(GEN 것) · 빙고·songyear·choice 되살리기 · `.env` · 태그 · 플레이 트리 · 실 DB.
■ 확인할 것 (원칙 7): R087 마지막 번호 · 07 맨 위 · 0033 마지막 · G047 끝 여부(fool 있는 파일 수) · topics-check ITEM_OK 에 fool·era·sub·diff · liarTopics/drawTopics 꼴 · 세트 균등 추첨 · 열린 판 0.
■ 커밋: 1~5 + G · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ ★ 이어서: 끝나면 멈춘다(main-next2.md 없음). 터미널 마지막 줄 "R088 끝 — ★ 찬종: 메뉴 3 → 1(0034) → A114 · A115 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
