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
| `account_avatars` | ★ R039 프로필 사진. 계정당 1장 · 256×256 webp(보통 10~40KB) · 200KB 상한 · 계정을 지우면 함께 지워진다 |
| `friendships` · `notifications` | ★ R043 친구 관계(pending · accepted — 두 사람 사이 한 줄) · 알림(친구 신청 · 친구가 됨 · 방 초대). `accounts.must_change_password` = 관리자 비밀번호 초기화 표시 |
| `emojis` | ★ R039 이모티콘 목록. `kind` = `standard`(표준 1,855개 — 그림은 Twemoji 파일) / `custom`(직접 등록 — **그림을 DB 에**). 화면·소켓·설정 저장은 전부 **`id` 번호**로 오간다 |

---

## 3. 자주 쓸 쿼리

### 회원 목록
```sql
SELECT id, login_id, nickname, created_at FROM accounts ORDER BY created_at DESC;
```

### 비밀번호 재설정 — ★ 쿼리가 아니라 스크립트로 (해시를 만들어야 한다)
```bash
npm run reset-password -- 아이디                          # ★ R043 기본: 0000 + "바꿔야 함" 표시 (D-207)
npm run reset-password -- --login-id 아이디 --generate     # 새 비밀번호를 한 번만 출력 (표시 없음)
npm run reset-password -- --login-id 아이디 --password 새비번
```
그 계정의 기존 로그인(세션)은 전부 끊긴다.
★ 기본(아이디만)은 `accounts.must_change_password = true` — 그 사람은 0000 으로 로그인하면 새 비밀번호 화면만 보이고(0000 금지), 정하면 false 가 된다.
표시된 계정 보기: `SELECT login_id, nickname FROM accounts WHERE must_change_password;`

### ★ 친구 · 알림 (R043)
```sql
-- 어떤 사람의 친구·신청
SELECT a.login_id, b.login_id, f.status, f.created_at FROM friendships f
  JOIN accounts a ON a.id = f.requester_id JOIN accounts b ON b.id = f.addressee_id
 WHERE a.login_id = '아이디' OR b.login_id = '아이디';
-- 알림 (받는 사람 기준)
SELECT n.kind, f.login_id AS from_login, n.room_id, n.created_at, n.read_at FROM notifications n
  JOIN accounts f ON f.id = n.from_account_id WHERE n.account_id = (SELECT id FROM accounts WHERE login_id = '아이디')
 ORDER BY n.created_at DESC;
```
친구를 끊어 주려면 friendships 줄을 지우면 된다(친구 화면의 삭제와 같다). 계정을 지우면 둘 다 함께 지워진다(CASCADE).

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

### 프로필 사진 (R039)
```sql
-- 누가 사진을 올렸나
SELECT a.login_id, a.nickname, v.mime, v.bytes, v.updated_at
FROM account_avatars v JOIN accounts a ON a.id = v.account_id ORDER BY v.updated_at DESC;
-- 부적절한 사진 지우기 (그 사람은 글자 아바타로 돌아간다. 본인도 화면 ✏️ → "사진 지우기" 로 지울 수 있다)
DELETE FROM account_avatars WHERE account_id = (SELECT id FROM accounts WHERE login_id = 'someone');
```

### 이모티콘 — 목록 보기 · 숨기기 (R039)
```sql
SELECT id, kind, char, name_ko, category FROM emojis WHERE name_ko LIKE '%하트%' ORDER BY id;
-- 숨기기 (지우지 말고 끈다 — 누군가의 10칸·옛 채팅이 그 번호를 쓰고 있을 수 있다)
UPDATE emojis SET active = false WHERE id = 123;
```
★ 기본 10칸(Alt+1~0)은 코드에 표준 코드로 박혀 있다(`server/src/http/emojiRoutes.ts` 의 `DEFAULT_EMOJI_CODES`). 바꾸려면 MAIN 에게.

