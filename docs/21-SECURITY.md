# 보안 — 막은 것 · 한도 값 · 일부러 안 막은 것

> 신설: **2026-11-19 R107** (찬종 — "공개가 되다 보니 디도스 공격 대비 등 외부 침입에 대한 보안을 더 강화"). 결정 D-364 ~ D-367.
> 이 문서가 한도 값의 정본이다. 값은 전부 `server/src/config.ts` 의 `config.security`(환경 변수 `SEC_*`)로 바꿀 수 있다 — 보통은 비워 둔다.
> 공격 검사: `node scripts/bot.mjs attack --url http://localhost:3401` (자기 서버 · 한도를 작게 · 26 단정).

---

## 1. 그림 — 바깥에서 게임까지

```
  사람 · 공격자 ─https/wss─▶ Cloudflare (대량 트래픽은 여기서 받는다 · 집 IP 는 드러나지 않는다)
                               │ 터널(cloudflared 가 이 PC 에서 밖으로 연결 — 공유기에 연 포트 없음)
                               ▼
                     cloudflared (이 PC) ──▶ http://localhost:3000  (서버는 127.0.0.1 에서만 듣는다)
                                                │
                                                └─▶ PostgreSQL 127.0.0.1:5434 (이 PC 안에서만)
```

- 터널을 쓰면 집 공유기에 포트를 열지 않는다. 바깥에서 이 PC 로 직접 들어오는 길이 없다.
- 서버 · DB 둘 다 **루프백(127.0.0.1)에서만** 듣는다 — 같은 공유기의 다른 기기(친구 휴대폰 · 손님 와이파이)도 직접 붙지 못한다.

## 2. 진짜 IP

- 터널 뒤에서는 모든 요청이 127.0.0.1 에서 온다. 그래서 **루프백에서 온 요청만** `CF-Connecting-IP` 를 믿는다(`server/src/security/limits.ts` `clientIpFrom` — HTTP · 소켓 같은 함수).
- Cloudflare 는 이 헤더를 바깥 사람의 실제 IP 로 채워 보낸다(Cloudflare 문서 "HTTP headers" — 바깥에서 보낸 같은 이름의 값을 덮어쓴다고 명시된 문장은 없다: **확인 필요** · 덮어쓰지 않는다면 공격자가 IP 를 바꿔 가며 IP 한도를 피할 수 있다 — 아이디 한도 · argon2 줄 · 계정 한도는 그래도 선다).
- 루프백이 아닌 곳에서 온 헤더는 버린다(HOST=0.0.0.0 으로 열었을 때 공유기 안 기기가 남인 척하는 것 — 봇 attack [8]).
- `X-Forwarded-For` 는 보지 않는다(cloudflared 앞에 다른 프록시가 없다).
- **이 PC 자신**(루프백 + CF 헤더 없음 — 찬종이 localhost 로 · 봇 · ui-check)은 IP 기준 한도와 방 만들기 한도에서 뺀다. 터널로 들어온 요청은 늘 헤더가 붙으므로 여기 걸리지 않는다. 검사에서 빼지 않으려면 `SEC_LOCAL_EXEMPT=0`.

## 3. 한도 표 (기본값)

원칙: 진짜 사용자를 막지 않는다 — 한 집 · 회사 · PC방은 같은 IP 로 들어온다. **계정 · 아이디 기준을 먼저**, IP 기준은 넉넉하게. 전부 메모리에서 센다(DB 를 주기적으로 건드리지 않는다 — docs/02 3장 · 서버를 다시 켜면 0 부터).

