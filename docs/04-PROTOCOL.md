# 게임 상태 머신과 Socket 프로토콜

> 게임 규칙 자체는 [01-GAME-RULES.md](01-GAME-RULES.md) 가 정본이다.
> 이 문서는 그 규칙을 **어떤 상태 전이와 어떤 이벤트로** 구현하는지를 정한다.

---

## 1. ★ 동시성 설계 원칙 — 가장 먼저 읽을 것

이 프로젝트에서 **가장 깨지기 쉽고, 깨졌을 때 가장 발견하기 어려운** 규칙이다.

### 원칙

1. **방 단위 직렬 처리.** Node는 단일 스레드 이벤트 루프이므로, 하나의 이벤트 핸들러가
   `await` 없이 끝까지 실행되는 동안 다른 이벤트가 끼어들 수 없다.
2. **★ 판정과 상태 전환은 하나의 동기 실행 블록에서 수행한다. 그 블록 안에 `await` 를 절대 넣지 않는다.**
3. **판정에 필요한 데이터는 문제 시작 시점에 메모리로 미리 로드한다** —
   정답 집합, 참가자별 경험 여부, 힌트, 마스킹용 표기.
4. **DB 기록은 상태 전환이 끝난 뒤 비동기로 한다.** DB 쓰기 실패가 게임 진행을 막지 않는다.
5. 모든 인바운드 이벤트에 서버 수신 시 단조 증가 시퀀스를 부여한다.

### 왜 이렇게까지 강조하는가

누군가 "여기서 경험 여부를 한 번 더 확인하자"며 판정 블록에 `await` 한 줄을 넣는 순간,
그 지점에서 다른 이벤트가 끼어들 수 있게 되어 **두 명이 동시에 정답자가 될 수 있다.**

- 에러가 나지 않는다
- 평소에는 정상 동작한다
- 동시 입력이 정확히 겹치는 순간에만 발생한다
- 재현이 매우 어렵다

**대응**: 판정 함수 이름에 규칙을 박아 넣고(`resolveQuestionSync`), 함수 상단에 이유를 주석으로 남기고,
동시 정답 100회 반복 테스트를 CI에 넣는다.

### 두 겹 방어 장치

**장치 A — `resolved` 플래그**

상태 전환 함수의 첫 줄에서 동기적으로 확인·설정한다.

```
if (q.resolved) return;   // 이미 끝난 문제
q.resolved = true;        // 여기서 즉시 세운다
```

이 두 줄 사이에 `await` 가 없으므로 두 번째 요청이 끼어들 수 없다.
`QUESTION_ACTIVE → QUESTION_RESOLVED` 가 문제당 정확히 한 번만 일어난다.

**장치 B — `epoch` (문제 세대 번호)** ★

클라이언트는 `chat.send` / `skip.vote` / `host.forceSkip` 에 **자신이 보고 있는 epoch** 를 담는다.
서버는 수신 시 현재 문제의 epoch와 비교해, 다르면 **정답 판정에서 제외하고 채팅으로만 표시한다.**

**왜 상태 검사만으로는 부족한가.**
사용자가 `QUESTION_RESOLVED` 구간(5초)에 "훈민정음"을 입력했고, 그 메시지가 네트워크 지연으로
5초 뒤 **다음 문제가 시작된 직후** 서버에 도착했다면, 서버 상태는 이미 `QUESTION_ACTIVE` 이므로
상태 검사를 통과한다. 그리고 새 문제의 정답이 우연히 "훈민정음" 이면 정답 처리된다.

이것이 게임 규칙이 명시적으로 금지한 바로 그 상황이다. epoch가 다르면 판정하지 않으므로 원천 차단된다.

> epoch는 **재개(PAUSED → 원래 상태)에서는 증가시키지 않는다.** 같은 문제를 이어서 하기 때문이다.
> 증가하는 시점은 새 문제를 시작할 때뿐이다.

---

## 2. 상태 정의

`room.state` 6종. `game.endReason` 5종은 [01-GAME-RULES.md](01-GAME-RULES.md) 6장 참조.

### LOBBY

| 항목 | 내용 |
|------|------|
| 보유 데이터 | room{id,title,hostAccountId} / players[] / settings / settingsLocked=false / chatBuffer(500) / lastGameSettings / experienceRates / hostGraceUntil |
| 채팅 | O (정답 판정 대상 없음) |
| 스킵 투표 | X |
| 방장 액션 | 설정 변경 / 게임 시작 / 접속 종료자 강제 퇴장 |
| 입장·퇴장 | O |
| 시간 제한 | 없음. 활성 0명 10분이면 방 삭제 |

### COUNTDOWN

| 항목 | 내용 |
|------|------|
| 추가 데이터 | countdownEndsAt / settingsLocked=true |
| 채팅 | O (정답 판정 대상 없음) |
| 스킵 투표 | X |
| 방장 액션 | **카운트다운 취소** / 접속 종료자 강제 퇴장. 설정 변경은 불가 |
| 입장 | **O** (카운트다운 중 신규 입장 허용) |
| 시간 제한 | 설정값(3~60초). 만료 시 첫 문제 시작 |

### QUESTION_ACTIVE

| 항목 | 내용 |
|------|------|
| 추가 데이터 | game{id,startedAt,plannedQuestionCount,usedQuestionIds} / currentQuestion{epoch, index, questionId, text, categoryName, **answersNorm(Set)**, displayAnswer, **answersRaw**, hint, hintPushed, explanation, **experiencedAccountIds(Set)**, startedAt, endsAt, **resolved**} / skipVotes(Set) / scores(Map) |
| 채팅 | O |
| 정답 판정 | 조건: `state=QUESTION_ACTIVE` AND `resolved=false` AND `epoch 일치` AND `수신시각 ≤ endsAt` AND `발신자 connected` AND `미경험자` AND `정규화 일치` |
| 스킵 투표 | O (활성 2명 이상) |
| 방장 액션 | 강제 스킵 / 강제 종료 / 접속 종료자 강제 퇴장 |
| 입장 | O (중간 참가) |
| 시간 제한 | **정확히 30초.** 남은 10초 시점에 서버가 힌트 push (`hintPushed` 로 1회만) |

### QUESTION_RESOLVED

