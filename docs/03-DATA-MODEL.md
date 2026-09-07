# 데이터 모델

스키마 정본은 `migrations/0001_init.sql` 이다. **SQL 파일의 주석이 이 문서와 같은 내용을 담고 있다.**
이 문서는 테이블 간 관계와 "왜 이렇게 설계했는가" 를 설명한다.

---

## 1. 소유 관계 (단방향)

```
  게임 서버  ──읽고 쓴다──▶  accounts  sessions  rooms  games  game_players
                             game_questions  question_experiences  answer_events

  게임 서버  ──읽기만────▶  questions  question_answers  categories
                                  ▲
  파이프라인 ──쓴다────────────────┘
  (Track D)  ──쓴다──▶  sources  question_raw  review_queue
```

**게임 서버와 파이프라인은 코드가 분리되어 있고 유일한 접점은 이 스키마다.**
파이프라인이 게임 서버를 호출하거나 그 반대의 일은 없다.

---

## 2. 테이블 목록

### 문제 도메인

| 테이블 | 역할 |
|--------|------|
| `sources` | 출처와 라이선스. 문제별 라이선스 추적의 근거 |
| `categories` | 카테고리. 문자열이 아니라 테이블인 이유는 아래 참조 |
| `question_raw` | 소스 원본 보관. 가공 규칙이 바뀌면 여기서 다시 돌린다 |
| `questions` | 문제 본체 |
| `question_answers` | 복수 정답 표기. 판정은 오직 이 테이블로 한다 |
| `review_queue` | 검수 상태 (파이프라인 전용) |

### 게임 도메인

| 테이블 | 역할 |
|--------|------|
| `accounts` | 계정 |
| `sessions` | 세션 (토큰 해시만 저장) |
| `rooms` | 방 레코드 (참가자 목록은 메모리에만) |
| `games` | 게임 단위 기록 |
| `game_players` | 게임 참가와 최종 점수·순위 |
| `game_questions` | 게임에서 출제된 문제와 그 결말 |
| `question_experiences` | **계정 × 문제. 영구 보존 자산** |
| `answer_events` | 정답 문자열과 일치한 메시지. 통계 원천 |

---

## 3. 주요 설계 판단

### `question_answers` 를 배열 컬럼이 아니라 별도 테이블로

1. `UNIQUE (question_id, answer_norm)` 로 **"정규화하면 같아지는 중복 변형"을 DB가 막아준다.**
   `New York` 과 `newyork` 을 둘 다 넣으려 하면 삽입이 거부된다
2. 표기 변형 추가·삭제가 이 프로젝트에서 자주 일어나는 작업이라 행 단위 관리가 낫다
3. `note` 로 검수 맥락을 남길 수 있다

조인이 하나 늘지만 문제 로딩은 게임 시작 시 한 번뿐이고 판정은 메모리에서 하므로 성능 영향이 없다.

### `display_answer` 와 `question_answers` 의 관계

- `display_answer` 는 **화면 표시 전용**이다. 판정에 쓰지 않는다
- 판정은 오직 `question_answers.answer_norm` 집합과의 비교로만 한다
- `display_answer` 에 해당하는 행이 `question_answers` 에 반드시 있어야 한다 (`is_primary=true`)

**분리하는 이유**: 대표 표기는 "보기 좋은 형태"(`빈센트 반 고흐`)여야 하고,
판정 집합은 "실제로 칠 법한 모든 형태"(`반 고흐` / `고흐` / `반고흐` / `van gogh`)여야 해서
목적이 다르다. 하나로 합치면 둘 중 하나가 반드시 나빠진다.

### `answer_norm` 은 미리 계산해 저장한다

`shared/normalizeAnswer()` 의 결과를 저장한다.
**★ 서버의 정답 판정과 파이프라인의 저장이 반드시 같은 함수를 써야 한다.**
다르면 DB에 저장된 정규화 값과 런타임 판정이 어긋나 정답이 조용히 오답 처리된다.

