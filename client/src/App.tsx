// =============================================================================
// 앱 루트
//
// 화면 흐름
//   미로그인 → AuthScreen
//   로그인 + 방 없음 → 방 만들기 / 초대 링크 안내
//   로그인 + 방 있음 → Lobby
//
// ★ 초대 링크(/r/<roomId>)로 들어온 경우
//   guide 4절: 미로그인이면 로그인 후 해당 방으로 진입하고, 로그인 상태면 즉시 진입한다.
//   → 경로에서 roomId를 뽑아 두고 인증이 되면 자동으로 join 한다.
//
// ★★ 렌더 구조 규칙 (R008 D-027 / R009 D-032)
//   화면이 무엇이든 **하나의 셸(shell)로만 렌더한다.**
//   그 셸이 알림을 항상 같은 자리에 그린다.
//   ★ 화면마다 return 을 따로 두고 각자 알림을 그리면, 그중 하나에서 빼먹는다.
//     실제로 그렇게 해서 서버의 거부 사유가 로비 화면에서만 보이지 않았다.
//
// ★ R009에서 표시 방식만 바꿨다. 문서 흐름 배너 → 화면 고정 토스트.
//   경로는 그대로 한 곳이다. 개별 화면은 여전히 에러 표시를 하지 않는다.
//
// ★★ 알림이 사라지는 조건은 세 가지뿐이다 (D-032)
//   (1) 자동 만료 (Toast 가 처리한다)
//   (2) 사용자가 닫기를 누른다
//   (3) ★ 화면이 바뀐다 — 이 파일의 viewKey effect 가 처리한다
//   ★ (3)이 없으면 "빈 방 ID 로 실패 → 올바른 ID 로 입장 성공" 뒤에도
//     "방 ID를 입력해 주세요." 가 남는다. 이미 해결된 문제를 화면이 계속 문제라고 말한다.
// =============================================================================

import { onSignedIn, onSignedOut } from './prefsSync.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import AuthScreen from './AuthScreen.js';
import Lobby from './Lobby.js';
import Prefs from './Prefs.js';
import Toast, { type ToastContent } from './Toast.js';
import { errorMessage, fetchMe, logout, type Account } from './api.js';
import { useRoom } from './useRoom.js';
import { useServerClock } from './useServerClock.js';

