# DB 관리 — 핵심만 (건우용)

> PostgreSQL 업무 사용자 기준으로 **이 프로젝트에만 있는 것**만 적었다. (R034)
> ★ **고치기 전에 백업**: `npm run db:backup` → `backups/quizweb-날짜.dump` (되돌리기: `npm run db:restore`)
> ★ 문제 데이터 자체(적재·재채점·힌트 내용)는 GEN 세션의 일이다. 여기 쿼리는 **운영 중 급한 손질**용이다.

---

## 1. 접속

| 항목 | 값 |
|------|-----|
| 호스트 · 포트 | `localhost` · **5434** (docker compose. 5432/5433 은 다른 프로젝트가 쓴다) |
| DB 이름 · 사용자 | `docker-compose.yml` 의 `POSTGRES_DB` · `POSTGRES_USER` |
| 비밀번호 | **`.env` 의 `DATABASE_URL` 참고** |
| 켜기 / 끄기 | `npm run db:up` / `npm run db:down` |
| DB 구조 변경 적용 | `npm run db:migrate` (이미 적용된 것은 건너뛴다) |

psql 로 들어가려면: `docker compose exec db psql -U <사용자> <DB이름>` (서비스 이름 `db`)
DBeaver 등 도구로 붙어도 된다 — 위 호스트·포트로.

---

## 2. 주요 테이블과 관계 (한 장)

```
accounts ─┬─< sessions                       로그인 세션 (토큰 해시만)
 (회원)   ├─< question_experiences >─┐        ★ 계정 × 문제 "이미 풀어 봄" — 영구 자산
          ├─< game_players >── games ─< game_questions >── questions
          └─< answer_events (정답과 일치한 메시지만)       │
                                                           ├─< question_answers   정답 표기들 (판정은 여기로만)
rooms ─< games                                             └── categories ── 대·중·소분류 트리
                                                                  │   └ game_topic → game_topics (분야 묶음 7개)
                                                                  └ 뷰 category_game_topics (문제 → 분야 묶음)
```

| 테이블 | 한 줄 |
|--------|------|
| `accounts` | 회원. `login_id`(소문자) · `nickname`(유일, 대소문자 구분) · `password_hash` · `prefs`(화면·소리 설정 jsonb) |
| `questions` | 문제. **출제 대상 = `status='approved' AND is_active AND question_type='short_answer'`**. `inactive_reason` 에 내린 이유 |
| `question_answers` | 문제별 정답 표기(여러 개). `answer_norm` 이 판정용 |
| `question_experiences` | 누가 어떤 문제를 이미 봤나. **계정 id 에 붙는다** (닉네임을 바꿔도 그대로) |
| `games` / `game_players` / `game_questions` | 판 기록 · 참가자 최종 점수·순위 · 문제별 결말 |
| `categories` · `game_topics` | 통계용 분류 트리 · 게임 출제용 분야 묶음 |

---

## 3. 자주 쓸 쿼리

### 회원 목록
```sql
SELECT id, login_id, nickname, created_at FROM accounts ORDER BY created_at DESC;
```

### 비밀번호 재설정 — ★ 쿼리가 아니라 스크립트로 (해시를 만들어야 한다)
```bash
npm run reset-password -- --login-id 아이디 --generate     # 새 비밀번호를 한 번만 출력
npm run reset-password -- --login-id 아이디 --password 새비번
```
그 계정의 기존 로그인(세션)은 전부 끊긴다.

### 닉네임 바꾸기
★ 되도록 **게임 화면의 로비 "내 닉네임"** 으로 바꾼다 — 방 안에 바로 알리고 겹침도 막는다.
급할 때 SQL 로:
```sql
UPDATE accounts SET nickname = '새닉네임', updated_at = now() WHERE login_id = '아이디';
-- 겹치면 UNIQUE 위반으로 실패한다 (accounts_nickname_key). 대소문자는 다른 이름으로 친다.
```

### 문제 검색
```sql
SELECT q.id, q.question_text, q.display_answer, q.difficulty_score, q.is_active, t.game_topic
  FROM questions q JOIN category_game_topics t ON t.category_id = q.category_id
 WHERE q.question_text ILIKE '%세종%' OR q.display_answer ILIKE '%세종%'
 ORDER BY q.id;
```