`NORMALIZE_VERSION` 이 바뀌면 이 컬럼 전체를 재계산해야 한다.

### `status` 와 `is_active` 를 분리

- `status` — 승인 여부 (`pending_review` / `approved` / `rejected`)
- `is_active` — 현재 서비스 노출 여부

승인된 문제라도 품질 문제가 발견되면 빼야 하는데, `status` 를 `rejected` 로 되돌리면
검수 이력이 오염된다. **"승인 여부"와 "현재 노출 여부"는 다른 축이다.**

### `categories` 를 테이블로

guide 40절이 카테고리별 성적 통계를 요구하고 52절이 카테고리 선택·제외를 확장 후보로 든다.
문자열로 박아두면 이름을 바꿀 때 과거 통계가 깨진다.
**소급 입력이 매우 비싸므로 처음부터 넣었다.**

### `game_players.final_score` 를 게임 진행 중에 UPDATE하지 않는다

점수는 `answer_events` 로부터 완전히 계산할 수 있다. 문제마다 UPDATE하면
같은 정보를 두 번 쓰는 것이 된다. 게임 종료 시 한 번 확정 값을 넣는다(의도적 비정규화).

부수 효과로 **프로세스가 죽어도 `answer_events` 로 점수를 재구성할 수 있다.**

### `question_experiences` 는 `ON CONFLICT DO NOTHING` 으로 삽입

경험자도 그 문제를 다시 보게 되므로(판정에서만 제외된다) 덮어쓰면
**"처음 경험한 시점"이 손실된다.**

### `answer_events` 는 "정답 문자열과 일치한 메시지" 만 저장

일반 오답 채팅은 저장하지 않는다. guide 54절의 "미친 듯이 입력하는" 특성상 양이 매우 많고,
채팅 로그는 DB에 저장하지 않기로 확정했다.

`matched` / `was_eligible` / `accepted` / `reject_reason` 을 함께 남겨
**"왜 정답이 안 됐는지"** 까지 추적할 수 있게 한다. guide 18절의 순서 추적과
동시 정답 사후 검증에 쓴다.

---

## 4. DB가 강제하는 게임 규칙

애플리케이션 버그를 DB가 막아 준다.

| 제약 | 강제하는 규칙 |
|------|--------------|
| `accounts.nickname UNIQUE` | 닉네임 전역 유일 + 대소문자 구분 (PostgreSQL `text` 는 기본이 대소문자 구분) |
| `accounts.login_id UNIQUE` | 아이디 유일 (소문자 정규화 저장) |
| `rooms` 부분 UNIQUE `(created_by) WHERE closed_at IS NULL` | 1인당 동시 보유 방 1개 |
| `game_questions UNIQUE (game_id, question_id)` | 한 게임 안에서 같은 문제 중복 출제 금지 |
| `question_experiences PK (account_id, question_id)` | 경험 중복 기록 방지 |
| `question_answers UNIQUE (question_id, answer_norm)` | 정규화 중복 변형 차단 |
| `questions` 부분 UNIQUE `(source_id, source_ref)` | 같은 소스의 같은 문제 중복 적재 방지 |

> `rooms` 의 부분 UNIQUE는 **부팅 시 정리 절차와 세트로만 안전하다.**
> [02-ARCHITECTURE.md](02-ARCHITECTURE.md) 2장 참조.

---

## 5. guide 40절 통계 역검증

향후 통계 후보 9종이 이 스키마로 전부 계산 가능한지 확인했다.

| # | 지표 | 계산 방법 | 가능 |
|---|------|----------|------|
| 1 | 플레이한 문제 수 | `game_questions` ⋈ `game_players`, `gq.started_at >= gp.joined_at` (중간 참가 반영) | O |
| 2 | 정답 수 | `game_questions.winner_account_id` 카운트 | O |
| 3 | 정답률 | 2 / 1 | O |
| 4 | 문제별 정답 여부 | `game_questions` | O |
| 5 | 문제별 응답 시간 | `answer_events.response_ms` | **부분** |
| 6 | 카테고리별 성적 | `game_questions` ⋈ `questions.category_id` ⋈ `categories` | O |
| 7 | 게임별 점수 | `game_players.final_score` 또는 `answer_events` 집계 | O |
| 8 | 게임 참가 기록 | `game_players` ⋈ `games` | O |
| 9 | 문제 경험 기록 | `question_experiences` | O |