### ★ 이모티콘 직접 등록 (캐릭터 그림 등) — 화면은 아직 없다, SQL 로 (R039)
그림 파일을 DB 컨테이너 안으로 복사한 뒤 읽어 넣는다. 형식: **PNG · GIF(움직임 가능) · WebP(움직임 가능) · APNG · SVG**, 1MB 이하 (정사각형 · 128~256px 권장).
```bash
docker compose cp ./my-cat.gif db:/tmp/my-cat.gif
docker compose exec db psql -U <사용자> <DB이름>
```
```sql
INSERT INTO emojis (kind, name_ko, tags, category, sort_order, image, mime)
VALUES ('custom', '고양이 춤', ARRAY['고양이', '춤'], 'custom', 1,
        pg_read_binary_file('/tmp/my-cat.gif'), 'image/gif')
RETURNING id;
```
- `kind='custom'` · `category='custom'` 은 꼭 이대로 — 고르기 창 맨 앞 **⭐ 직접 등록** 분류에 모이고, 누구나 자기 10칸에 넣을 수 있다.
- `code` 는 비워 둔다(표준 전용). 그림은 `/api/emoji/<id>/image` 로 나간다.
- ★ 반영: 서버를 끄지 않아도 된다 — 서버가 목록을 30초마다(다음 요청 때) 다시 읽는다. 이미 열린 화면은 **새로고침** 뒤에 보인다.
- 지우기 대신 `UPDATE emojis SET active = false WHERE id = …` (숨기기).
- `pg_read_binary_file` 은 DB 관리자 사용자만 쓸 수 있다 — docker compose 의 `POSTGRES_USER` 가 그 사용자다. DBeaver 에서는 `image` 칸에 파일을 직접 불러 넣어도 된다.

---

### ★ 특별 이모티콘 테마 — 가져오기 · 이름 · 가격 (R048)
원본 그림은 `assets/emoji/<테마 key>/` (git 에는 없다 — DB 가 정본). 가져오기는 스크립트로(sharp 로 ≤256px · ≤1MB 로 줄여 넣는다 · 같은 파일명은 건너뜀):
```bash
npm run db:backup
node scripts/emoji-import.mjs --theme chiikawa --name 치이카와 --price 20    # 새 테마면 만든다 · 있으면 이름·가격 그대로
```
```sql
SELECT id, key, name_ko, price, active FROM emoji_themes;                                   -- 테마 목록
UPDATE emoji_themes SET price = 30 WHERE key = 'chiikawa';                                   -- 뽑기 가격(포인트)
UPDATE emoji_themes SET name_ko = '치이카와 친구들' WHERE key = 'chiikawa';                 -- 테마 이름
SELECT id, name_ko, source_name, octet_length(image) bytes FROM emojis WHERE theme_id = 1 ORDER BY sort_order;  -- 그 테마의 이모티콘
UPDATE emojis SET name_ko = '하치와레 웃음' WHERE theme_id = 1 AND source_name = 'Hachiware_1.gif';           -- 이모티콘 이름 바꾸기
UPDATE emoji_themes SET active = false WHERE key = 'chiikawa';                               -- 테마 숨기기 (뽑기 목록에서)
SELECT a.login_id, e.name_ko, ae.obtained_at FROM account_emojis ae JOIN accounts a ON a.id = ae.account_id JOIN emojis e ON e.id = ae.emoji_id;  -- 누가 무엇을 가졌나
```
- 특별 이모티콘은 **가진 사람만** 보고 보낼 수 있다(뽑기 — R049). 누구에게 바로 주려면 `INSERT INTO account_emojis (account_id, emoji_id) VALUES (…, …)`.
- 포인트: `SELECT count(*) FROM answer_events WHERE account_id = … AND accepted` − `SELECT coalesce(sum(amount),0) FROM point_spends WHERE account_id = …`.