| 항목 | 내용 |
|------|------|
| 추가 데이터 | resolution{epoch, reason, winnerAccountId, displayAnswer, explanation, nextAt} |
| 채팅 | **O** (입력창을 닫지 않는다) |
| 정답 판정 | **X.** 이 구간의 메시지는 어떤 문제의 정답으로도 판정되지 않는다 |
| 스킵 투표 | X. 강제 스킵 요청은 무시한다 |
| 방장 액션 | 강제 종료 / 접속 종료자 강제 퇴장 |
| 입장 | O. **★ 이 구간 입장자도 경험 기록을 남긴다** (정답을 봤기 때문) |
| 시간 제한 | 5초. **마지막 문제에서는 이 상태를 거치지 않는다** |

> `epoch` 는 이 상태에서 아직 증가하지 않는다. 다음 문제를 시작할 때 증가한다.

### PAUSED ★

| 항목 | 내용 |
|------|------|
| 추가 데이터 | **pausedFrom**(어느 상태에서 멈췄는지) / pausedAt / **remainingMs** / 그리고 멈추기 전의 currentQuestion 전체, epoch, resolved, skipVotes, hintPushed, scores 를 그대로 보존 |
| 채팅 | O (**정답 판정은 하지 않는다**) |
| 정답 판정 | X |
| 스킵 투표 | X |
| 방장 액션 | **재개** / 강제 종료 / 접속 종료자 강제 퇴장 |
| 입장·퇴장 | O |
| 시간 제한 | **30분.** 초과 시 게임 종료(`abandoned`) |
| 서버 tick | **PAUSED 방은 건너뛴다.** 타이머가 흐르지 않는다 |
| 방 삭제 타이머 | **정지한다.** `abandoned` 된 뒤에 시작한다 |
| 방장 이전 타이머 | 활성 0명 동안 **정지한다** (이전할 대상이 없다) |

### GAME_RESULT

| 항목 | 내용 |
|------|------|
| 추가 데이터 | result{gameId, endReason, ranking[], lastQuestionReveal, abortedNote} |
| 채팅 | **O** (결과 화면에서도 유지) |
| 정답 판정 / 스킵 | X |
| 방장 액션 | 다시 하기 / 로비로 / 접속 종료자 강제 퇴장 |
| 입장 | O (결과 화면을 본다) |
| 시간 제한 | 없음. 방장 액션 대기. 활성 0명 10분이면 방 삭제 |

---

## 3. 전이표

형식: `[ID] 출발 → 도착 / 트리거 / 조건 / 부수 효과`

### 게임 시작

| ID | 전이 | 트리거 | 조건 | 부수 효과 |
|----|------|--------|------|----------|
| T01 | LOBBY → COUNTDOWN | 방장 `game.start` | startMode=countdown, 문제 수 1~200, 카운트다운 3~60, **출제 가능 수 ≥ 설정 수**, 활성 ≥ 1 | settingsLocked=true, countdownEndsAt 설정 |
| T02 | LOBBY → QUESTION_ACTIVE | 방장 `game.start` | startMode=instant, 그 외 T01과 동일 | games INSERT, 점수 0 초기화, **[문제 시작 공통 절차]** |
| T03 | COUNTDOWN → LOBBY | 방장 `game.cancelCountdown` | — | settingsLocked=false |
| T04 | COUNTDOWN → QUESTION_ACTIVE | `now ≥ countdownEndsAt` | 활성 ≥ 1, **출제 가능 수 ≥ 설정 수 (재확인)** | T02와 동일 |

> **T04 에서 출제 가능 수를 다시 확인한다** (Phase 2 구현에서 추가, D-025).
> 카운트다운 중 신규 입장이 허용되므로(Q-11) 참가자 집합이 바뀔 수 있고,
> 출제 가능 수는 참가자 집합의 함수다. 사람이 나가면 줄어들 수 있다.
> 부족하면 게임을 시작하지 않고 **LOBBY 로 되돌리고 이유를 알린다.**
>
> ★ **Phase 2 시점의 한계**: 활성 0명이면 T20(PAUSED)로 가야 하지만
> PAUSED 가 Phase 5이므로, 지금은 T04 의 "활성 ≥ 1" 조건만 지켜 **만료를 보류**한다.
> 사람이 돌아오면 그때 시작된다. 근거와 차이점은 [07-DECISIONS.md](07-DECISIONS.md) D-023.

### 문제 종료 — 정답 공개 경로 (경험 기록 O)

| ID | 전이 | 트리거 | 조건 | 부수 효과 |
|----|------|--------|------|----------|
| T06 | QUESTION_ACTIVE → QUESTION_RESOLVED | 정답 일치 메시지 | 2장 판정 조건 전부 만족, **마지막 문제 아님** | `resolved=true`(동기), 정답자 +1, **경험 기록**, answer_events INSERT, game_questions UPDATE(correct), nextAt=now+5000 |
| T07 | QUESTION_ACTIVE → QUESTION_RESOLVED | `now ≥ endsAt` | resolved=false, 마지막 문제 아님 | 정답 공개, **경험 기록**, resolution=timeout |
| T08 | QUESTION_ACTIVE → QUESTION_RESOLVED | 스킵 투표 임계 도달 | 활성 ≥ 2, votes ≥ threshold, 마지막 문제 아님 | **시간 종료와 동일 경로.** 정답 공개, **경험 기록**, resolution=skip_vote |
| T09 | QUESTION_ACTIVE → QUESTION_RESOLVED | 방장 `host.forceSkip` | resolved=false, 마지막 문제 아님 | T08과 동일. resolution=host_skip |
| T10 | QUESTION_ACTIVE → **GAME_RESULT** | T06~T09 중 하나 | **마지막 문제** | 해당 사유로 정답 공개 + **경험 기록**, **5초 대기 없이 즉시**, endReason=completed, `lastQuestionReveal` 에 정답을 담아 결과 화면에 표시 |

### 문제 종료 — 정답 미공개 경로 (경험 기록 X)

