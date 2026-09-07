# 상식 퀴즈 웹게임

친구들끼리 방을 만들고 초대 링크를 공유해 함께 즐기는 **실시간 웹 상식 퀴즈 게임**.

- 최대 10명, 실시간 멀티플레이. PC와 모바일이 같은 방에서 함께 플레이
- **별도의 답안 입력창이 없다. 채팅창에 입력하는 모든 메시지가 답안 제출이다**
- 정답을 가장 먼저 제출한 사람이 1점 (서버 기준 선착순)
- 이미 풀어본 문제는 채팅은 되지만 정답 판정에서 제외된다

**현재 상태: Phase 0 완료.** 게임 로직은 아직 없다.

---

## 처음 온 사람에게

읽는 순서는 이렇다.

1. [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) — 무엇을 만드는가, 어디까지 왔는가
2. **[docs/01-GAME-RULES.md](docs/01-GAME-RULES.md) — 게임 규칙 정본. 가장 중요하다**
3. [docs/05-STATUS.md](docs/05-STATUS.md) — 기능별 구현 상태
4. [docs/06-WORKLOG.md](docs/06-WORKLOG.md) — 최근 작업 (최신이 위)
5. [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) — 구조와 실행 방법

### 문서의 위상

| 위치 | 성격 |
|------|------|
| **`docs/`** | **현재 유효한 규칙과 상태의 정본.** 충돌하면 항상 여기가 우선한다 |
| `guide.md` | 최초 요구사항 원본. 수정하지 않고 보존한다. **이후 개정된 규칙이 있으므로 단독으로 판단하면 안 된다** |
| `ai-out/` | 라운드별 설계 기록 (append-only). 지금은 유효하지 않은 서술이 남아 있다 |

`guide.md` 에서 개정된 규칙 5건은 [docs/01-GAME-RULES.md](docs/01-GAME-RULES.md) 맨 앞에 표로 정리되어 있고,
이유는 [docs/07-DECISIONS.md](docs/07-DECISIONS.md) 에 있다.

---

## 빠른 시작

```bash
npm install
cp .env.example .env      # 값을 채운다. ★ .env 는 절대 커밋하지 않는다
npm run db:up             # Docker로 PostgreSQL
npm run db:migrate
npm run db:seed           # 개발용 시드 문제 53개

npm run dev               # 터미널 A: 서버 (3000)
npm run dev:client        # 터미널 B: 클라이언트 개발 서버 (5173)
```

친구들과 플레이하려면 [docs/11-DEPLOY.md](docs/11-DEPLOY.md) 를 본다.

```bash
npm run build
npm run dev               # 터미널 A
npm run dev:tunnel        # 터미널 B — 출력된 https 주소를 공유
```

### 그 밖의 명령

```bash
npm test                  # Vitest (현재 97건 통과)
npm run typecheck
npm run db:backup         # ★ 로컬 DB이므로 유일한 안전장치
npm run db:restore -- <파일>
npm run db:reset          # ★ 모든 데이터 삭제 후 재적용
```

---

## 구조

```
quiz-web/
├─ docs/          ★ 정본 문서 12개
├─ ai-out/        라운드별 설계 기록 (append-only)
├─ shared/        서버·클라이언트 공유 순수 함수 (정규화 / 힌트 / 순위 / 마스킹)
├─ server/        게임 서버 (Express + Socket.IO)
├─ client/        React + Vite
├─ pipeline/      문제 수집·가공 파이프라인 (Track D, 게임 서버와 분리)
├─ migrations/    순수 SQL 마이그레이션
├─ scripts/       migrate / seed / backup / restore / dev-tunnel
└─ data/          시드 문제와 파이프라인 산출물
```

**인프라**: 건우 PC에서 Node 서버를 돌리고 Cloudflare quick tunnel로 외부에 공개한다.
DB는 로컬 PostgreSQL(Docker). **클라우드 서비스를 쓰지 않는다. 월 비용 $0.**
이유는 [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) 참조.

---

## 개발할 때 지켜야 할 것

작업을 시작하기 전에 [docs/01-GAME-RULES.md](docs/01-GAME-RULES.md) 와
[docs/05-STATUS.md](docs/05-STATUS.md) 를 먼저 확인한다.

특히 다음 두 가지는 **깨져도 에러가 나지 않고 나중에 발견하기 매우 어렵다.**

1. **정답 판정 블록에 `await` 를 넣지 않는다.**
   넣는 순간 "한 문제의 정답자는 정확히 한 명" 이 조용히 무너진다.
   → [docs/04-PROTOCOL.md](docs/04-PROTOCOL.md) 1장
2. **DB를 주기적으로 건드리는 코드를 만들지 않는다.**
   나중에 클라우드로 옮길 때 요금이 20배가 되거나 DB가 멈춘다.
   → [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) 3장

작업을 마치면 [docs/05-STATUS.md](docs/05-STATUS.md) 와
[docs/06-WORKLOG.md](docs/06-WORKLOG.md) 를 같은 커밋에서 갱신한다.

---

## 라이선스

- **코드**: MIT
- **퀴즈 문제 데이터**: CC BY-SA 4.0 — [DATA_LICENSE.md](DATA_LICENSE.md) 참조

문제 출처: [Open Trivia Database](https://opentdb.com/) (CC BY-SA 4.0)