/** 경로에서 초대받은 방 ID를 뽑는다. /r/<roomId> */
function roomIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
  return match ? match[1]! : null;
}

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(roomIdFromPath());
  const [title, setTitle] = useState('');
  const [joinId, setJoinId] = useState('');
  const [notice, setNotice] = useState<ToastContent | null>(null);

  const room = useRoom(socket);
  const clock = useServerClock(socket);

  // ── 세션 확인
  useEffect(() => {
    let alive = true;
    void (async () => {
      const me = await fetchMe();
      if (!alive) return;
      if (me) {
        setAccount(me.account);
        // 서버가 이미 방에 소속되어 있다고 알려주면 그 방을 우선한다
        if (me.currentRoomId) setPendingRoomId(me.currentRoomId);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── ★ R034 — 로그인하면 계정에 저장된 테마·소리를 불러온다 (닉네임만 바뀐 경우는 다시 부르지 않는다)
  const accountId = account?.accountId ?? null;
  useEffect(() => {
    if (accountId) void onSignedIn();
    else onSignedOut();
  }, [accountId]);

  // ── 인증되면 소켓을 연다
  useEffect(() => {
    if (!account) {
      setSocket(null);
      return undefined;
    }
    // ★ 접속 주소를 하드코딩하지 않는다. 같은 오리진에 붙는다.
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);
    return () => {
      s.close();
    };
  }, [account]);

  // ── 소켓이 열리면 대기 중인 방으로 들어간다
  useEffect(() => {
    if (!socket || !pendingRoomId) return undefined;
    const join = () => socket.emit('room.join', { roomId: pendingRoomId });
    if (socket.connected) join();
    socket.on('connect', join);

    const onCreated = () => setPendingRoomId(null);
    socket.on('room.created', onCreated);
    return () => {
      socket.off('connect', join);
      socket.off('room.created', onCreated);
    };
  }, [socket, pendingRoomId]);

  // ── 입장에 성공하면 URL을 방 주소로 맞춘다 (새로고침해도 같은 방으로 돌아온다)
  useEffect(() => {
    if (!room.snapshot) return;
    const want = `/r/${room.snapshot.room.id}`;
    if (window.location.pathname !== want) {
      window.history.replaceState(null, '', want);
    }
    setPendingRoomId(null);
  }, [room.snapshot]);

  /**
   * ★ 지금 어떤 화면인가. 알림을 걷어내는 기준이다 (D-032).
   *
   *   로딩 / 연결 종료 / 미로그인 / 방 안(방 ID 포함) / 방 없음
   *
   * ★ 방 ID 를 키에 넣는다. 방을 옮기는 것도 화면 전환이다.
   */
  const viewKey = (() => {
    if (loading) return 'loading';
    if (room.terminated) return 'terminated';
    if (!account) return 'auth';
    if (room.snapshot) return `room:${room.snapshot.room.id}`;
    return 'home';
  })();

  // ── ★ 화면이 바뀌면 알림을 지운다.
  //   ★ 이 effect 는 아래의 에러 effect 보다 **먼저** 선언되어야 한다.
  //     한 커밋에서 둘이 함께 실행되면(예: 에러 때문에 화면이 바뀌는 경우)
  //     나중에 선언된 쪽이 이긴다. 에러가 남는 편이 안전하다.
  useEffect(() => {
    setNotice(null);
  }, [viewKey]);

  // ── ★ 서버 에러를 화면에 띄우는 유일한 경로
  //   ★ useRoom 이 소켓의 error 이벤트를 그대로 넘겨준다. 여기서 토스트로 바꾼다.
  //   ★ 에러마다 **새 객체**를 넣는다. 같은 에러가 다시 와도 identity 가 달라지므로
  //     Toast 의 타이머가 다시 시작된다(= 연타해도 쌓이지 않고 시간만 갱신된다).
  //     화면 종류와 무관하게 이 한 곳만 지나간다.
  useEffect(() => {
    if (!room.error) return;
    setNotice({
      message: room.error.message,
      detail: room.error.detail,
      code: room.error.code,
    });
    // 들어갈 수 없는 방이면 대기 상태를 풀고 URL도 되돌린다
    if (['ROOM_NOT_FOUND', 'ROOM_CLOSED', 'ROOM_FULL', 'KICKED', 'BANNED'].includes(room.error.code)) {
      setPendingRoomId(null);
      if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    }
  }, [room.error]);

  const createRoom = useCallback(() => {
    if (!socket) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setNotice({ message: '방 제목을 입력해 주세요.' });
      return;
    }
    socket.emit('room.create', { title: trimmed });
  }, [socket, title]);

  const joinRoom = useCallback(() => {
    if (!socket) return;
    const trimmed = joinId.trim();
    // ★ 조용히 반환하지 않는다. 아무 반응이 없으면 사용자는 고장으로 받아들인다.
    //   이번 라운드 결함의 원인이 정확히 그것이었다.
    if (!trimmed) {
      setNotice({ message: '방 ID를 입력해 주세요.' });
      return;
    }
    socket.emit('room.join', { roomId: trimmed });
  }, [socket, joinId]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room.leave', {});
    window.history.replaceState(null, '', '/');
  }, [socket]);

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      setNotice({ message: errorMessage(err) });
    }
    setAccount(null);
    window.history.replaceState(null, '', '/');
  }, []);

  // ★★ R033 — 서버 시각 오프셋 **표시**를 뺐다 (건우: "굳이 표기할 필요 없지 않나").
  //   ★ 시계 동기화 자체(useServerClock)는 그대로다 — 타이머·카운트다운이 이것에 기대고 있다.

  // ── 화면 선택. ★ return 은 이 함수 하나에서만 한다.
  const view = (() => {
    if (loading) {
      return { narrow: true, body: <p className="note">불러오는 중…</p>, foot: null };
    }

    if (room.terminated) {
      return {
        narrow: true,
        body: (
          <>
            {/* ★ R040 (건우) — 줄바꿈 없이 · 가운데 (PC · 모바일). 문장마다 한 줄 */}
            <div className="terminated">
              <h1>연결이 종료되었습니다</h1>
              <p className="note">다른 곳에서 접속해 이 연결이 끊겼어요.</p>
              <p className="note">한 계정은 한 곳에서만 접속할 수 있어요.</p>
              <button type="button" onClick={() => window.location.reload()}>
                다시 접속
              </button>
            </div>
          </>
        ),
        foot: null,
      };
    }

    if (!account) {
      return {
        narrow: true,
        body: <AuthScreen onAuthed={setAccount} pendingRoomId={pendingRoomId} />,
        foot: <Prefs />,
      };
    }

    if (room.snapshot && socket) {
      return {
        narrow: false,
        body: (
          <Lobby
            socket={socket}
            snapshot={room.snapshot}
            chat={room.chat}
            onLeave={leaveRoom}
            serverNow={clock.serverNow}
            throttledUntil={room.throttledUntil}
            onNicknameChanged={(nickname) =>
              setAccount((prev) => (prev ? { ...prev, nickname } : prev))
            }
            onLogout={doLogout}
          />
        ),
        // ★ R035 — 방 안에서는 푸터가 없다. 테마·소리·로그아웃은 상단 바의 ⚙ 안에 있다 (화면 아래 빈 공간 제거)
        foot: null,
      };
    }

    return {
      narrow: true,
      body: (
        <>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">Q</span>
            <h1>상식 퀴즈</h1>
            <p className="sub">
              <span className="nick">{account.nickname}</span> 님, 어서 오세요!
            </p>
          </div>

          <section className="card">
            <h2>방 만들기</h2>
            <div className="field-row">
              <input
                value={title}
                maxLength={30}
                placeholder="방 제목"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) createRoom();
                }}
              />
              <button type="button" className="primary" onClick={createRoom} disabled={!socket}>
                만들기
              </button>
            </div>
          </section>

          <section className="card">
            <h2>초대 링크로 입장</h2>
            <div className="field-row">
              <input
                value={joinId}
                placeholder="방 ID (보통은 링크를 열면 끝)"
                className="mono"
                onChange={(e) => setJoinId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) joinRoom();
                }}
              />
              <button type="button" onClick={joinRoom} disabled={!socket}>
                입장
              </button>
            </div>
          </section>
        </>
      ),
      foot: (
        <>
          {/* ★ R033 — 출처(OpenTDB) 문구를 뺐다. OpenTDB 문항은 전부 내렸다 (건우 방침 / 저장소 Private) */}
          <Prefs />
          <button type="button" className="ghost tiny" onClick={doLogout}>
            로그아웃
          </button>
        </>
      ),
    };
  })();

  return (
    <main className={view.narrow ? 'wrap narrow' : 'wrap'}>
      {/* ★ 알림은 화면 종류와 무관하게 항상 여기 하나뿐이다 (D-027 / D-032).
          ★ 화면 고정(fixed)이므로 문서 흐름에서의 위치는 의미가 없다.
            그래도 여기 두는 이유는 "표시 경로가 한 곳" 임을 코드로 드러내기 위함이다. */}
      <Toast content={notice} onDismiss={() => setNotice(null)} />
      {view.body}
      {view.foot && <footer className="foot">{view.foot}</footer>}
    </main>
  );
}