### ★ 뽑기 기록 보기 · 되돌리기 (R049)
```sql
-- 누가 언제 무엇을 뽑았나 (최근 50)
SELECT p.id, a.login_id, p.amount, p.ref, p.created_at FROM point_spends p JOIN accounts a ON a.id = p.account_id WHERE p.reason = 'gacha' ORDER BY p.id DESC LIMIT 50;
-- 계정별 잔액 한눈에 (맞힘 + 미니게임 보상 + 지급(R059) − 쓴 것)
SELECT a.login_id,
       (SELECT count(*) FROM answer_events e WHERE e.account_id = a.id AND e.accepted) AS earned,
       (SELECT coalesce(sum(amount),0) FROM minigame_rewards w WHERE w.account_id = a.id) AS rewards,
       (SELECT coalesce(sum(amount),0) FROM point_grants g WHERE g.account_id = a.id) AS grants,
       (SELECT coalesce(sum(amount),0) FROM point_spends p WHERE p.account_id = a.id) AS spent,
       (SELECT count(*) FROM account_emojis ae WHERE ae.account_id = a.id) AS owned_special
  FROM accounts a ORDER BY earned DESC;
-- ★ 뽑기 하나 되돌리기 (포인트 돌려주고 이모티콘 회수) — ref 'theme:chiikawa/emoji:1860' 꼴. 두 문장을 한 트랜잭션으로
BEGIN;
DELETE FROM account_emojis WHERE account_id = (SELECT account_id FROM point_spends WHERE id = 123) AND emoji_id = split_part((SELECT ref FROM point_spends WHERE id = 123), 'emoji:', 2)::int;
DELETE FROM point_spends WHERE id = 123;
COMMIT;
-- 검사 계정(봇)의 뽑기 전부 비우기 (bot_01 등 — 찬종 계정은 건드리지 않는다)
DELETE FROM account_emojis WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%');
DELETE FROM point_spends WHERE reason = 'gacha' AND account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%');
```
- 뽑기 값은 `emoji_themes.price`(서버 재시작 없이 다음 뽑기부터 — 서버가 테마를 메모리에 두므로 **재시작이 필요하다** · 확인: `GET /api/shop` 의 price). 검사용 `SHOP_PRICE_OVERRIDE` 는 실제 서버에 두지 않는다.

### ★ 미니게임 기록 보기 · 보상 되돌리기 (R050)
```sql
-- 최근 미니게임 판 (연습 포함)
SELECT id, game_id, minigame_key, practice, after_question_index, started_at, ended_at, end_reason FROM minigame_runs ORDER BY id DESC LIMIT 30;
-- 한 판의 참가자 · 최종 순위 · 보상 · 기기
SELECT a.login_id, p.device, p.final_rank, p.total_points, p.reward FROM minigame_players p JOIN accounts a ON a.id = p.account_id WHERE p.run_id = 123 ORDER BY p.final_rank;
-- 한 판의 라운드별 결과 (입력 원값 · 값 · 오차 · 순위)
SELECT r.round_index, a.login_id, r.submitted, r.input, r.value, r.error, r.elapsed_ms, r.rank, r.points FROM minigame_results r JOIN accounts a ON a.id = r.account_id WHERE r.run_id = 123 ORDER BY r.round_index, r.rank;
-- 계정별 미니게임 보상 합 (포인트에 들어간다)
SELECT a.login_id, sum(w.amount) FROM minigame_rewards w JOIN accounts a ON a.id = w.account_id GROUP BY a.login_id ORDER BY 2 DESC;
-- ★ 보상 되돌리기 (한 판 · 한 계정) — 포인트에서 빠진다. 그 게임의 판 점수(game_players.final_score)는 따로 고치지 않는다(기록)
DELETE FROM minigame_rewards WHERE run_id = 123 AND account_id = (SELECT id FROM accounts WHERE login_id = '…');
-- 검사 계정(봇 · uic) 의 미니게임 보상 비우기 (찬종 계정은 건드리지 않는다)
DELETE FROM minigame_rewards WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%');
```
- 포인트 = 맞힌 수 + `minigame_rewards` 합 − `point_spends` 합 (server/src/db/points.ts `POINTS_SQL`).

### ★★ 업적 · 전적 (R054)
```bash
node scripts/achievements-backfill.mjs --login lonysg      # dry-run — 키별 얻은 계정 · 새로 · 한 계정 목록
npm run db:backup && node scripts/achievements-backfill.mjs --apply   # 소급(멱등 — 다시 돌려도 0)
```
```sql
-- 한 계정의 업적
SELECT key, earned_at, value, backfilled FROM achievements WHERE account_id = (SELECT id FROM accounts WHERE login_id = 'lonysg') ORDER BY earned_at;
-- 키별 얻은 사람 수
SELECT key, count(*) FROM achievements GROUP BY key ORDER BY 2 DESC;
-- ★ 업적 지우기(잘못 준 것) — 다음 판정 때 조건을 만족하면 다시 생긴다(기록이 그대로이므로)
DELETE FROM achievements WHERE account_id = (SELECT id FROM accounts WHERE login_id = '…') AND key = 'streak-3';
-- 검사 계정 업적 비우기(봇 achievements 는 스스로 비우고 시작) — 찬종 계정은 건드리지 않는다
DELETE FROM achievements WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%' OR login_id LIKE 'uic%');
```

