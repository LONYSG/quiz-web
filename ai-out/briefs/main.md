[MAIN R092 — ★ **노래 맞히기 = 제목만 정답**(찬종 2026-11-10 실전 중 "제목이나 가수 둘 중 하나만 맞히면 정답 처리네? 그냥 제목만 인정인 걸로 해") — 작은 라운드 · 가수 판정 · 둘 다 보너스 제거 · D-349 · A119 · 마이그레이션 없음 · 1~1.5시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: R084 가 노래 맞히기를 "제목 **또는** 가수 중 하나라도 치면 점수 · 둘 다 +1" 로 만들었다(shared/src/minigame/song.ts 머리 · 01 16절 노래 줄 · D-341). 찬종이 친구들과 실전에서 보고 **제목만 인정**으로 바꾸기로 했다. 설계 결정(되돌리기 쉬움): 가수를 치면 **점수 없이 "가수 말고 제목을 쳐 주세요" 피드백**(틀림으로만 처리하면 왜 틀렸는지 몰라 답답 — 가수는 이미 아는 것이라 새는 정보가 아님) · 점수는 **제목을 처음 맞힌 순서 3 · 2 · 1(그 뒤 1)** 만 · `SONG_BOTH_BONUS` 삭제 · "전원이 제목을 맞히면 일찍 공개" · 이 노래 몇 년도?(songyear)는 그대로.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 그대로 — **작은 라운드 끝 점검 규칙**(docs/16 §F — 건드린 것만: typecheck · vitest · build · smoke · 봇 song(있으면) · ui-check 한 장(노래 입력 피드백)). 번호: **D-349** · **A119** · 10 **72절** · 01 **16-R092** · 마이그레이션 없음. 하위 에이전트 0 · quizweb_test · 실 DB 쓰기 0. ★ **실 3000 서버 · 터널은 건드리지 않는다**(찬종이 친구들과 플레이 중일 수 있음 — 끝 점검의 smoke · 봇은 quizweb_test · 다른 포트 · `--url http://localhost:3400` 꼴 · 메모리 3GB 미만이면 build 전에 멈추고 한 줄).
■ 먼저 읽기: `shared/src/minigame/song.ts`(matchSong · SongPart · SONG_BOTH_BONUS · 머리 주석) · `server/src/minigame/songGames.ts`(170~215 줄 — got · bothMs · feedback · hit · 일찍 공개 · 점수) · `server/src/minigame/songGames.test.ts` · `shared/src/minigame.ts` 116 줄(oneLine) · 노래 화면(피드백 표시 · 공개 — 제목 · 가수 · 누가 뭘 맞혔나) · docs/04 1051~1052(feedback · extra) · 18 §10 · 01 16절 노래 줄 · 07 D-341.
■ 할 일
A. **판정**: matchSong 은 그대로(title · artist 구분 유지 — 피드백에 씀) · songGames: `part === 'artist'` → `feedback = { result: 'artist', text }`(점수 · got 변화 없음 · tries 는 셈) · `part === 'title'` 처음 → got.title · firstMs · ok / 두 번째 → dup. `hit = got.title` · 일찍 공개 = 전원 got.title. 점수 = 제목 순서 3 · 2 · 1 · 그 뒤 1 · **보너스 없음**(SONG_BOTH_BONUS · bothMs · both 삭제 — 옛 판 결과 행의 bothMs 는 읽기만 남으면 무시).
B. **화면**: 피드백 'artist' → "가수 말고 제목을 쳐 주세요"(틀림과 다른 색 — 노랑 꼴) · 입력칸 안내 "제목을 치세요" · 공개 화면의 "누가 뭘 맞혔나" 는 제목만(가수 칸 · 둘 다 표시 제거) · oneLine "30초 듣고 **제목**을 치세요! 먼저 맞힐수록 3 · 2 · 1점 · 3곡".
C. **검사**: songGames.test(가수 → artist 피드백 · 점수 0 / 제목 순서 / 보너스 없음 / 일찍 공개) · shared 타입(`SongFeedback.result` 에 'artist') · 봇 song 이 있으면 경로 하나.
D. **문서**: 07 D-349(찬종 말 그대로 + 설계 결정 피드백) · 01 16절 노래 줄 + 16-R092 · 18 §10 판정 줄 · 04 1051(feedback result 'artist') · 1052(extra 에서 bothMs 뺌 — 옛 행 호환 한 줄) · 10 72절 · 13 A119(체감 — 가수 피드백이 거슬리나 · 점수 체감) · 05 · 06 · README R · `ai-out/R092.txt`(0 ★ 찬종이 볼 것: ① 바뀐 규칙 한 줄 ② 가수 쳤을 때 화면 ③ **적용은 메뉴 1 → [1] 다시**(플레이가 끝난 뒤 — 켜진 서버는 옛 규칙 그대로) · 1 한 것 · 끝 점검 표 · 2 결정 필요).
■ 하지 말 것: songyear · 노래 데이터 파일 · 다른 미니게임 · 실 서버 · 마이그레이션 · 13 A118 · GEN · VERIFY 몫.
■ 커밋: 2(코드 · 문서) · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "R092 끝 — ★ 찬종: 플레이 끝난 뒤 메뉴 3 → 1 [1] 로 다시 켜면 적용 · /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