| ID | 전이 | 트리거 | 조건 | 부수 효과 |
|----|------|--------|------|----------|
| T11 | QUESTION_ACTIVE → GAME_RESULT | 방장 `host.forceEnd` | 언제든 | **정답 미공개, 경험 미기록.** game_questions.resolution=aborted, 현재 점수로 순위 확정, endReason=force_ended. **이미 지나간 문제의 경험 기록은 삭제하지 않는다** |
| T12 | QUESTION_RESOLVED → GAME_RESULT | 방장 `host.forceEnd` | — | 정답은 이미 공개됐고 경험 기록도 이미 남았다. 그대로 유지. endReason=force_ended |
| T13 | PAUSED → GAME_RESULT | 방장 `host.forceEnd` | — | T11과 동일 처리 |
| T14 | PAUSED → GAME_RESULT | **PAUSED 30분 초과** | — | 정답 미공개, 경험 미기록. endReason=abandoned, abortedNote 표시. **이후 방 삭제 타이머 시작** |

### 다음 문제 / 게임 완료

| ID | 전이 | 트리거 | 조건 | 부수 효과 |
|----|------|--------|------|----------|
| T15 | QUESTION_RESOLVED → QUESTION_ACTIVE | `now ≥ nextAt` | 다음 문제 선정 가능 | **[문제 시작 공통 절차]**. epoch += 1, skipVotes 초기화 |
| T16 | QUESTION_RESOLVED → GAME_RESULT | `now ≥ nextAt` | **다음 문제 선정 불가** | endReason=no_questions, abortedNote="출제할 수 있는 문제가 모두 소진되어 조기 종료되었습니다" |

### 일시정지 ★

| ID | 전이 | 트리거 | 조건 | 부수 효과 |
|----|------|--------|------|----------|
| T20 | COUNTDOWN → PAUSED | 활성 0명 | **즉시. 유예 없음** | pausedFrom=COUNTDOWN, remainingMs = countdownEndsAt − now |
| T21 | QUESTION_ACTIVE → PAUSED | 활성 0명 | 즉시 | pausedFrom=QUESTION_ACTIVE, remainingMs = endsAt − now. currentQuestion/epoch/resolved/skipVotes/hintPushed 보존 |
| T22 | QUESTION_RESOLVED → PAUSED | 활성 0명 | 즉시 | pausedFrom=QUESTION_RESOLVED, remainingMs = nextAt − now |
| T23 | PAUSED → pausedFrom | **방장 `game.resume`** | 활성 ≥ 1 | 종료 시각 = now + remainingMs 로 재계산, **epoch 증가 없음**, 전원에게 `game.resumed` 로 새 종료 시각 브로드캐스트 |

> **LOBBY와 GAME_RESULT는 PAUSED로 가지 않는다.** 타이머가 없으므로 멈출 것이 없고,
> 기존 방 삭제 경로(활성 0명 10분)를 그대로 탄다.

### 결과 화면 이후

| ID | 전이 | 트리거 | 부수 효과 |
|----|------|--------|----------|
| T30 | GAME_RESULT → LOBBY | 방장 `game.again` | settings ← lastGameSettings, 점수·진행 초기화, **경험 기록 유지**, **접속 종료자 슬롯 반환**, settingsLocked=false. **자동 시작하지 않는다** |
| T31 | GAME_RESULT → LOBBY | 방장 `game.toLobby` | **서버 동작은 T30과 동일.** UI 차이만 있다 |

### 상태를 바꾸지 않는 전이

| ID | 트리거 | 부수 효과 |
|----|--------|----------|
| T-JOIN | `room.join` | players 추가 또는 재연결, colorIndex 배정, `room.state` 스냅샷 전송, 경험자 목록 갱신 브로드캐스트, **스킵 임계값 재평가**, PAUSED였다면 그대로 유지(자동 재개 없음) |
| T-LEAVE | 소켓 disconnect 또는 `room.leave` | connected=false. 점수·경험·슬롯 유지. **스킵 분모·활성 인원 즉시 반영 → 임계값 재평가.** 표시는 **5초 후**. 방장이었다면 hostGraceUntil=now+30s. **활성 0명이 되면 즉시 PAUSED** |
| T-RECONNECT | 같은 계정 새 소켓 | 기존 players 항목에 재연결. **색상·점수 유지**, "접속 종료" 표기 제거, 스냅샷 전송. **방장 권한은 돌려주지 않는다.** 같은 계정의 기존 소켓이 살아 있으면 끊고 `session.terminated` 전송 |
| T-HOST | hostGraceUntil 만료 | 입장 순서가 가장 빠른 활성 플레이어에게 이전. 게임을 중단하지 않는다. **PAUSED 중(활성 0명)에는 이 타이머가 정지한다** |
| T-KICK | 방장 `host.kickDisconnected` | 대상이 disconnected일 때만. players에서 제거 → 슬롯 즉시 반환. **game_players 레코드는 유지**(그 게임 결과에는 남는다) |
| T-ROOMDEL | 활성 0명 10분 | 방 삭제, rooms.closed_at 기록. **PAUSED 중에는 이 타이머가 정지한다** |

### [문제 시작 공통 절차]

T02 / T04 / T15가 공통으로 수행한다. **순서가 중요하다.**

1. 문제 선정 (★ **3단계** 알고리즘, 이미 출제한 문제 제외, ★ **이미 쓴 정답 제외**). 실패하면 T16
2. 정답 집합 로드 — `question_answers.answer_norm` 전체를 Set으로 메모리에 적재
   ★ **동시에 `usedAnswerNorms` 에 이 문제의 정답 전부를 합친다** (R013 / Q-76)
3. 마스킹용 원문 표기 목록(`answersRaw`) 적재
4. 힌트 미리 계산 (`shared/generateHint`)
5. 경험자 집합 계산 — 현재 참가자 각자의 경험 여부
6. **epoch += 1**, resolved=false, skipVotes 초기화, hintPushed=false
7. startedAt = now, endsAt = startedAt + 30000
8. game_questions INSERT
9. `question.started` 브로드캐스트 (개인별 `selfExperienced` 포함)

> 1~5는 DB 접근이 있어 `await` 를 포함한다. 이 절차는 판정 블록이 아니므로 허용된다.
> **핵심은 6~9가 끝난 뒤에는 판정에 필요한 모든 데이터가 메모리에 있다는 것이다.**
> 그래서 정답 판정 블록에서 `await` 가 필요 없어진다.

### ★★ 문제 선정 3단계 알고리즘 (R013 / Q-76. 미구현)

> ★ 게임 상태에 `usedQuestionIds: Set<number>` 와
> ★ `usedAnswerNorms: Set<string>` 을 둔다. 둘 다 게임 시작 때 비운다.