| 무엇 | 기본값 | 환경 변수 | 넘으면 |
|---|---|---|---|
| 로그인 실패 — 아이디마다 | 10분에 5번 → **15분 잠금**(그동안 맞는 비밀번호도 거부) | `SEC_LOGIN_FAIL_PER_ID` · `SEC_LOGIN_FAIL_WINDOW_MS` · `SEC_LOGIN_LOCK_MS` | 429 "비밀번호를 여러 번 틀려서 잠시 막았어요. n분 뒤 다시" |
| 로그인 실패 — IP 마다 | 10분에 30번 | `SEC_LOGIN_FAIL_PER_IP` | 429 |
| 가입 — IP 마다 | 시간당 5개 · 하루 20개(만든 계정만 센다 — 중복 이름 다시 하기는 안 셈) | `SEC_SIGNUP_PER_IP_HOUR` · `SEC_SIGNUP_PER_IP_DAY` | 429 "이 곳에서 계정을 너무 많이 만들었어요" |
| 비밀번호 계산(argon2) | 동시에 2개 · 대기 줄 20 | `SEC_HASH_CONCURRENCY` · `SEC_HASH_QUEUE` | 503 "지금 사람이 많아요. 잠시 뒤 다시" |
| 소켓 동시 연결 — IP | 40 | `SEC_SOCKET_PER_IP` | 새 연결을 닫는다 |
| 소켓 동시 연결 — 계정 | 8 (보통 1 — 같은 계정 새 접속이 옛 접속을 끊는다 Q-06) | `SEC_SOCKET_PER_ACCOUNT` | 새 연결을 끊는다 |
| 로그인 안 된 소켓 | 10초 뒤 끊음(화면은 로그인한 뒤에만 소켓을 연다) · 핸드셰이크만 한 연결 10초 | `SEC_ANON_SOCKET_MS` | 끊음 |
| 소켓 이벤트 속도 | 모든 이벤트 합쳐 초당 30 · 한꺼번에 90 | `SEC_SOCKET_EVENTS_PER_SEC` · `SEC_SOCKET_EVENT_BURST` | **그 소켓만** 끊음 |
| 소켓 메시지 크기 | 64KB | `SEC_SOCKET_MAX_BYTES` | 그 소켓 끊음(socket.io) |
| 방 만들기 — 계정 | 10분에 5개 | `SEC_ROOM_CREATE_PER_ACCOUNT` · `SEC_ROOM_CREATE_WINDOW_MS` | "방을 너무 자주 만들었어요. n분 뒤" |
| HTTP 본문 | JSON 32KB · 사진 200KB(형식 검사 webp · jpeg · png — 바이트로 확인) | (코드) | 413 "보낸 내용이 너무 큽니다" |
| 앱 제보 | 계정마다 REPORT_RATE · 로그인 전은 IP 해시 10초 3번 | (shared) | 429 |
| 채팅 도배 | 5초 5개 → 5초 잠금(R048 그대로) · 이모티콘 1초 50개 넘는 것 버림 | `CHAT_RATE_*` · `EMOJI_FLOOD_PER_SEC` | 그대로 |

값을 정한 근거(실측):
- **소켓 이벤트 30/초 · 90**: 정상에서 가장 빠른 것은 캐치마인드 그리기 조각(50ms 마다 = 초당 20 — `DRAW.CHUNK_MS`) + 시계 · 하트비트. 연타 10초 미니게임은 누를 때마다가 아니라 시간 간격으로 보낸다(R054). 풍선 불기는 응답을 기다렸다 보낸다. 2분 동안 초당 20 을 넣어도 통이 비지 않는다(단위 테스트). 봇 전체(그리기 · 미니게임 · 도배 시나리오 포함)로 확인 — R107 보고서 3절.
- **메시지 64KB**: 가장 큰 정상 메시지 = 그림 조각(점 400개 ≈ 4KB) · 원 그리기 제출(점 1,200개 ≈ 15KB). 4배 넘게 여유.
- **argon2 2개**: Node 의 기본 작업자 4개 중 둘만 쓴다 — 로그인이 몰려도 나머지가 남는다. 게임 판정은 메인 스레드라 argon2 와 따로 돈다(attack [1] 중 옆 방 판정 2ms).

## 4. HTTP

| 무엇 | 값 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `same-origin` |
| `X-Frame-Options` · CSP `frame-ancestors` | `DENY` · `'none'` (다른 사이트가 게임을 끼워 넣지 못한다) |
| `Permissions-Policy` | 카메라 · 마이크 · 위치 끔 |
| HSTS | https 로 들어왔을 때만 `max-age=15552000`(180일) · 하위 도메인 · preload 는 넣지 않는다(되돌리기 어렵다) |
| CSP | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' https: data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` — 화면이 인라인 style 속성을 많이 써서 style 만 'unsafe-inline' · 소리는 Apple 미리듣기(https) |
| `X-Powered-By` | 뺌 |
| 오류 응답 | 마지막 오류 처리기 — JSON `{ ok:false, message }` 만(스택 · 내부 경로 없음). ★ 실 서버 `.env` 가 `NODE_ENV=development` 라 옛 413 응답은 HTML 에 스택(내부 경로)이 나갔다 |
| `/debug/room/:id` | 이 PC 자신만(옛: 개발 모드면 터널 밖에도 열림 — 정답은 없지만 내부 상태) |
| 정적 파일 캐시 | `/assets/`(이름에 해시) 1년 immutable · html no-cache · 소리 1시간 — Cloudflare 가 캐시해 낸다(옛: 전부 max-age=0 → Cloudflare 가 캐시하지 않음) |

