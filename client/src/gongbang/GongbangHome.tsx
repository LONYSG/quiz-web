// =============================================================================
// ★★★ R117 (docs/24 8절 · R116 시안 03 · 04 · 05) — 스위치 GONGBANG 을 켰을 때의 첫 화면
//
//   모바일: 로비(로고 · 프로필 · [같이 하기] · [혼자 하기]) ⇄ 공방 목록 — 위 오른쪽 [친구] · [☰] 는 두 화면 모두 같은 자리
//   PC   : 휴대폰 판을 두 칸으로 — 왼쪽 로비 · 오른쪽 공방 목록(늘 구독) · 위 오른쪽 [친구] · [☰]
//          (방 안 PC 위 막대의 [친구] 자리와 같은 오른쪽 위 — 앱 CSS 는 PC 에서 ☰ 를 숨기므로 여기서는 gb-menu 로 따로 보인다)
//
//   ★ [혼자 하기]는 아직 없다(솔로 라운드) — 눌러도 "곧 열려요" 한 줄 · 모양은 그대로.
//   ★ 띠 표시는 아직 안 붙인다(띠 부품 Belt.tsx 만 · 프로필의 띠 자리는 비움).
//   ★ ☰ 안 = 방 코드로 입장 · 프로필 · 포인트샵 · 설정 · 안내 · 제보 · 로그아웃(포인트샵은 여기로 — 찬종 R115)
//   ★ 창은 기존 부품을 그대로 연다 — ProfilePanel · ShopPanel · Prefs · InfoTip · FriendsButton 을 머리 줄에 두고
//     그 단추(프로필 · 포인트샵 · 설정 · 안내)만 CSS 로 숨긴다(방 안 모바일 ☰ 와 같은 길 — popup.ts id 로 연다).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Bug, ChevronLeft, Gift, Hash, Info, LogOut, Menu, Pencil, Settings, User, Users } from 'lucide-react';
import type { DifficultyLevel, RoomKind, RoomListItem } from '@quiz/shared';
import type { Account } from '../api.js';
import type { Social } from '../useSocial.js';
import Avatar from '../Avatar.js';
import BrandLogo from '../BrandLogo.js';
import BusyButton from '../BusyButton.js';
import ConfirmModal from '../ConfirmModal.js';
import Icon from '../Icon.js';
import InfoText from '../InfoText.js';
import InfoTip from '../InfoTip.js';
import PopupClose from '../PopupClose.js';
import Prefs from '../Prefs.js';
import ProfilePanel from '../ProfilePanel.js';
import ShopPanel, { useShopDot } from '../ShopPanel.js';
import { FriendsButton } from '../SocialPopups.js';
import { useOpenBugReport } from '../AppReport.js';
import { openPersonCard } from '../PersonCard.js';
import { openPopup, usePopup } from '../popup.js';
import { useUiMode } from '../uiMode.js';
import Directory from './Directory.js';
import CreateRoom, { type CreatePayload, type CreatePrefill } from './CreateRoom.js';
import LockedJoin, { type LockState } from './LockedJoin.js';

interface Props {
  socket: Socket;
  account: Account;
  social: Social;
  onJoinOther: (roomId: string) => void;
  onNicknameChanged: (nickname: string) => void;
  onAvatarChanged: (avatarV: number | null) => void;
  onLogout: () => void;
  onNotice: (message: string) => void;
  /** 방을 만든다 — after = 방이 생긴 뒤 설정으로 보낼 난이도 · 미니게임(빠른 입장 "이 옵션으로 방 만들기") */
  onCreate: (p: CreatePayload, after: { level: DifficultyLevel | null; minigames: boolean | null }) => void;
  creating: boolean;
  /** 지난 방 코드(방을 나오면 채워 둔다 — 옛 첫 화면과 같다) */
  lastCode: string;
}

const KIND_KEY = 'qw.gb.kind';
const readKind = (): RoomKind => {
  try {
    const k = sessionStorage.getItem(KIND_KEY);
    return k === 'draw' || k === 'liar' ? k : 'quiz';
  } catch {
    return 'quiz';
  }
};

/** ☰ → 방 코드로 입장(6자리를 다 치면 바로 들어간다 — 옛 첫 화면과 같다) */
function CodeJoin({ initial, onJoin, onClose }: { initial: string; onJoin: (code: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const go = (code: string) => {
    if (!code.trim()) return;
    setSent(true);
    onJoin(code.trim());
  };
  return (
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal gb-code" role="dialog" aria-label="방 코드로 입장">
        <div className="pop-head">
          <p className="pop-title">방 코드로 입장</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="field-row">
          <input
            id="join-code"
            value={v}
            placeholder="6자리 숫자"
            className="mono code-input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              const raw = e.target.value.trim();
              const fromLink = raw.match(/\/r\/([A-Za-z0-9_-]+)/)?.[1];
              const next = fromLink ?? (/^\d*$/.test(raw) ? raw.slice(0, 6) : raw);
              setV(next);
              if (/^\d{6}$/.test(next) && !sent) go(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) go(v);
            }}
          />
          <BusyButton onClick={() => go(v)} busy={sent}>
            입장
          </BusyButton>
        </div>
      </div>
    </div>
  );
}