```
selectNextQuestion(room):
  pool = 출제 대상 전체
         (status='approved' AND is_active AND question_type='short_answer')
         MINUS room.usedQuestionIds

  # ── 1단계: 전원 미경험 AND 정답 미사용
  s1 = pool 중 (현재 참가자 전원이 미경험) AND (정답 교집합 ∩ usedAnswerNorms = ∅)
  if s1 비어 있지 않음: return 무작위(s1), stage=1

  # ── 2단계: 1명 이상 미경험 AND 정답 미사용
  s2 = pool 중 (1명 이상 미경험) AND (정답 교집합 ∩ usedAnswerNorms = ∅)
  if s2 비어 있지 않음: return 미경험자수_가중_무작위(s2), stage=2

  # ── ★ 3단계 (신설): 정답 중복을 허용한다
  #   ★ 근거: 정답 중복 금지 때문에 게임이 일찍 끝나는 것이 더 나쁘다 (01-GAME-RULES 7절)
  s3 = pool 중 (1명 이상 미경험)
  if s3 비어 있지 않음: return 미경험자수_가중_무작위(s3), stage=3

  return null   # → T16 조기 종료 (endReason=no_questions)
```

★ **정답 비교는 `answer_norm` 의 교집합**으로 한다 (01-GAME-RULES 7절의 근거 참조).
  대표 정답만 비교하지 않는다 — 판정에 쓰이는 것이 `answer_norm` 전체이므로
  중복 판단도 같은 기준이어야 한다.

★ **경험 규칙이 정답 중복 금지보다 우선한다.**
  3단계에서도 "1명 이상 미경험" 조건은 유지된다.
  ★ 경험 규칙에는 예외를 만들지 않는다 (기존 규칙).

★ `stage` 를 `game_questions` 에 기록한다 (컬럼 신설 필요).
  ★ 근거: "정답 중복 금지가 실제로 얼마나 발동하는가" 를 운영자가 알아야 한다.
  ★ 화면에는 표시하지 않는다 — 플레이어에게 알릴 이유가 없다.

★ **성능** — 정답 교집합 검사를 매번 DB 로 하지 않는다.
  ★ 게임 시작 때 출제 대상의 `(question_id, answer_norm[])` 을 한 번 읽어 메모리에 둔다.
  ★ 근거: 출제 가능 문제가 수천 건이 되어도 문자열 Set 교집합은 메모리에서 즉시 끝난다.
    매 문제마다 DB 를 다시 읽으면 문제 시작 절차가 느려지고,
    그 절차는 30초 타이머 시작 전에 끝나야 한다.

---

## 4. 동시 발생 시나리오

| 시나리오 | 처리 |
|---------|------|
| 두 사람이 거의 동시에 정답 | 서버 이벤트 큐 순서대로 처리. 먼저 처리된 쪽이 장치 A로 `resolved` 를 세우고 정답자가 된다. 두 번째는 첫 줄에서 return하고 일반 채팅으로만 표시된다. **"오답입니다" 를 보내지 않는다** |
| 타이머 만료 vs 정답 | 둘 다 같은 전환 함수를 호출하고 장치 A로 하나만 성공. **추가로 정답은 "수신 시각 ≤ endsAt" 을 요구한다.** tick이 100ms 주기라 만료 후 최대 100ms 동안 상태가 아직 ACTIVE인데, 그 사이 도착한 늦은 답을 시각으로 잘라낸다 |
| 스킵 임계 도달 vs 정답 | 장치 A로 하나만 성공. 먼저 처리된 쪽의 사유가 기록된다 |
| 방장 강제 스킵 vs 정답 | 위와 동일. **강제 스킵 요청에도 epoch를 담는다.** 방장이 확인창을 띄운 사이 문제가 끝났다면 확인을 눌러도 epoch가 달라 무시된다(다음 문제를 스킵해 버리는 사고 방지) |
| 방장 강제 종료 vs 정답 | 강제 종료가 먼저면 상태가 GAME_RESULT가 되어 정답은 무시. 정답이 먼저면 인정되고(점수·경험 기록) 이어서 T12로 종료. **강제 종료에는 epoch를 담지 않는다**(게임 전체 액션이므로) |
| 정답 확정 직후 도착한 메시지 | `resolved=true` 이고 상태도 RESOLVED이므로 채팅으로만 표시 |
| **RESOLVED 구간 입력이 다음 문제 정답과 우연히 일치** | **장치 B(epoch)로 차단.** 필수 테스트 항목이다 |
| 스킵 투표 중 인원 변동 | 인원 변동 이벤트 처리 블록 **안에서 동기적으로** 임계값을 재평가한다. 도달했으면 그 자리에서 T08. 다음 tick으로 미루면 그 사이 도착한 정답과 순서가 불명확해진다 |
| 마지막 플레이어가 정답과 동시에 끊김 | 서버 수신 순서가 결정한다. 정답이 먼저면 인정되고(그 순간 아직 접속 중이므로 경험 기록도 남는다) 이어서 활성 0명 → **즉시 PAUSED**. disconnect가 먼저면 미접속 플레이어의 메시지이므로 판정하지 않는다 |
| 같은 사람이 정답을 연타 | 첫 번째만 정답 처리, 나머지는 채팅. **rate limit이 정상적인 연타(초당 3개 수준)를 막지 않아야 한다** |
| 경험자가 정답을 입력 | 판정에서 제외되고 마스킹 대상이 된다. **두 경로는 완전히 분리되어 있다**(5장) |
| ★ 문제 선정이 3단계로 내려감 (R013) | 정답 중복을 허용해 출제한다. `game_questions.stage=3` 으로 기록하고 **화면에는 표시하지 않는다**. ★ 조기 종료보다 정답 중복이 낫다는 판단이다 (Q-76) |
| **PAUSED 중 도착한 메시지** | 채팅으로만 표시한다. 판정하지 않는다. epoch가 같아도 상태 검사에서 걸린다 |
| **재개 직후 도착한 낡은 메시지** | epoch는 재개 시 증가하지 않으므로 통과할 수 있다. 그러나 `수신 시각 ≤ endsAt` 조건과 `resolved` 플래그가 남아 있어 잘못된 정답 인정은 일어나지 않는다. 다만 **재개 직후 몇 초간은 멈추기 전에 보낸 메시지가 늦게 도착해 정답 처리될 수 있다.** 이는 "멈추기 전에 이미 답을 알고 보낸 것"이므로 규칙 위반이 아니라고 판단한다 |