## 5. 소켓 Origin

허용: `PUBLIC_HOSTNAME`(과 `www.`) · localhost · 127.0.0.1 · `*.trycloudflare.com` · Origin 없음.
- Origin 없음을 허용하는 까닭: 브라우저는 늘 Origin 을 보낸다. 없으면 브라우저가 아닌 프로그램이고, 그런 프로그램은 Origin 을 마음대로 쓸 수 있어 막아도 의미가 없다. Origin 검사가 막는 것은 **남의 사이트가 방문자의 쿠키로 우리 소켓에 붙는 것**(교차 사이트 웹소켓 가로채기)이다.

## 6. 일부러 안 막은 것 · 까닭

| 무엇 | 까닭 |
|---|---|
| 가입에 캡차 · 이메일 확인 | 친구들끼리 쓰는 게임 · 가입은 IP 한도와 argon2 줄로 충분. 대량 가입이 실제로 보이면 그때(Cloudflare Turnstile 등 — 찬종 결정) |
| 비밀번호 최소 4자 그대로 | 게임 규칙(01 2장 · Q-04). 대신 아이디 잠금으로 무차별 대입을 10분에 5번으로 묶었다 |
| 로그인 응답 시간 차이(없는 아이디는 argon2 를 안 돈다) | 가입이 이미 "있는 아이디" 를 알려 준다(01 2장) — 감출 실익이 없다 |
| CSP 의 style 'unsafe-inline' | 화면 전체가 인라인 style 을 쓴다. 스크립트는 막혀 있어 위험이 작다 |
| HSTS preload · 하위 도메인 | 되돌리기 어렵다. 도메인 운영이 자리 잡은 뒤 찬종 결정 |
| 소켓 끊김 뒤 자동 재연결 | 서버가 끊은 소켓은 화면이 다시 붙지 않는다(socket.io 규칙). 한도가 정상 속도의 4배 넘게 넉넉해 사람이 걸릴 일은 없다고 본다 — 걸리면 새로고침 |
| 지금 DB 비밀번호 바꾸기 | DB 포트를 이 PC 안으로 닫아 공개된 옛 비밀번호로는 바깥에서 붙을 수 없다. 바꾸면 검사 · GEN 스크립트 44개의 기본값도 같이 봐야 한다 — 순서는 docs/11 4-3 · 찬종 결정 |
| Cloudflare Bot Fight Mode | 문서: "API 나 앱 트래픽을 챌린지할 수 있다" · 예외를 둘 수 없다 · 자바스크립트 검사가 CSP 와 부딪힐 수 있다 → 소켓 · /api 가 막힐 위험. 켜기 전에 확인 필요(docs/11 4-2) |

## 7. 의존성 (`npm audit` · 2026-11-19)

R107 보고서 6절이 표의 정본이다. 패치 수준(`npm audit fix`)만 고치고, 큰 버전 올림(vitest 5 — 개발 도구)은 목록으로 남긴다.

## 8. 자리(공개 · 베타) — R109 · D-369

- 판별 = Host 머리말(`server/src/site.ts` `siteOf`). 터널은 주소마다 `httpHostHeader` 로 Host 를 고정한다. 모르는 Host · 임시 주소 = **공개**(안전한 쪽). 이 PC 의 localhost(루프백 + CF 헤더 없음)만 베타 — 터널을 지나온 요청이 Host 를 localhost 로 꾸며도 CF 헤더가 있어 공개로 떨어진다(단위 테스트).
- 베타 자리: 지인 계정만 — 로그인(비밀번호가 맞은 뒤 403 FRIEND_ONLY · 세션 안 만듦) · `/api/*`(로그인 · 자리 정보 빼고 — 지인 아닌 세션 403) · 소켓(세션을 붙이지 않음 → 방 이벤트 UNAUTHENTICATED · 10초 뒤 끊김). 가입 403 FRIEND_NO_SIGNUP. 모든 응답 `X-Robots-Tag: noindex, nofollow`.
- 그림 길: 상품 그림(`product-page`) · 치이카와 그림은 공개 자리에서 404(주소를 알아도 못 받는다). 치이카와 그림 캐시는 `private`.
- 공개 방은 방식 [노래] · 지인 전용 미니게임을 서버가 다시 막는다(설정 · 시작 · 연습 — `validateRoomSettings(…, { hidden })`). 미리듣기 · 표지 주소는 공개 방 스냅샷 · 이벤트에 싣지 않는다(봇 site ④).