/** ☰ 메뉴(방 안 모바일 ☰ 와 같은 꼴 · menu-modal) */
function HomeMenu({ shopDot, onCode, onLogout, onClose }: { shopDot: boolean; onCode: () => void; onLogout: () => void; onClose: () => void }) {
  const openReport = useOpenBugReport();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className="modal-back popup-back clear"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal menu-modal" role="dialog" aria-label="메뉴" data-gb-menu-pop>
        <div className="pop-head">
          <p className="pop-title">메뉴</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="menu-list" data-arrow-nav>
          <button type="button" className="menu-item" data-menu="code" onClick={onCode}>
            <Icon icon={Hash} /> 방 코드로 입장
          </button>
          <button type="button" className="menu-item" data-menu="profile" onClick={() => openPopup('profile')}>
            <Icon icon={Pencil} /> 프로필
          </button>
          <button type="button" className="menu-item" data-menu-shop onClick={() => openPopup('shop')}>
            <Icon icon={Gift} /> 포인트샵
            {shopDot && <span className="menu-dot" data-shop-dot aria-label="새" />}
          </button>
          <button type="button" className="menu-item" data-menu="settings" onClick={() => openPopup('prefs')}>
            <Icon icon={Settings} /> 설정
          </button>
          <button type="button" className="menu-item" data-menu="info" onClick={() => openPopup('info')}>
            <Icon icon={Info} /> 안내
          </button>
          <button type="button" className="menu-item" data-menu-report onClick={openReport}>
            <Icon icon={Bug} /> 제보
          </button>
          <button type="button" className="menu-item danger-text" data-menu="logout" onClick={onLogout}>
            <Icon icon={LogOut} /> 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GongbangHome({ socket, account, social, onJoinOther, onNicknameChanged, onAvatarChanged, onLogout, onNotice, onCreate, creating, lastCode }: Props) {
  const ui = useUiMode();
  const pc = ui !== 'mobile';
  const [view, setView] = useState<'lobby' | 'dir'>(() => (window.location.hash === '#gongbang' ? 'dir' : 'lobby'));
  const [kind, setKindState] = useState<RoomKind>(readKind);
  const [counts, setCounts] = useState<Record<RoomKind, number> | null>(null);
  const [menuOpen, setMenuOpen] = usePopup('gb-menu');
  const [codeOpen, setCodeOpen] = usePopup('gb-code');
  const [logoutOpen, setLogoutOpen] = usePopup('logout');
  const [createOpen, setCreateOpen] = usePopup('gb-create');
  const [prefill, setPrefill] = useState<CreatePrefill>({ kind: 'quiz', level: null, minigames: null });
  const [lockOpen, setLockOpen] = usePopup('gb-lock');
  const [lock, setLock] = useState<LockState | null>(null);
  const shopDot = useShopDot();

  const setKind = useCallback((k: RoomKind) => {
    setKindState(k);
    try {
      sessionStorage.setItem(KIND_KEY, k);
    } catch {
      /* 이번만 */
    }
  }, []);
  const onCounts = useCallback((c: Record<RoomKind, number>) => setCounts(c), []);

  // 모바일 뒤로 가기 = 목록 → 로비(주소 #gongbang)
  useEffect(() => {
    const onPop = () => setView(window.location.hash === '#gongbang' ? 'dir' : 'lobby');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openDir = () => {
    if (pc) {
      (document.querySelector('[data-quick-join]') as HTMLButtonElement | null)?.focus();
      return;
    }
    window.history.pushState(null, '', '/#gongbang');
    setView('dir');
  };
  const backToLobby = () => {
    if (window.location.hash === '#gongbang') window.history.back();
    else setView('lobby');
  };

  // 로비만 보일 때 — "열린 방 N" 은 한 번 묻는다(목록을 보면 목록이 같이 보낸다)
  useEffect(() => {
    const on = (p: { counts: Record<RoomKind, number> }) => setCounts(p.counts);
    socket.on('directory.counts', on);
    const ask = () => socket.emit('directory.counts', {});
    socket.on('connect', ask);
    if (socket.connected) ask();
    return () => {
      socket.off('directory.counts', on);
      socket.off('connect', ask);
    };
  }, [socket]);

  // 잠긴 방 — 서버가 숫자판을 열라고 한다(틀림 · 막힘도 같은 이벤트)
  useEffect(() => {
    const on = (p: { code: string; title: string; error: LockState['error']; left: number | null; waitMs: number | null }) => {
      setLock((prev) => ({ code: p.code, title: p.title, error: p.error, left: p.left, until: p.waitMs ? Date.now() + p.waitMs : null, tick: (prev?.tick ?? 0) + 1 }));
      setLockOpen(true);
    };
    socket.on('room.lockRequired', on);
    return () => {
      socket.off('room.lockRequired', on);
    };
  }, [socket, setLockOpen]);

  const joinItem = (it: RoomListItem) => {
    if (it.locked) {
      setLock((prev) => ({ code: it.code, title: it.title, error: null, left: null, until: null, tick: (prev?.tick ?? 0) + 1 }));
      setLockOpen(true);
      return;
    }
    socket.emit('room.join', { roomId: it.code });
  };
  const openCreate = (p: CreatePrefill) => {
    setPrefill(p);
    setCreateOpen(true);
  };

  const openRooms = counts ? counts.quiz + counts.draw + counts.liar : null;
  const showLobby = pc || view === 'lobby';
  const showDir = pc || view === 'dir';

  return (
    <div className={`gb-home ${pc ? 'gb-pc' : `gb-m view-${view}`}`} data-gb-home={pc ? 'pc' : view}>
      <header className="room-head gb-head">
        <div className="room-title">
          {!pc && view === 'dir' && (
            <>
              <button type="button" className="ghost tiny gb-back" aria-label="뒤로" onClick={backToLobby}>
                <Icon icon={ChevronLeft} />
              </button>
              <h1>공방</h1>
            </>
          )}
        </div>
        <div className="room-tools gb-tools">
          <FriendsButton social={social} inRoom={new Set()} onJoin={onJoinOther} />
          {/* 창만 쓰는 부품(단추는 CSS 로 숨김 — ☰ 가 popup id 로 연다) */}
          <ProfilePanel
            accountId={account.accountId}
            nickname={account.nickname}
            colorIndex={0}
            avatarV={account.avatarV ?? null}
            onNicknameChanged={onNicknameChanged}
            onAvatarChanged={onAvatarChanged}
          />
          <ShopPanel />
          <Prefs variant="gear" onLogout={onLogout} />
          <InfoTip>
            <InfoText />
          </InfoTip>
          <button type="button" className="ghost tiny gb-menu" id="gb-menu-btn" aria-label="메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Icon icon={Menu} />
            {(social.pending > 0 || shopDot) && <span className="red-dot" aria-label={social.pending > 0 ? '새 친구 신청 · 초대' : '새 포인트샵'} />}
          </button>
        </div>
      </header>

      <div className="gb-cols">
        {showLobby && (
          <section className="gb-lobby" aria-label="로비">
            <div className="lob2-mid">
              <div className="brand">
                <BrandLogo />
                <h1>퀴즈도장</h1>
              </div>
              <button type="button" className="lob2-me" data-gb-me onClick={() => openPersonCard({ accountId: account.accountId, nickname: account.nickname, colorIndex: 0, avatarV: account.avatarV ?? null })}>
                <Avatar nickname={account.nickname} colorIndex={0} accountId={account.accountId} avatarV={account.avatarV ?? null} large />
                <span className="nick">{account.nickname}</span>
              </button>
              {/* 띠 자리 — 솔로 라운드가 채운다(지금은 비움) */}
              <div className="lob2-play">
                <button type="button" className="primary big-btn" data-gb-together onClick={openDir}>
                  <Icon icon={Users} />
                  같이 하기
                  <small>{openRooms === null ? '공방' : `열린 방 ${openRooms}`}</small>
                </button>
                <button type="button" className="big-btn" data-gb-solo onClick={() => onNotice('혼자 하기는 곧 열려요.')}>
                  <Icon icon={User} />
                  혼자 하기
                  <small>곧 열려요</small>
                </button>
              </div>
            </div>
          </section>
        )}
        {showDir && (
          <section className="gb-dir dir2" aria-label="공방 목록">
            {pc && (
              <div className="dir-head">
                <h1>공방</h1>
              </div>
            )}
            <Directory socket={socket} kind={kind} onKind={setKind} counts={counts} onCounts={onCounts} onJoin={joinItem} onCreate={openCreate} />
          </section>
        )}
      </div>

      {menuOpen && (
        <HomeMenu
          shopDot={shopDot}
          onCode={() => setCodeOpen(true)}
          onLogout={() => setLogoutOpen(true)}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {codeOpen && (
        <CodeJoin
          initial={lastCode}
          onJoin={(code) => socket.emit('room.join', { roomId: code })}
          onClose={() => setCodeOpen(false)}
        />
      )}
      {logoutOpen && (
        <ConfirmModal
          kind="logout"
          title="로그아웃할까요?"
          actions={[{ label: '로그아웃', tone: 'warn', onClick: () => { setLogoutOpen(false); onLogout(); } }]}
          onCancel={() => setLogoutOpen(false)}
        />
      )}
      {createOpen && <CreateRoom prefill={prefill} busy={creating} onCreate={onCreate} onClose={() => setCreateOpen(false)} />}
      {lockOpen && lock && (
        <LockedJoin
          lock={lock}
          onSubmit={(pin) => socket.emit('room.join', { roomId: lock.code, password: pin })}
          onClose={() => setLockOpen(false)}
        />
      )}
    </div>
  );
}