### ★★★ 문제 평가(설문) (R056)
```bash
npm run feedback:report                          # 전부 — 👎 많은 문제 50 · 사유별 합계 · 의견 → tmp/feedback-report.md
npm run feedback:report -- --since 2026-10-21 --no-bots   # 그날부터 · 봇/검사 계정(bot_* · uic* · r10_*) 빼고
```
```sql
-- 👎 많은 문제 (사유 펼침)
SELECT f.question_id, count(*) FILTER (WHERE vote = -1) AS down, count(*) FILTER (WHERE vote = 1) AS up,
       left(q.question_text, 50) AS q, q.display_answer
  FROM question_feedback f JOIN questions q ON q.id = f.question_id
 GROUP BY f.question_id, q.question_text, q.display_answer ORDER BY down DESC LIMIT 30;
-- 사유별 합계
SELECT r AS reason, count(*) FROM question_feedback, unnest(reasons) r GROUP BY r ORDER BY 2 DESC;
-- 의견(닉네임 · 시각)
SELECT f.question_id, a.nickname, f.updated_at, f.comment FROM question_feedback f JOIN accounts a ON a.id = f.account_id
 WHERE f.comment IS NOT NULL ORDER BY f.updated_at DESC;
-- 검사 계정 평가 비우기(봇 feedback 은 스스로 비우고 시작) — 찬종 · 친구 평가는 건드리지 않는다
DELETE FROM question_feedback WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%' OR login_id LIKE 'uic%');
```

### ★★ 근접 오답 (R058 · near_misses · 90일)
보고서는 `npm run answers:near`(tmp/answer-near-report.md). 직접 볼 때:
```sql
-- 문항별 — 사람 수 많은 순 (같은 글을 여러 사람이 쳤으면 변형 누락 후보)
SELECT n.question_id, count(*) AS rows, count(DISTINCT n.account_id) AS people,
       left(q.question_text, 50) AS q, q.display_answer
  FROM near_misses n JOIN questions q ON q.id = n.question_id
 GROUP BY n.question_id, q.question_text, q.display_answer ORDER BY people DESC, rows DESC LIMIT 30;
-- 한 문항의 글 · 가까운 정답 · 거리
SELECT normalized, nearest, distance, kind, count(*) FROM near_misses WHERE question_id = 문항번호
 GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC;
-- 90일 지난 것 바로 지우기(서버 부팅 때도 지운다)
DELETE FROM near_misses WHERE created_at < now() - interval '90 days';
```

### ★★★ 퀴즈류 미니게임 항목 · 그림 · 경험 (R052)
```bash
node scripts/minigame-load.mjs             # dry-run — 게임별 verified · 형식 거부 · 그림 없음 표 (DB 를 쓰지 않는다)
npm run db:backup && node scripts/minigame-load.mjs --apply   # 적재(verified 만 · 같은 id 갱신 · 그림 bytea)
```
```sql
-- 게임별 활성 문항 · 그림 용량
SELECT game, count(*) FILTER (WHERE active) active, count(*) total FROM minigame_items GROUP BY game ORDER BY game;
SELECT count(*), pg_size_pretty(sum(bytes)) FROM minigame_images;
-- 한 문항 보기 (payload = 파일 항목 그대로)
SELECT item_id, game, payload, image_ids, attribution FROM minigame_items WHERE item_id = 'price-0001';
-- ★ 문항 쉬게 하기 / 되살리기 (지우지 않는다 — 다음 적재가 파일 기준으로 다시 정한다)
UPDATE minigame_items SET active = false WHERE item_id = 'price-0001';
UPDATE minigame_items SET active = true  WHERE item_id = 'price-0001';
-- 그림 교체 — 파일(assets/minigame/…)을 바꾸고 다시 적재하는 것이 정석. 급하면 그림 행만 지우면 그 그림은 404(화면은 빈 칸)
DELETE FROM minigame_images WHERE image_id = 'price-0001';
-- 경험 보기 (계정 · 게임별)
SELECT a.login_id, e.minigame_key, count(*) FROM minigame_item_experiences e JOIN accounts a ON a.id = e.account_id GROUP BY 1, 2 ORDER BY 1, 2;
-- ★ 경험 지우기 — 검사 계정만(봇 mgquiz 는 시작할 때 봇 계정 것을 스스로 비운다). 찬종 계정은 건드리지 않는다
DELETE FROM minigame_item_experiences WHERE account_id IN (SELECT id FROM accounts WHERE login_id LIKE 'bot\_%' OR login_id LIKE 'uic%');
```
- 문항 · 그림은 DB 가 정본이 됐다(파일은 찬종 PC · git 밖 그림) — `npm run db:backup` 에 들어간다.
- 기록은 지우지 않는 것이 원칙이다(docs/17 3절) — 위 DELETE 는 잘못 지급된 보상을 바로잡을 때만.