### 문제 내리기 / 되살리기
```sql
-- 내리기 (지우지 않는다 — 경험 기록·판 기록이 이 문제를 가리킨다)
UPDATE questions SET is_active = false, inactive_reason = '건우: 정답 오류 (2026-10-05)', updated_at = now()
 WHERE id = 1234;
-- 되살리기
UPDATE questions SET is_active = true, inactive_reason = NULL, updated_at = now() WHERE id = 1234;
-- 지금 내려가 있는 문제
SELECT id, question_text, inactive_reason FROM questions WHERE NOT is_active ORDER BY updated_at DESC;
```

### 경험 기록 보기
```sql
-- 사람별 "이미 푼 문제" 수 (활성 문제만 — 화면의 경험률과 같은 기준)
SELECT a.login_id, a.nickname, count(q.id) AS 경험
  FROM accounts a
  LEFT JOIN question_experiences e ON e.account_id = a.id
  LEFT JOIN questions q ON q.id = e.question_id AND q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer'
 GROUP BY a.id ORDER BY 경험 DESC;
-- 한 사람이 최근 본 문제
SELECT e.first_experienced_at, q.question_text, q.display_answer
  FROM question_experiences e JOIN questions q ON q.id = e.question_id
  JOIN accounts a ON a.id = e.account_id
 WHERE a.login_id = '아이디' ORDER BY e.first_experienced_at DESC LIMIT 20;
```
★ 경험 기록을 지우면 그 사람에게 그 문제가 다시 나온다. 지우기 전에 백업.

### 분야 묶음 보기 / 바꾸기
```sql
-- 분야별 출제 가능 문제 수
SELECT t.game_topic, count(*) FROM questions q JOIN category_game_topics t ON t.category_id = q.category_id
 WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer' GROUP BY 1 ORDER BY 1;
-- 중분류 목록과 지금 묶음 (비어 있으면 대분류 기본값을 따른다)
SELECT c.key, c.name_ko, c.game_topic, p.name_ko AS 대분류, p.game_topic AS 대분류_기본
  FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.level = 2 ORDER BY p.sort_order, c.sort_order;
-- 중분류 하나를 다른 묶음으로 (예: 보드게임을 스포츠로)
UPDATE categories SET game_topic = 'sports' WHERE key = 'L2:board-game';
-- 묶음 없는 활성 문제 (0이어야 한다 — smoke 도 확인한다)
SELECT count(*) FROM questions q LEFT JOIN category_game_topics t ON t.category_id = q.category_id
 WHERE q.status = 'approved' AND q.is_active AND q.question_type = 'short_answer' AND t.game_topic IS NULL;
```
묶음 키: `korea` 한국 · `history` 역사·사회 · `science` 과학·기술 · `arts` 문화·예술 · `sports` 스포츠 · `life` 생활 · `media` 미디어·콘텐츠.
★ 묶음을 새로 **추가**하는 것은 코드(`shared/src/settings.ts` 의 `GAME_TOPICS`)도 같이 바꿔야 한다 — MAIN 에게.

---

## 4. 서버가 켜진 상태에서 바꾸면 — 언제 반영되나

| 바꾼 것 | 바로 반영 | 반영 안 되는 곳 |
|--------|----------|----------------|
| 비밀번호 재설정 | 다음 로그인부터. 기존 로그인은 스크립트가 끊는다 | — |
| 닉네임 (SQL 로) | 새로 접속·입장할 때 | ★ 지금 방 안에 있는 사람의 화면 이름은 그 사람이 다시 들어올 때까지 옛 이름. (화면의 "내 닉네임" 으로 바꾸면 즉시) |
| 문제 내리기·되살리기 | 로비의 **출제 가능 수**(다음 갱신 — 입장·퇴장·설정 변경) · **다음 게임** | ★ **진행 중인 게임**은 시작할 때 문제를 메모리에 올려 두므로 그 판에는 아직 나올 수 있다 |
| 분야 묶음 | 위와 같다 (다음 로비 갱신·다음 게임) | 진행 중인 게임 |
| 경험 기록 지우기·넣기 | 로비 경험률·출제 가능 수(다음 갱신) · 다음 게임 | 진행 중인 게임 |
| 계정 설정(`prefs`) | 그 사람이 다음에 로그인(새로고침)할 때 | — |
| DB 구조(`db:migrate`) | — | ★ 서버를 껐다 켜는 것이 안전하다 |