---

## 5. 마스킹과 정답 판정의 분리 ★

- **정답 판정은 "수신 직후의 입력 처리"** 다. 입력은 **항상 클라이언트가 보낸 원문**이다
- **마스킹은 "브로드캐스트 직전의 출력 변환"** 이다. 출력만 바꾼다
- **두 경로는 데이터를 공유하지 않는다.** 마스킹 결과가 판정 입력으로 흘러갈 수 있는 코드 경로가
  존재해서는 안 된다

### `chat.send` 파이프라인 (순서 고정)

```
단계 1  검증 (동기)
        세션 / 방 소속 / 길이 100자 / rate limit
        초과 시 chat.throttled 를 본인에게만 보내고 종료

단계 2  판정 경로 (동기, await 금지)
        입력: rawInput   ★ 이 단계는 마스킹을 전혀 알지 못한다
        조건 전부 만족 시 resolveQuestionSync('correct', accountId)

단계 3  브로드캐스트 경로 (동기)
        maskedText = maskAnswers(rawInput, ...)   ← 마스킹 조건일 때만
        발신자에게는 원문 + masked 플래그, 나머지에게는 치환본

단계 4  DB 기록 (비동기, 여기서부터 await 허용)
        정답 문자열과 일치한 메시지만 answer_events INSERT
        일반 채팅은 저장하지 않는다
```

**단계 2가 단계 3보다 먼저인 이유**: 정답이 확정되면 `question.resolved` 를 보내야 하는데,
그보다 먼저 `chat.message` 가 나가야 화면에 "철수: 훈민정음" 다음에 "정답! 철수" 가 뜬다.
그래서 단계 2에서는 **판정만** 하고, `question.resolved` emit은 단계 3 이후에 한다.
전환과 전송을 분리해도 원자성은 `resolved` 플래그가 보장한다.

### 마스킹 대상 조건

```
state === QUESTION_ACTIVE
AND resolved === false
AND experiencedAccountIds.has(sender.accountId)
```

**미경험자의 메시지는 절대 마스킹하지 않는다.** 설령 마스킹 조건 판정이 틀리더라도
단계 2는 이미 원문으로 판정을 끝냈으므로 정답 판정은 영향을 받지 않는다.
**이 이중 안전성이 파이프라인을 이 순서로 고정하는 이유다.**

### 인덱스 매핑 구현 지침

정규화는 공백을 지우고 문자를 바꾸므로, 정규화 문자열에서 정답을 찾아도
원문의 어느 구간을 가려야 하는지 알 수 없다. `shared/buildNormalizedIndex()` 가 이를 해결한다.

1. 원문에 **NFC를 먼저 전체 적용**해 `rawNfc` 를 만든다
   (NFC는 시퀀스 단위로 결합하므로 문자 단위로 적용하면 인덱스가 어긋난다)
2. `rawNfc` 를 순회하며 `norm` 과 `map`(norm의 **코드 유닛**마다 rawNfc 인덱스)을 만든다
3. 정답 후보를 정규화 길이 **내림차순**으로 정렬한다 (긴 것 우선 치환)
4. `norm` 에서 찾는다. 정규화 길이 2 이하면 **전체 일치일 때만**
5. 찾은 구간을 `map` 으로 `rawNfc` 구간으로 되돌린다
6. 매칭 구간을 **모두 수집한 뒤 한 번에 조립한다** (치환하며 진행하면 인덱스가 어긋난다)

**부작용**: 표시되는 채팅 텍스트가 NFC 정규화된 형태가 된다. 시각적으로 동일하므로 문제없다.

---

## 6. 타이머

### 서버

- **전역 tick 하나**로 모든 방을 순회한다. 방마다 타이머를 두지 않는다
  (타이머 핸들이 방 생명주기와 엉키면 누수와 중복 실행이 생긴다)
- tick 주기 **100ms**
- **PAUSED인 방은 건너뛴다**

매 tick에서 방마다 순서대로 검사한다.

1. COUNTDOWN: `now ≥ countdownEndsAt` → T04
2. QUESTION_ACTIVE:
   a. `hintPushed=false` AND `endsAt − now ≤ 10000` → 힌트 push, hintPushed=true
   b. `now ≥ endsAt` → T07 (마지막 문제면 T10)
3. QUESTION_RESOLVED: `now ≥ nextAt` → T15 / T16
4. **PAUSED: `now − pausedAt ≥ 30분` → T14**
5. hostGraceUntil 만료 → T-HOST (**활성 0명이면 정지**)
6. 방 삭제 조건 (활성 0명 10분) → T-ROOMDEL (**PAUSED 중이면 정지**)

**"정확히 30초" 에 대하여.** `setTimeout(30000)` 단독은 이벤트 루프가 바쁘면 지연되고 보정되지 않는다.
그래서 **절대 시각(`endsAt`)을 저장하고 100ms tick에서 비교한다.** 최대 오차 +100ms이며
사용자가 인지할 수 없다. **중요한 것은 정답 인정 경계가 tick이 아니라 `endsAt` 이라는 점이다.**
즉 tick 오차가 게임 판정에 영향을 주지 않는다.

**힌트를 서버가 push하는 이유.** 문제와 함께 미리 보내면 클라이언트가 30초 시점에 이미
힌트를 갖고 있어 개발자 도구로 볼 수 있다. 재접속 스냅샷에도 **남은 시간 10초 이하일 때만** 포함한다.

### 클라이언트 — 시계 오프셋

```
1. t0 = Date.now() 를 담아 time.ping 전송
2. 서버가 { t0, tServer } 로 time.pong 응답
3. t1 = Date.now()
4. rtt = t1 − t0,  offset = tServer − (t0 + rtt / 2)
```

- 측정 시점: 연결 직후 **3회(200ms 간격)**, 이후 **30초마다**, **가시성 복귀 시 즉시**
- **채택 값: 최근 5회 중 RTT가 가장 작은 측정의 offset.** 평균이나 중앙값이 아니다.
  RTT가 작을수록 편도 지연의 비대칭이 작아 추정이 정확하다. NTP와 같은 원리다