### ★★★ 보너스 포인트 — 제보 채택 · 수동 지급 (R059 · D-254)
★ **가짜 미니게임 판으로 지급하지 않는다**(0023 이 옮겼다). 지급은 명령 둘로만 — `--yes` 없으면 할 일만 찍고 멈춘다.
```bash
npm run feedback:report -- --no-bots          # 👎 설문 하나하나(f#) · 채택 표시 · 사람별 합계(월별)
npm run db:backup
npm run feedback:adopt -- --id 210 --yes                                   # 설문 f#210 채택 · 5P
npm run points:grant -- --login yuja0218 --points 30 --reason feedback_monthly_top --note "2026-10 최다" --yes
npm run points:grant -- --login 123qwe --points 50 --reason admin --note "이벤트" --yes
```
```sql
-- 지급 보기
SELECT g.id, a.login_id, g.amount, g.reason, g.ref_id, g.note, g.created_at, g.seen_at FROM point_grants g JOIN accounts a ON a.id = g.account_id ORDER BY g.id DESC LIMIT 50;
-- 잘못 준 것 되돌리기(채택이면 설문 표시도 같이) — 한 트랜잭션
BEGIN;
UPDATE question_feedback SET adopted_at = NULL, adopted_grant_id = NULL WHERE adopted_grant_id = 123;
DELETE FROM point_grants WHERE id = 123;
COMMIT;
```

### ★★★ 검사 DB quizweb_test (R060 · D-253)
- 검사(ui-check · bot · smoke)는 **quizweb_test 만** 쓴다 — 실 DB 로는 검사 서버가 뜨지 않는다(QUIZ_TEST_SERVER 빗장).
- 만들기: `npm run db:test-init`(없으면 만들고 지금 quizweb 를 통째 복사 → migrate · 있으면 migrate 만) · 새로: `-- --refresh` · 백업에서: `-- --refresh --from backups/quizweb-….dump`.
- 실 DB 가 바뀐 뒤(문항 적재 · 마이그레이션) 검사에 새 데이터가 필요하면 `--refresh`. 검사 DB 는 마음대로 지워도 된다.
```sql
-- 검사 DB 에 붙기
docker exec -it quiz-web-db psql -U quiz -d quizweb_test
-- 통째 지우기(다시 만들려면 npm run db:test-init)
docker exec quiz-web-db dropdb -U quiz --force quizweb_test
```

## 4. 서버가 켜진 상태에서 바꾸면 — 언제 반영되나

| 바꾼 것 | 바로 반영 | 반영 안 되는 곳 |
|--------|----------|----------------|
| 비밀번호 재설정 | 다음 로그인부터. 기존 로그인은 스크립트가 끊는다 | — |
| 닉네임 (SQL 로) | 새로 접속·입장할 때 | ★ 지금 방 안에 있는 사람의 화면 이름은 그 사람이 다시 들어올 때까지 옛 이름. (화면의 "내 닉네임" 으로 바꾸면 즉시) |
| 문제 내리기·되살리기 | 로비의 **출제 가능 수**(다음 갱신 — 입장·퇴장·설정 변경) · **다음 게임** | ★ **진행 중인 게임**은 시작할 때 문제를 메모리에 올려 두므로 그 판에는 아직 나올 수 있다 |
| 분야 묶음 | 위와 같다 (다음 로비 갱신·다음 게임) | 진행 중인 게임 |
| 경험 기록 지우기·넣기 | 로비 경험률·출제 가능 수(다음 갱신) · 다음 게임 | 진행 중인 게임 |
| 계정 설정(`prefs`) | 그 사람이 다음에 로그인(새로고침)할 때 | — |
| 프로필 사진 지우기 (SQL 로) | 새로 접속·입장할 때 | 지금 방 안의 화면은 그 사람이 다시 들어올 때까지 옛 사진(브라우저 캐시) |
| 이모티콘 등록·숨기기 | 서버 목록은 30초 안에 · 화면은 새로고침 뒤 | 이미 열린 화면의 고르기 창 |
| DB 구조(`db:migrate`) | — | ★ 서버를 껐다 켜는 것이 안전하다 |