**5번의 제약**: 정답 문자열을 친 사람의 응답 시간만 남는다. 오답을 친 사람의 반응 시간은 남지 않는다.
guide 40절의 예시가 "평균 정답 시간 3.1초" 이므로 요구는 충족한다.
더 넓은 범위가 필요해지면 "문제별 첫 메시지 시각" 테이블을 추가하면 된다(컬럼 변경 없이 가능).

**교차 검증 항목**: `game_questions.winner_account_id` 로 센 정답 수와
`answer_events.accepted = true` 로 센 정답 수가 **일치해야 한다.**
불일치는 판정 로직 버그의 신호다. [10-TESTING.md](10-TESTING.md) 에 테스트로 등록한다.

---

## 6. 쓰기 빈도

30문제 게임 한 판 기준.

| 테이블 | 쓰기 시점 | 횟수 |
|--------|----------|------|
| `accounts` | 가입 / 변경 | 0 |
| `sessions` | 로그인 / 15일마다 | 0 |
| `rooms` | 방 생성 / 삭제 | 0~2 |
| `games` | 시작 / 종료 | 2 |
| `game_players` | 참가 / 종료 확정 | 20 |
| `game_questions` | 문제 시작 / 해결 | 60 |
| `question_experiences` | 정답 공개 시 배치 INSERT | 30회 (최대 300행) |
| `answer_events` | 정답 문자열 일치 시 | 30~90 |
| **합계** | | **약 150~200회** (약 18분에 걸쳐) |

초당 0.2회 수준이다. 중요한 것은 횟수가 아니라 **"DB를 깨워 두는 시간"** 이다.
[02-ARCHITECTURE.md](02-ARCHITECTURE.md) 3장의 DB 접근 규칙 참조.

---

## 7. 문제 선정 쿼리 지침

경험 기반 문제 선정은 "참가자 전원이 미경험인 문제" 를 찾아야 한다.

**게임 시작 시 참가자별 경험 문제 ID 집합을 한 번에 조회해 메모리로 올리고,
선정은 메모리에서 수행한다.**

```sql
SELECT account_id, question_id FROM question_experiences
 WHERE account_id = ANY($1)
```

이러면 매 문제마다 DB를 다시 조회하지 않고, "판정 데이터를 메모리에 미리 로드한다"는
동시성 설계 원칙과도 일관된다. 중간 참가자가 생기면 그 사람의 집합만 추가 조회한다.

---

## 8. 마이그레이션

```bash
npm run db:migrate          # 적용되지 않은 것을 순서대로 적용
npm run db:migrate -- --dry # 적용 대상만 출력
npm run db:reset            # ★ 전부 삭제 후 재적용 (개발용)
```

- 파일명 순서가 곧 적용 순서다 (`0001_`, `0002_`, ...)
- **마이그레이션 하나가 한 트랜잭션이다.** 중간에 실패하면 전부 롤백된다
- 적용 이력은 `schema_migrations` 테이블에 남는다
- **한 번 커밋된 마이그레이션 파일은 수정하지 않는다.** 새 파일을 추가한다

## 9. 백업

```bash
npm run db:backup                 # backups/quizweb-YYYYMMDD-HHmmss.dump
npm run db:restore -- <파일>
```

DB가 로컬에만 있으므로 **이것이 유일한 안전장치다.**
특히 `question_experiences` 는 한 번 잃으면 복구할 방법이 없다.
`pg_dump` 는 컨테이너 안에서 실행한다(호스트의 클라이언트 버전이 낮을 수 있다).