- 남은 시간 = `endsAt − (Date.now() + offset)`
- **클라이언트 타이머가 0에 도달해도 어떤 상태 전환도 하지 않는다.**
  "결과 확인 중…" 만 표시하고 서버 이벤트를 기다린다

**백그라운드 복귀 시**: `visibilitychange` 에서 (1) `time.ping` 재측정 → (2) `state.resync` 전송.
오프셋 재측정을 **먼저** 하는 이유는, 모바일 브라우저가 백그라운드에서 타이머를 조이거나 멈추고
절전 복귀 시 시스템 시각이 보정되기도 하기 때문이다. 낡은 오프셋으로 스냅샷을 받으면
남은 시간이 틀리게 표시된다.

**실측 (R004)**: 로컬 직결 RTT 1ms / 오프셋 +4.5ms.
Cloudflare 터널 경유 RTT 133~257ms / 오프셋 −21 ~ +49.5ms.
터널 경유에서는 측정마다 오프셋이 70ms 폭으로 흔들렸고, **RTT 최소 측정을 채택하는 방식이
실제로 유의미하게 작동했다.**

---

## 7. Socket 이벤트 목록

> **Phase 1까지 구현된 것은 아래 표의 ✅ 항목이다.**
> 나머지는 타입만 `shared/src/protocol.ts` 에 확정해 두었다. 구현 상태는 [05-STATUS.md](05-STATUS.md).
>
> 인증·세션 이벤트(`server.hello` `session.established` `session.terminated`)와
> 시각 동기화(`time.ping` `time.pong`), `heartbeat` 도 전부 구현되어 있다.

### 공통 규약

- 이름은 `영역.동작` 점 표기
- 인증은 HTTP 핸드셰이크의 httpOnly 쿠키로. 소켓 이벤트로 로그인하지 않는다
- 모든 C→S 이벤트를 서버가 순서대로 검사한다:
  세션 → 방 소속 → 권한 → 상태 적합성 → 페이로드 스키마
- **클라이언트가 버튼을 숨기더라도 서버가 모든 액션의 권한과 상태를 다시 검사한다**
- **서버는 `QUESTION_ACTIVE` 중에 정답 문자열을 절대 클라이언트로 보내지 않는다**

### 인증 / 세션

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `server.hello` | S→C | `{ serverTime, bootedAt, phase }` |
| `session.established` | S→C | `{ accountId, nickname, serverTime }` |
| `session.terminated` | S→C | `{ reason: 'another_connection' }` |

### 방 / 로비

| 이벤트 | 방향 | 페이로드 | Phase 1 |
|--------|------|---------|:-------:|
| `room.create` | C→S | `{ title }` | ✅ |
| `room.created` | S→C | `{ roomId }` | ✅ |
| `room.join` | C→S | `{ roomId }` | ✅ |
| `room.leave` | C→S | `{}` | ✅ |
| `room.left` | S→C | `{ roomId }` | ✅ |
| `room.state` | S→C | **전체 스냅샷** (9장) | ✅ |
| `room.playerJoined` | S→C | `{ player, players[], activeCount }` | ✅ |
| `room.playerLeft` | S→C | `{ accountId, players[], activeCount }` | ✅ |
| `room.playersUpdated` | S→C | `{ players[], activeCount }` | ✅ |
| `room.connectionChanged` | S→C | `{ accountId, connected, activeCount }` | ✅ |
| `room.hostChanged` | S→C | `{ hostAccountId, nickname }` | ✅ |
| `host.kickDisconnected` | C→S | `{ accountId }` (방장) | ✅ |
| `state.resync` | C→S | `{}` → 서버가 `room.state` 응답 | ✅ |
| `error` | S→C | `{ code, message, detail }` | ✅ |
| `lobby.updateSettings` | C→S | `{ questionCount, startMode, countdownSec }` (방장) | ✅ |
| `lobby.settingsUpdated` | S→C | `{ settings, settingsLocked, availableQuestionCount }` | ✅ |
| `lobby.experienceRates` | S→C | `{ rates: [{ accountId, experienced, total }] }` | ✅ |

#### Phase 2 구현에서 명세보다 넓어진 부분

R003 명세는 `lobby.settingsUpdated { settings, availableQuestionCount }` 였다.
구현에서는 **`settingsLocked` 를 함께 보낸다.**

이유: 설정 잠금은 `settings` 와 함께 변하는 값인데(카운트다운 시작·취소 시)
클라이언트가 상태(`room.state`)에서 유추해야 한다면 그 유추 규칙이 서버와
어긋나는 순간 "입력창이 열려 있는데 서버가 거부하는" 상태가 된다.
★ 서버가 계산한 값만 신뢰하게 만드는 것이 이 프로젝트의 일관된 방침이다
(Phase 1의 `activeCount` 와 같은 이유).

**`availableQuestionCount` 는 참가자 집합이 바뀔 때만 다시 계산한다.**
설정값과 무관하고(참가자 집합의 함수다) 방장이 숫자를 한 글자 고칠 때마다
DB를 조회하면 안 되기 때문이다(docs/02-ARCHITECTURE.md "DB 접근 규칙").
★ 단 **게임 시작 직전에는 캐시를 믿지 않고 반드시 다시 조회한다** (Q-21).
그 값이 `games.planned_question_count` 에 기록된다.

`lobby.experienceRates` 는 로비 진입 / 참가자 변동 시점에만 보낸다.
★ 주기적으로 보내지 않는다. 경험 기록은 게임이 끝나야 늘어나므로
로비에 있는 동안 값이 바뀔 일이 없다.

**`error.code`** — `UNAUTHENTICATED` `NOT_IN_ROOM` `NOT_HOST` `INVALID_STATE`
`BAD_REQUEST` `ROOM_FULL` `ROOM_NOT_FOUND` `ROOM_CLOSED` `ALREADY_HAS_ROOM`
`NOT_ENOUGH_QUESTIONS` `INTERNAL`

