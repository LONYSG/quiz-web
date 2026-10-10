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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import AuthScreen from './AuthScreen.js';
import Avatar from './Avatar.js';
import BusyButton from './BusyButton.js';
import Icon from './Icon.js';
import PasswordChange from './PasswordChange.js';
import ConfirmModal from './ConfirmModal.js';
import { usePopup } from './popup.js';
import { LoaderCircle } from 'lucide-react';
import Lobby from './Lobby.js';
import Prefs from './Prefs.js';
import Toast, { type ToastContent } from './Toast.js';
import { errorMessage, fetchMe, logout, type Account } from './api.js';
import { useRoom } from './useRoom.js';
import { useSocial } from './useSocial.js';
import FriendList from './FriendList.js';
// import { BellButton } from './SocialPopups.js'; // ★ R044 A-3 — 알림 끔 (D-214)
import InviteToast from './InviteToast.js';
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

  // ★ R044 진단 — App 이 몇 번 그려졌나 (ui-check 가 읽는다 · 화면에는 안 보인다)
  (window as unknown as { __qwAppRenders?: number }).__qwAppRenders = ((window as unknown as { __qwAppRenders?: number }).__qwAppRenders ?? 0) + 1;
  const room = useRoom(socket);
  const [logoutOpen, setLogoutOpen] = usePopup('logout');
  const clock = useServerClock(socket);
  // ★★ R043 C — 친구 · 알림. 새 알림은 🔔 숫자로. **게임 중이 아닐 때만** 짧은 알림 한 줄을 띄운다 (게임 중에는 숫자만)
  const inGameRef = useRef(false);
  inGameRef.current = Boolean(room.snapshot && !['LOBBY', 'GAME_RESULT'].includes(room.snapshot.room.state));
  // ★★ R044 A-4 (건우: "굳이 위에 알림 띄우지 말자. 어차피 메뉴 아이콘에 빨간 점이 들어온다") — 화면 위 알림 한 줄을 끈다.
  //   친구 신청은 친구 버튼 숫자 · ☰ 점으로만, 초대는 아래 초대 토스트(InviteToast)로. 되살리려면 아래 주석을 푼다 (D-214)
  const onNewNotice = useCallback((_n: { kind: string; fromNickname: string }) => {
    /*
    if (inGameRef.current) return;
    const what = n.kind === 'friend_request' ? '친구 신청을 보냈어요' : n.kind === 'friend_accepted' ? '친구 신청을 수락했어요' : '방으로 초대했어요';
    setNotice({ message: `${n.fromNickname} 님이 ${what}.` });
    */
  }, []);
  const social = useSocial(socket, onNewNotice);
  // ★ R044 A-5 — 초대받은 방에 들어가면 그 방 초대는 지운다 (처리 끝)
  const currentRoomId = room.snapshot?.room.id ?? null;
  const staleInviteIds = social.invites.filter((n) => n.roomId === currentRoomId).map((n) => n.id).join(',');
  const dismissNotice = social.dismiss;
  useEffect(() => {
    if (!staleInviteIds) return;
    for (const id of staleInviteIds.split(',')) dismissNotice(id);
  }, [staleInviteIds, dismissNotice]);
  /** ★ R043 C — 방 안에서 다른 방(친구 방 · 초대)으로 옮기기 전 확인 */
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = usePopup('switch-room');
  /** ★ R043 A-2 — 서버를 기다리는 동작 (방 만들기 · 입장). 응답(방 화면 · 오류)이 오면 풀린다 */
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  useEffect(() => {
    if (room.snapshot || room.error) setBusy(null);
  }, [room.snapshot, room.error]);
  /** ★ R043 A-6 — 방을 나오면 방 코드 칸에 그 방의 코드를 채워 둔다 (바로 다시 들어갈 수 있게) */
  const lastRoomCode = useRef<string | null>(null);
  useEffect(() => {
    if (room.snapshot?.room.code) lastRoomCode.current = room.snapshot.room.code;
  }, [room.snapshot?.room.code]);

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
  const mustChange = Boolean(account?.mustChangePassword);
  useEffect(() => {
    // ★ R043 A-4 — 관리자가 초기화한 계정은 새 비밀번호를 정하기 전에는 소켓도 열지 않는다
    if (!account || mustChange) {
      setSocket(null);
      return undefined;
    }
    // ★ 접속 주소를 하드코딩하지 않는다. 같은 오리진에 붙는다.
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);
    // ★★ R041 — 페이지를 떠나면(다른 주소 · 뒤로 가기 · 탭 닫기) 소켓을 **직접** 닫는다.
    //   원인 (ui-check 실측): 브라우저가 떠난 페이지를 뒤로 가기 캐시(bfcache)에 얼려 두면 소켓이 열린 채 남아
    //   서버가 "아직 접속 중" 으로 봤다 → 모두 떠나도 일시정지가 안 되고, 접속 종료 표시가 늦었다(하트비트 시간까지).
    //   캐시에서 돌아오면(pageshow persisted) 다시 연결한다 — 서버가 방에 다시 붙여 준다(재접속과 같다).
    const onHide = () => s.disconnect();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !s.connected) s.connect();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      s.close();
    };
  }, [account?.accountId, mustChange]);

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
    setBusy('create');
    socket.emit('room.create', { title: trimmed });
  }, [socket, title]);

  const joinRoom = useCallback(() => {
    if (!socket) return;
    const trimmed = joinId.trim();
    // ★ 조용히 반환하지 않는다. 아무 반응이 없으면 사용자는 고장으로 받아들인다.
    //   이번 라운드 결함의 원인이 정확히 그것이었다.
    if (!trimmed) {
      setNotice({ message: '방 코드 6자리를 입력해 주세요.' });
      return;
    }
    setBusy('join');
    socket.emit('room.join', { roomId: trimmed });
  }, [socket, joinId]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room.leave', {});
    window.history.replaceState(null, '', '/');
    // ★ R043 A-6 — 나온 방의 코드를 입장 칸에 채워 둔다
    if (lastRoomCode.current) setJoinId(lastRoomCode.current);
  }, [socket]);

  /** ★ R043 C — 친구가 있는 방 · 초대받은 방으로. 방 안이면 확인 후 지금 방을 나가고 들어간다 */
  const joinOther = useCallback(
    (roomId: string) => {
      if (!socket) return;
      if (room.snapshot) {
        if (room.snapshot.room.id === roomId) return;
        setSwitchTo(roomId);
        setSwitchOpen(true);
        return;
      }
      setPendingRoomId(roomId);
    },
    [socket, room.snapshot, setSwitchOpen],
  );

  // ★ R044 — 토스트 닫기 함수는 고정한다. Toast 의 자동 만료 타이머(7초)는 onDismiss 가 바뀌면 처음부터 다시 센다 —
  //   렌더마다 새 함수를 넘겼더니, 시계 맞추기(30초마다 몇 번 상태가 바뀐다 → App 이 다시 그려진다)가 알림이 떠 있는 동안 오면
  //   알림이 12초 넘게 남았다 (R044 verify 첫 실행에서 ui-check [4-2] 가 잡았다 — 실행마다 결과가 달랐다. 옛 결함)
  const dismissToast = useCallback(() => setNotice(null), []);

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
        body: (
          <AuthScreen
            onAuthed={(a) => {
              setAccount(a);
              // ★ R043 A-1 — 로그인 응답에는 사진 버전이 없다 → 한 번 더 물어 내 사진을 채운다
              void fetchMe().then((me) => me && setAccount((prev) => (prev ? { ...prev, ...me.account } : prev)));
            }}
            pendingRoomId={pendingRoomId}
          />
        ),
        foot: <Prefs />,
      };
    }

    // ★★ R043 A-4 — 관리자가 초기화한 계정: 새 비밀번호 화면만 (다른 곳으로 못 간다)
    if (account.mustChangePassword) {
      return {
        narrow: true,
        body: (
          <PasswordChange
            nickname={account.nickname}
            onDone={() => setAccount((prev) => (prev ? { ...prev, mustChangePassword: false } : prev))}
            onLogout={() => void doLogout()}
          />
        ),
        foot: null,
      };
    }

    // ★ R043 A-2 — 방에 들어가는 중 (초대 링크·코드·친구로 들어갈 때 방 화면이 오기 전): 화면 가운데 로딩
    if (pendingRoomId && !room.snapshot && socket) {
      return {
        narrow: true,
        body: (
          <div className="entering" role="status" aria-live="polite">
            <Icon icon={LoaderCircle} className="spin" />
            <p>방에 들어가는 중…</p>
          </div>
        ),
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
            throttledUntil={room.throttledUntil}
            onNicknameChanged={(nickname) =>
              setAccount((prev) => (prev ? { ...prev, nickname } : prev))
            }
            onLogout={doLogout}
            social={social}
            onJoinOther={joinOther}
          />
        ),
        // ★ R035 — 방 안에서는 푸터가 없다. 테마·소리·로그아웃은 상단 바의 ⚙ 안에 있다 (화면 아래 빈 공간 제거)
        foot: null,
      };
    }

    return {
      narrow: true,
      home: true,
      body: (
        <>
          {/* ★ R043 C — 🔔 알림 (방 목록 화면 오른쪽 위)
              ★★ R044 A-3 (건우) — 화면에서 뺐다. 되살리려면 이 주석을 푼다 — 07-DECISIONS D-214
          <div className="home-bar">
            <BellButton social={social} onJoin={joinOther} />
          </div>
          */}
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">Q</span>
            <h1>상식 퀴즈</h1>
            {/* ★ R043 A-1 — 내 사진도 */}
            <p className="sub home-me">
              <Avatar nickname={account.nickname} colorIndex={0} accountId={account.accountId} avatarV={account.avatarV ?? null} />
              <span>
                <span className="nick">{account.nickname}</span> 님, 어서 오세요!
              </span>
            </p>
          </div>

          <div className="home-grid">
          <div className="home-col">
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
              <BusyButton className="primary" onClick={createRoom} disabled={!socket} busy={busy === 'create'}>
                만들기
              </BusyButton>
            </div>
          </section>

          {/* ★★ R043 A-7 — 방 코드 6자리로 입장 (숫자 키패드 · 6자리를 다 치면 바로 들어간다 — 판단). 긴 링크도 그대로 받는다 */}
          <section className="card">
            <h2>방 코드로 입장</h2>
            <div className="field-row">
              <input
                id="join-code"
                value={joinId}
                placeholder="6자리 숫자"
                className="mono code-input"
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  // 숫자만 치면 6자리까지 · 링크를 붙여 넣으면 방 id 만 뽑는다
                  const fromLink = v.match(/\/r\/([A-Za-z0-9_-]+)/)?.[1];
                  const next = fromLink ?? (/^\d*$/.test(v) ? v.slice(0, 6) : v);
                  setJoinId(next);
                  if (/^\d{6}$/.test(next) && socket && busy === null) {
                    setBusy('join');
                    socket.emit('room.join', { roomId: next });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) joinRoom();
                }}
              />
              <BusyButton onClick={joinRoom} disabled={!socket} busy={busy === 'join'}>
                입장
              </BusyButton>
            </div>
          </section>
          </div>
          {/* ★★ R043 C-2 — 방 목록 화면의 친구 목록 (크게). 방에 있는 친구는 [들어가기] */}
          <section className="card home-friends">
            <h2>친구</h2>
            <FriendList social={social} mode="home" onJoin={joinOther} pageSize={window.matchMedia('(max-width: 999px)').matches ? 5 : 6} />
          </section>
          </div>
        </>
      ),
      foot: (
        <>
          {/* ★ R033 — 출처(OpenTDB) 문구를 뺐다. OpenTDB 문항은 전부 내렸다 (건우 방침 / 저장소 Private) */}
          <Prefs />
          {/* ★ R043 A-6 — 로그아웃도 확인 팝업 (방 안 ⚙ 의 로그아웃과 같은 팝업) */}
          <button type="button" className="ghost tiny" onClick={() => setLogoutOpen(true)}>
            로그아웃
          </button>
          {logoutOpen && (
            <ConfirmModal
              kind="logout"
              title="로그아웃할까요?"
              actions={[{ label: '로그아웃', tone: 'warn', onClick: () => { setLogoutOpen(false); void doLogout(); } }]}
              onCancel={() => setLogoutOpen(false)}
            />
          )}
        </>
      ),
    };
  })();

  return (
    <main className={view.narrow ? ('home' in view && view.home ? 'wrap narrow home-wide' : 'wrap narrow') : 'wrap'}>
      {/* ★ 알림은 화면 종류와 무관하게 항상 여기 하나뿐이다 (D-027 / D-032).
          ★ 화면 고정(fixed)이므로 문서 흐름에서의 위치는 의미가 없다.
            그래도 여기 두는 이유는 "표시 경로가 한 곳" 임을 코드로 드러내기 위함이다. */}
      <Toast content={notice} onDismiss={dismissToast} />
      {/* ★★ R044 A-5 — 친구 초대 토스트 (게임 중에는 띄우지 않는다 — 숫자 · 점만) */}
      {socket && account && !mustChange && !(pendingRoomId && !room.snapshot) && (
        <InviteToast social={social} show={!inGameRef.current} onAccept={joinOther} />
      )}
      {view.body}
      {switchOpen && switchTo && (
        <ConfirmModal
          kind="switch-room"
          title="지금 방을 나가고 들어갈까요?"
          actions={[
            {
              label: '옮기기',
              tone: 'warn',
              onClick: () => {
                setSwitchOpen(false);
                socket?.emit('room.leave', {});
                setPendingRoomId(switchTo);
              },
            },
          ]}
          onCancel={() => setSwitchOpen(false)}
        />
      )}
      {view.foot && <footer className="foot">{view.foot}</footer>}
    </main>
  );
}
