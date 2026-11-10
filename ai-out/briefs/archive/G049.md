[GEN G049 — ★ **제시어 적용 + 노래 표기 보강 + 범위 정리** — ① 라이어 15 세트 V044 fixes 적용 → verified ② 캐치마인드 10 세트 V045 fixes 적용(★ 찬종 결정 — **"그리기 어렵다" 로 빼지 않는다** · 같은 그림 63 만 합침) → verified ③ 노래 293 표기 변형(iTunes KR · JP 스토어 + 한국어 통용 제목 · 음차 + 영문 64 복원) ④ closed 세트 `scope` 한 줄 · seoul-subway-station 폐기 · 시·군·구 넓히기 ⑤ 문항 #1491 부루마불 변형 · DG-087 · C118 · 2~3시간 · 끝나면 ★ 메뉴 3 → 1 → 테스트 2]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: G047(라이어 15 · 851) · G048(캐치 10 · 1,651)을 V044 · V045 가 전수 판정했다(전부 candidate+fixes — 13 CV-174~177 줄 끝에 설계 결정). 이 라운드가 적용해 verified 로 바꾸면 찬종이 메뉴 1 을 돌려 **테스트 2**(라이어 새 흐름 · 바보형 · 캐치 도구)를 한다. 찬종 결정(2026-11-10 submit):
 - 라이어 unsure 인물(뉴진스 · 송중기 · 르세라핌 · 레드벨벳 · 호날두 · 박세리) = **전부 유지** · fool 쪽 이경규만 다른 단어로.
 - 캐치 인물(실존 위인 · 종교 · 신화) = **전부 유지**.
 - ★ 캐치 remove 239 에 대한 찬종 원문: "그리기 어려운 걸 어떻게든 창의적으로 그림으로 표현해내는 게 재미인데 왜 자꾸 빼자고 하는 거임? 단어도 사실 너무 어렵지 않은 개념이면 엥간하면 괜찮아. 단어 한 글자 한 글자를 그림으로 표현할 수도 있고.. 잘 그려도 '이게 무슨 단어야?' 와 같은 상황만 없으면 돼. 일반적으로 사람들이 맞힐 만한 수준이면 거의 다 괜찮음." → **뺄 기준은 하나 — 정답을 듣고도 "그게 뭔데?" 인 낯선 단어**(18 §12 "캐치 단어 기준" 개정 줄). 그리기 어려움 · 추상 · 장면이 갈림 · 상하위어는 빼는 사유가 아니다.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-2 그대로. 번호(보고서에서 확인): 07 **DG-087** · 13 **C118**(C113 은 보류 G045 몫 — 비워 둠) · **CV-174 · CV-176 줄 끝**(적용 수) · README G · 05 Track D · 06 · 18 §9 · §10 · §12 "★ G049 실측" 각 한 줄. 하위 에이전트 ≤ 2(노래 통용 제목 · 음차 초안만 — opus · 지시서 한 파일) · 웹: iTunes lookup(키 없음 · 초당 ≤ 3 · 실패는 건너뛰고 목록) + 시·군·구 대조 1~2 페이지.
■ 동시 라운드: 없음(MAIN · VERIFY 쉼). 설계가 이미 쓴 것 — 13 CV-174~177 줄 끝 결정 · 18 §12 개정 줄 · 20 §19 → **고치지 말고 읽기만**.

■ 먼저 읽기: `ai-out/V044.txt` · `ai-out/V045.txt` · 13 **CV-174~177**(줄 끝 "설계 결정 2026-11-10") · docs/18 **§12**(★ 설계 2026-11-10 줄 2개 — fool 기준 · 캐치 단어 기준) · §9("세트 이름 = 정답 범위" · scope · 시·군·구) · §10("표기 변형 보강") · §0 · §9 verified 전환 규칙 · `scripts/g046-topics-fix.mjs`(fixes 기계 적용 꼴) · `scripts/g043-song-fix.mjs` + `audit/` 의 그 diff(뺀 영문 64) · `scripts/topics-check.mjs` · `scripts/song-check.mjs` · 세트 파일 `verify.fixes` 꼴(라이어 op fool{replace:[{from,verdict,to}]} / diff / era / sub / variant / remove · 캐치 op remove(dup:true 는 그림 중복) / diff / variant / sub).

■ 할 일 (순서대로 · 단계마다 커밋)
A. **준비**(커밋 없음): 번호 확인 · topics-check 막힘 0 · 세트 50 · fixes 수(설계 실측 — 라이어 fool 233 묶음(fool 268) · diff 44 · remove 2 · variant 7 · sub 6 · era 2 / 캐치 remove 239 · remove dup 63 · variant 103 · diff 36 · sub 4)가 맞는지 · 두 DB 제보(`npm run reports:report` · `DATABASE_URL=postgresql://quiz:quizlocal@localhost:5434/quizweb_dev npm run reports:report`) — dev #116~118 은 이 라운드 · G050 몫(처리 표시는 설계가).
B. **라이어 15 적용**(`scripts/g049-topics-fix.mjs` — g046 꼴 · dry-run → `audit/g049-topics-diff.json` → --apply):
   - fool: `to` 있으면 교체 · `to: null` 이면 그 fool 만 뺌 → **fool 이 2 미만이 된 항목은 GEN 이 18 §12 기준으로 하나 써 넣는다**(같은 sub · 일반인이 아는 단어 · 받고 설명을 들어도 정답이 하나로 안 좁혀짐 — `fool` 끝에 · 보고서에 전부 나열). 교체 뒤 같은 항목 안 fool 중복 · fool = 자기 name 0.
   - remove 2(조세호 · 아쟁) · diff 44 · era 2 · sub 6 · variant 7 그대로.
   - **unsure 인물 6 은 유지**(찬종) · fool 에 "이경규" 가 있으면 같은 sub 의 다른 단어로(GEN).
   - fixes 에 `applied: "G049"` · `verify.appliedRound: "G049"` · version +1 · count · **status verified**. 적용 뒤 fool 2 미만 0 · topics-check 막힘 0. 커밋 1.
C. **캐치 10 적용**(같은 스크립트):
   - ★ **op remove(dup 아님) 239 는 적용하지 않는다.** GEN 이 239 의 name 과 reason 을 한 번 읽어 **"20~50대 한국인이 정답을 듣고도 무슨 단어인지 모를 낯선 말"** 만 remove(예상 한 자릿수~20 — 빨랫방망이 · 초파리 같은 것은 아는 단어라 유지 · 판정 다시 돌리기 아님 — 사유 줄만 읽는다 · 조각 0). 나머지는 fix 에 `applied: "kept"` + `keptBy: "찬종 2026-11-10"`. 유지한 것 중 reason 이 "추상 · 장면이 갈림 · 한 장면으로 어려움" 꼴이면 **diff 3**(어려운 쪽으로 — 한 판 4:4:2 섞기에서 1~2개만 나오게) · "상하위어 · 가까운 그림" 꼴이면 diff 그대로.
   - **remove dup 63 은 적용**(같은 그림 — 태극기/국기 · 키스/뽀뽀): 대표를 남기고 지운 이름을 대표의 `variants` 에(유일성 검사 통과하는 것만 · 걸리면 건너뛰고 목록). ★ 단 "수영 ← 자유형" 처럼 **뜻이 다른 하위 종목 · 다른 사물**을 변형으로 넣는 묶음은 합치지 말고 둘 다 유지(GEN 판단 · 보고서에 "합침 n · 유지 n").
   - diff 36 · variant 103 · sub 4 그대로(위 diff 3 규칙과 겹치면 큰 값).
   - 캐릭터·인물: 실존 · 종교 · 신화 **전부 유지**(찬종) — remove 13 도 위 "낯선 단어" 기준만.
   - `applied` · appliedRound · version +1 · count · **status verified**(찬종 결정으로 유지한 것은 `verify.keptByDesign: n`). topics-check 막힘 0(캐치 세트 수 40~400 — 사물이 넘으면 상한을 450 으로 · GEN 판단 기록) · diff 분포 전후 표. 커밋 2.
D. **노래 표기 보강**(`scripts/g049-song-variants.mjs` · 18 §10): 293 곡 `itunes.trackId` 로 `lookup?id=…&country=KR` · `country=JP` 를 받아(US 는 이미 있음) trackName → `titleVariants` · artistName → `artistVariants`(정본 title/artist 와 정규화 뒤 같은 것 · 이미 있는 것 · "(feat. …)" · "- Single" 꼴은 떼고 · 다른 곡 title 과 겹치는 것은 건너뜀) · 받은 원문은 `audit/g049-song-lookup.json`. **GEN 이 직접**: J-pop(≈28) · 팝(≈60) 가운데 **한국어 통용 제목이 있는 곡**(悪魔の子 → 악마의 아이)과 **한글 음차 1개**(아쿠마노코 · 외래어 표기법 꼴) · 가수 한글 표기 — 통용 제목이 없으면 지어내지 않는다. **V041 이 뺀 영문 원제 64 복원**(G043 diff 에서 기계로). previewUrl · year · status 는 건드리지 않는다(verified 그대로 — "더 받는" 쪽 변경). song-check 통과 · 곡마다 변형 수 전후. 커밋 3.
E. **범위 정리**(18 §9):
   - `scope` 칸: closed 세트 전부에 한 줄(플레이어 말투 · 30자 안팎 — "1~118번 전부 · 기호(Fe)도 됩니다" · "2026년 현재 구단만" · 범위가 이름 그대로면 짧게) · topics-check 가 머리 `scope`(문자열 ≤ 60)를 받게.
   - **seoul-subway-station 삭제**(파일 지움 — 호선별 세트는 gen-next G050).
   - **kr-municipality 넓히기**(찬종 "시/군/구가 붙은 모든 지명"): 기존 227 불변 + 특별시 · 광역시 · 특별자치시 · 통합특별시(2026 현행 — 전남광주통합특별시 2026-07-01 시행을 반영해 현행 이름으로) + 행정시 2(제주시 · 서귀포시) + 일반구(행정구 ≈35 — 수원 영통구 · 성남 분당구 · 고양 일산동구 …) · **도는 넣지 않는다**. 웹 대조 1~2 페이지(위키백과 "대한민국의 행정 구역" · "일반구" — source.read 에) · 광역시는 변형에 "대구" · "대구시" · "대구광역시" 꼴(서울 = 서울 · 서울시 · 서울특별시). **같은 끝 이름(서구 · 중구 · 동구 · 남구 · 북구 · 강서구 · 고성군 …)은 변형에 bare 꼴을 넣지 않는다** — 코드(R088)가 "앞 동네를 붙여 주세요" 안내 · 정본 name 은 "부산 서구" 꼴 그대로. nameKo **"대한민국 시·군·구(시·도 포함)"** · scope "서울시 · 대구광역시 · 제주시 · 분당구도 됩니다 · 서구 · 중구는 '부산 서구' 처럼". ★ 예외(설계): 범위가 바뀌었지만 **status verified 유지**(기존 227 불변 · 추가분은 공식 목록 한 페이지 대조 · V046 이 추가분만 재대조 — `verify.pending: "V046 추가분"`) — 테스트 2 에서 빠지지 않게. dev 제보 #116 의 오답 11개('서울' · '서울시' · '서울특별시' · '대구광역시' · '대구시' · '광주광역시' · '제주시' · '서귀포시' → 정답 · '제주도' · '양평구' → 오답 그대로 · '서구' → 안내)를 적용 뒤 파일로 확인해 보고서에.
   커밋 4.
F. **문항 #1491 부루마불**(근접 오답 8건 — 부루마블 · 부르마블 · 브루마블 · 블루마블): 변형 4 추가. docs/16 5-2 DB 쓰기 절차 그대로(백업 · 열린 판 0 · 3000 꺼짐 확인) · **quizweb 과 quizweb_dev 둘 다** 같은 UPDATE · 문항 정본 파일이 있으면 그것도 · question-check 통과. 다른 문항은 건드리지 않는다. 커밋 5(파일이 바뀌면).
G. **문서 · 보고서**: 07 DG-087(적용 수 · 찬종 결정 3 · 되돌리기 = 커밋별 revert) · 13 C118 · CV-174 · CV-176 줄 끝(적용 n · 유지 n) · 18 §9 · §10 · §12 실측 한 줄씩 · 05 · 06 · README G · `ai-out/G049.txt` —
   0 ★ 찬종이 볼 것: ① **메뉴 3 → 1 [1] 돌리면**(topics-load dry-run 끝 줄 · 마이그레이션 0034) 주제 세트 n · 라이어 주제 15 · 단어 n · 캐치 주제 10 · 단어 n · 노래 293 · OX 400 ② 캐치: 유지한 수 · 낯선 단어로 뺀 것 **전부 나열** · 합친 그림 중복 예 10 · diff 분포 전후 ③ 라이어: fool 새로 쓴 것 전부(항목 → fool) ④ 노래: 변형 늘어난 예 10(KR · JP · 통용 제목 · 음차) · lookup 실패 · 통용 제목 없는 곡 수 ⑤ 시·군·구: 추가 n(광역 · 행정시 · 일반구) · #116 오답 11개 전후 ⑥ scope 예 5
   1 원칙 7 · 2 결정 필요(없으면 "없음").
   커밋 6.
■ 산출물: topics liar-* 15 · draw-* 10 · closed scope · kr-municipality · seoul-subway-station 삭제 · song/items.json · scripts/g049-topics-fix.mjs · g049-song-variants.mjs · topics-check.mjs · audit/g049-* · 07 · 13 · 18 · 05 · 06 · README · ai-out/G049.txt.
■ DB 쓰기: F 의 문항 1건(두 DB)뿐. 주제 · 노래 적재는 찬종 메뉴 1.
■ 하지 말 것: 캐치 remove 239 를 그대로 적용 · VERIFY 판정 다시 돌리기(조각으로 재판정 X) · 새 제시어 항목 추가(되살리기 · 2차 수집은 찬종 신호 뒤) · 라이어 unsure 인물 빼기 · 지하철 호선별 수집(G050) · 코드(server · web · shared) · topics-load.mjs · ox · 다른 문항 · 13 A · CV-175 · CV-177 · 20 · README R · V.
■ 확인할 것 (원칙 7): fixes 수(A) · V044 "fool 교체 268" 과 파일 fool 묶음 233 의 관계(묶음 안 replace 수 합) · 영문 64 가 G043 diff 에 있는지 · iTunes KR/JP lookup 이 실제로 다른 언어를 주는지(3곡 먼저) · J-pop · 팝 곡 수 · topics-check 가 머리 모르는 칸을 막는지 · kr-municipality 현 227 의 통합특별시 반영 상태 · #1491 정답 · 현 변형 · 13 마지막 C · 07 맨 위 · README G 마지막 G048.
■ 커밋: 단계마다 · fetch → rebase --autostash → push(503 이면 VPN — 로컬 커밋만 하고 계속) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ ★ 이어서: 보고서 · push 뒤 터미널에 "G049 끝 — ★ 찬종: 메뉴 3 → 1 [1] → 테스트 2 · gen-next(G050 지하철 호선별) 이어서 · /clear 아직" 을 찍고 **`ai-out/briefs/gen-next.md` 를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤).
■ 답변: 한국어 · 터미널 5줄 이내.
