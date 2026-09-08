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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import AuthScreen from './AuthScreen.js';
import Lobby from './Lobby.js';
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
    if (['ROOM_NOT_FOUND', 'ROOM_CLOSED', 'ROOM_FULL'].includes(room.error.code)) {
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

  const clockLine = useMemo(() => {
    if (clock.offset === null) return '시각 동기화 측정 중…';
    return `서버 시각 오프셋 ${clock.offset >= 0 ? '+' : ''}${clock.offset}ms / RTT ${clock.rtt}ms`;
  }, [clock.offset, clock.rtt]);

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
            <h1>연결이 종료되었습니다</h1>
            <p className="note">
              다른 곳에서 접속하여 이 연결이 종료되었습니다. 한 계정은 한 곳에서만 접속할
              수 있습니다.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              다시 접속
            </button>
          </>
        ),
        foot: null,
      };
    }

    if (!account) {
      return {
        narrow: true,
        body: <AuthScreen onAuthed={setAccount} pendingRoomId={pendingRoomId} />,
        foot: null,
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
          />
        ),
        foot: (
          <>
            <span className="dim mono">{clockLine}</span>
            <button type="button" className="ghost tiny" onClick={doLogout}>
              로그아웃
            </button>
          </>
        ),
      };
    }

    return {
      narrow: true,
      body: (
        <>
          <header className="lobby-head">
            <div>
              <h1>상식 퀴즈</h1>
              <p className="sub">
                <span className="nick">{account.nickname}</span> 님으로 접속 중
              </p>
            </div>
            <button type="button" className="ghost" onClick={doLogout}>
              로그아웃
            </button>
          </header>

          <section className="card">
            <h2>방 만들기</h2>
            <div className="field-row">
              <input
                value={title}
                maxLength={30}
                placeholder="방 제목 (1~30자)"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) createRoom();
                }}
              />
              <button type="button" onClick={createRoom} disabled={!socket}>
                만들기
              </button>
            </div>
            <p className="note">한 사람이 동시에 가질 수 있는 방은 하나입니다.</p>
          </section>

          <section className="card">
            <h2>초대 링크로 입장</h2>
            <div className="field-row">
              <input
                value={joinId}
                placeholder="방 ID"
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
            <p className="note">
              보통은 받은 링크를 그대로 열면 됩니다. 이 입력창은 링크가 깨졌을 때를 위한
              것입니다.
            </p>
          </section>
        </>
      ),
      foot: (
        <>
          <span className="dim mono">{clockLine}</span>
          {/* ★ 라이선스 의무 (Q-41 / DATA_LICENSE.md).
              OpenTDB 는 CC BY-SA 4.0 이고 저작자 표시가 의무다.
              ★ 미관 문제가 아니라 지켜야 하는 조건이므로 Phase 7로 미루지 않는다 (D-031 기준 4). */}
          <span className="dim attribution">
            문제 출처:{' '}
            <a href="https://opentdb.com/" target="_blank" rel="noreferrer noopener">
              Open Trivia Database
            </a>{' '}
            (CC BY-SA 4.0)
          </span>
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