> ★ **`error` 는 사람 화면에 반드시 도달해야 한다** (R008 / D-027).
> 클라이언트는 화면 종류와 무관하게 `Notice` 배너 한 곳에서만 표시한다.
> `detail` 에 실제 숫자와 해야 할 일이 들어 있으므로 `message` 만 보여주면 안 된다.
>
> ★ `INTERNAL` 은 핸들러가 예외를 던졌을 때 전송한다.
> R008 이전에는 로그만 남기고 전송하지 않았고, 그래서 사용자에게는
> "버튼을 눌렀는데 아무 일도 없다" 와 구분되지 않았다.
> ★ 예외 메시지 자체는 담지 않는다. 이벤트 이름과 seq 만 담는다.
>
> ★ `NOT_ENOUGH_QUESTIONS` 를 `INVALID_STATE` 와 구분하는 이유는
> 원인이 설정값이고 사용자가 문제 수를 줄이면 해결되기 때문이다.

> ★ `ROOM_NOT_FOUND` 와 `ROOM_CLOSED` 를 구분하는 것이 guide 49절 요구다.
> 메모리에 방이 없으면 DB를 보고 `closed_at` 으로 판별한다.

#### 구현이 명세보다 넓어진 부분 (Phase 1에서 확정)

R003 명세는 `room.playerJoined { player }` 처럼 변경분만 보내는 형태였다.
구현에서는 **참가자 목록 전체와 `activeCount` 를 함께 보낸다.**

이유는 두 가지다.

1. 클라이언트가 목록을 부분 갱신하려면 순서(joinOrder)와 방장 표시를 스스로 재계산해야 한다.
   서버가 이미 정렬해 갖고 있으므로 그대로 보내는 편이 단순하고 어긋날 여지가 없다.
   10명 × 필드 7개는 전송량이 무의미하다.
2. `activeCount` 는 스킵 투표 분모의 근거다(guide 22절).
   ★ 클라이언트가 `players` 배열에서 세면 안 된다. 표시용 `connected` 는 5초 유예가 걸려 있어
   실제 활성 인원과 다르다(Q-15 보완 / Q-29). **서버가 계산한 값만 신뢰해야 한다.**

`room.playersUpdated` 는 명세에 없던 이벤트다.
**접속 종료 표시가 5초 유예 뒤에 바뀌는 순간**을 알리기 위해 추가했다.
끊김 자체는 `room.connectionChanged` 로 즉시 알리지만, 표시 전환은 그보다 5초 늦다.
그 시점에 아무 이벤트도 없으면 화면이 갱신되지 않는다.
★ tick 이 매번 브로드캐스트하지 않고 **표시 상태가 실제로 바뀔 때만** 보낸다.

### 게임 진행

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `game.start` | C→S | `{}` (방장) — ✅ Phase 2 |
| `game.cancelCountdown` | C→S | `{}` (방장) — ✅ Phase 2 |
| `game.countdownStarted` | S→C | `{ endsAt, state, settingsLocked, settings }` — ✅ Phase 2 |
| `game.countdownCancelled` | S→C | `{ state, settingsLocked, settings, reason? }` — ✅ Phase 2 |
| `game.started` | S→C | `{ gameId, totalQuestions, state }` — ✅ Phase 2 |

> **Phase 2 구현에서 세 이벤트에 `state` 를 추가했다.**
> 명세대로 `{ endsAt }` 만 보내면 클라이언트가 "카운트다운이 시작되었으니 상태는
> COUNTDOWN 일 것" 이라고 유추해야 한다. 상태 전이 규칙이 서버와 클라이언트
> 두 곳에 생기는 것이므로, 서버가 확정한 값을 그대로 보낸다. 비용은 필드 하나다.
>
> `game.countdownCancelled.reason` 은 방장 취소(값 없음)와
> 출제 가능 수 부족으로 인한 자동 취소(`'not_enough_questions'`)를 구분한다 (D-025).
>
> ★ `game.started.gameId` 는 **null 일 수 있다.** 상태 전이를 동기로 끝낸 뒤
> `games` INSERT 를 하기 때문이다. INSERT 가 실패하면 null 로 남는다.
> Phase 3에서는 그 경우 게임을 시작하지 않도록 바꿔야 한다 (TEMP-P3-03).
| `question.started` | S→C | `{ epoch, index, total, text, categoryName, startedAt, endsAt, experiencedNicknames[], selfExperienced }` ★ 정답·힌트·해설 미포함 |
| `question.experiencedUpdated` | S→C | `{ epoch, experiencedNicknames, selfExperienced }` |
| `question.hint` | S→C | `{ epoch, hint \| null }` — 남은 10초 시점에 서버가 push |
| `question.resolved` | S→C | `{ epoch, reason, winnerAccountId, displayAnswer, explanation, scores[], nextAt \| null }` — 마지막 문제면 nextAt=null |

### 일시정지 ★

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `game.resume` | C→S | `{}` (방장) |
| `game.paused` | S→C | `{ pausedFrom, remainingMs, pausedAt, abandonAt }` |
| `game.resumed` | S→C | `{ state, epoch, endsAt \| nextAt \| countdownEndsAt }` ★ 새 종료 시각을 반드시 담는다 |

### 채팅 / 스킵 / 방장

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `chat.send` | C→S | `{ text, epoch }` ★ epoch 필수. **Phase 1에서는 `{ text }` 만** (판정이 없어 epoch가 무의미하다. Phase 3에서 필수가 된다) |
| `chat.message` | S→C | `{ id, seq, accountId, nickname, colorIndex, text, masked, ts }` ★ text/masked는 수신자별로 다를 수 있다 |
| `chat.throttled` | S→C | `{ retryAfterMs }` — **본인에게만** |
| `skip.vote` | C→S | `{ vote: boolean, epoch }` |
| `skip.voteUpdated` | S→C | `{ epoch, votes, threshold, activeCount }` ★ **투표자 명단을 보내지 않는다** |
| `host.forceSkip` | C→S | `{ epoch }` (방장, 확인창 후) |
| `host.forceEnd` | C→S | `{}` (방장, 확인창 후) |
| `host.kickDisconnected` | C→S | `{ accountId }` (방장) |
| `game.again` / `game.toLobby` | C→S | `{}` (방장) |
| `game.result` | S→C | `{ gameId, endReason, ranking[], lastQuestionReveal, abortedNote }` |

### 시각 / 연결 유지

| 이벤트 | 방향 | 페이로드 |
|--------|------|---------|
| `time.ping` | C→S | `{ t0 }` |
| `time.pong` | S→C | `{ t0, tServer }` |
| `heartbeat` | C→S | `{}` |
| `state.resync` | C→S | `{}` → 서버가 `room.state` 응답 |

**Socket.IO 설정**: `pingInterval: 15000`, `pingTimeout: 10000`.
네트워크가 조용히 끊겼을 때 최악 약 25초 안에 감지된다. 기본값(25/20초, 최악 45초)보다 빠르고,
너무 짧게 잡았을 때의 모바일 오탐도 피한다.

**heartbeat의 현재 목적**: 원래 목적(무료 호스팅의 슬립 방지)은 로컬 PC 서버로 바뀌며 사라졌다.
그래도 이벤트를 남겨 둔 이유는 (a) 나중에 클라우드로 옮길 때 다시 필요해지고,
(b) Socket.IO 엔진 레벨 ping과 달리 **애플리케이션 레벨에서 "이 클라이언트가 살아 있다"** 를
확인할 수 있어 Phase 1의 활성 표시에 쓸 수 있기 때문이다.
**DB에 접근하지 않는다.**

---

## 8. 개인별 페이로드 분리

경험자 닉네임이 전원 공개로 바뀌었으므로(규칙 개정), 실제로 수신자마다 값이 달라야 하는 것은
**`chat.message` 의 `text` / `masked` 하나뿐이다.**

`question.started` 의 `selfExperienced` 는 클라이언트가 `experiencedNicknames` 에서
자기 accountId를 찾아 유추할 수도 있지만, **서버가 명시적으로 보낸다.**
클라이언트가 목록을 뒤져 판단하는 로직은 accountId 비교 실수 하나로
"배지가 안 뜨거나 남에게 뜨는" 버그가 되기 때문이다. 비용은 필드 하나다.

`skip.voteUpdated` 의 `selfVoted` 는 **보내지 않는다.** 클라이언트 로컬 상태로 관리하고
재접속 시 스냅샷으로 복구한다. 투표 갱신은 빈번하므로 개별 emit을 피한다.

**메커니즘**: 브로드캐스트 헬퍼 두 종류만 둔다. 무거운 일반화 장치를 만들지 않는다.

- `emitRoom(room, event, payload)` — 방 전체에 동일 페이로드. 대부분이 이것을 쓴다
- `emitRoomPerPlayer(room, event, base, overrideFn)` — `overrideFn(player)` 이 부분 객체를
  반환하면 병합해 개별 emit. **사용처는 세 곳뿐이다.**
  `overrideFn` 은 반드시 동기 함수여야 한다

---

## 9. 재접속 상태 복구 스냅샷 (`room.state`)

**중간 참가 / 재접속 / resync 가 같은 페이로드를 쓴다.** `reason` 필드로 구분한다.
중간 참가자에게 필요한 항목은 재접속자에게 필요한 항목의 부분집합이고,
두 경우의 차이(점수가 0인가, 색상이 새로 배정되는가)는 서버가 스냅샷을 만들 때 이미 값으로 정해진다.

```
{
  reason: 'join' | 'reconnect' | 'resync',
  serverTime, seq,
  me: { accountId, nickname, colorIndex, isHost, connected },
  room: { id, title, hostAccountId, state, maxPlayers,
          settings, settingsLocked, availableQuestionCount },
  players: [{ accountId, nickname, colorIndex, connected, isHost, joinOrder, score }],
  countdown: { endsAt } | null,
  game: { gameId, totalQuestions, questionIndex } | null,   ★ Phase 2에서 추가
  question: {
    epoch, index, total, text, categoryName, startedAt, endsAt,
    hint: string | null,          ★ 남은 시간 10초 이하일 때만 값이 온다. 그 전에는 반드시 null
    experiencedNicknames[], selfExperienced, resolved,
    resolution: { reason, winnerAccountId, displayAnswer, explanation, nextAt } | null
  } | null,
  paused: { pausedFrom, remainingMs, pausedAt, abandonAt } | null,   ★
  skip: { votes, threshold, activeCount, selfVoted } | null,
  chat: [{ id, seq, accountId, nickname, colorIndex, text, masked, ts }],  최근 200개
  result: { gameId, endReason, ranking, lastQuestionReveal, abortedNote } | null,
  experienceRates: [{ accountId, experienced, total }] | null
}
```

### 스냅샷 생성 시 주의

- **힌트는 반드시 남은 시간 조건을 서버가 검사한 뒤에 넣는다.**
  빼먹으면 재접속만으로 힌트를 미리 보는 우회로가 생긴다
- **정답 문자열을 `QUESTION_ACTIVE` 스냅샷에 절대 넣지 않는다**
- **★ 과거 채팅의 마스킹을 재계산하지 않는다.**
  현재 문제의 정답을 기준으로 과거 메시지를 다시 마스킹하면 안 된다.
  마스킹은 브로드캐스트 시점에 확정되므로, `chatBuffer` 에 `{ rawNfc, maskedText | null, senderAccountId }`
  를 함께 저장해 두고 스냅샷은 저장된 값을 그대로 쓴다.
  수신자가 발신자면 `rawNfc`, 아니면 `maskedText ?? rawNfc`
- PAUSED 상태면 `question.endsAt` 대신 `paused.remainingMs` 로 남은 시간을 표시한다

---

## 10. 시퀀스 번호

- 프로세스 전역 단조 증가 카운터. 모든 인바운드 소켓 이벤트 처리 시 가장 먼저 발급
- 자료형은 `number` (Number.MAX_SAFE_INTEGER까지 안전. BigInt는 불필요한 복잡도)
- 프로세스 재시작 시 0부터 시작한다. 재시작하면 진행 중이던 게임 자체가 사라지므로 문제없다.
  **통계와 사후 검증은 `answer_events.response_ms` 로 한다.** seq는 같은 문제 안의 순서 확인용이다

**남기는 위치**

| 위치 | 내용 |
|------|------|
| 로그 | `seq / 시각 / roomId / accountId / event / epoch / 요약`. 정답 관련 이벤트는 판정 결과(eligible / matched / accepted 또는 거부 사유)도 남긴다. **★ 채팅 본문을 로그에 남기지 않는다**(길이와 일치 여부만) |
| DB | `answer_events.submitted_seq` 에만 |
| 클라이언트 | `chat.message` 에 실어 보낸다. 정렬·중복 제거와 재접속 시 이어붙이기에 쓴다 |
