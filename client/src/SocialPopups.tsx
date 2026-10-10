// =============================================================================
// ★★★ 친구 창 · 🔔 알림 창 (R043 C) — 상단 바 버튼 + 팝업
//
// ★ 팝업은 한 번에 하나 (popup.ts 'friends' · 'notices') · ✕ 같은 자리(PopupClose) · Esc 닫기
// ★ PC: 버튼 아래 고정 자리(설정 ⚙ · 초대 창과 같은 모양) / 모바일: 화면 가운데 (버튼은 ☰ 안에 있다)
// ★ 🔔 숫자 = 읽지 않은 알림. 창을 열면 모두 읽음이 된다 — 연 순간 새것이던 줄은 점으로 표시해 둔다.
// ★★ 알림 줄도 쪽 넘기기 (칸 안 스크롤 없음 — 0장 원칙 3)
// ★ 지난 초대(방이 사라짐)는 서버가 목록을 보낼 때 지운다.
// ★★★ R044 A-3 (건우) — 🔔 알림은 **화면에서 뺐다** (친구 창과 기능이 겹친다). BellButton 은 지우지 않고 남겨 둔다 —
//   쓰는 곳(Lobby 상단 바 · App 방 목록 화면 · MobileMenu 의 알림 줄)을 주석으로 막았다. 되살리는 법 07-DECISIONS D-214.
// ★ R044 B — 닫기 규칙은 useDismiss 한 곳 (✕ · 바깥 누르기 · Esc)
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, UserPlus, X } from 'lucide-react';
import Avatar from './Avatar.js';
import BusyButton from './BusyButton.js';
import FitText from './FitText.js';
import FriendList, { colorOf } from './FriendList.js';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { usePopup } from './popup.js';
import { useDismiss } from './useDismiss.js';
import type { NotificationView, Social } from './useSocial.js';

const isMobile = () => window.matchMedia('(max-width: 999px)').matches;

/** 친구 버튼 + 창 (방 안). 모바일에서는 버튼을 숨기고 ☰ 의 "친구" 가 같은 창을 연다 */
export function FriendsButton({ social, inRoom, onJoin }: { social: Social; inRoom: Set<string>; onJoin: (roomId: string) => void }) {
  const [open, setOpen] = usePopup('friends');
  const close = () => setOpen(false);
  useDismiss(open, close, '.social');
  // ★ R044 A-4 — 숫자 = 받은 신청 + 받은 초대 (🔔 대신 여기 하나)
  const waiting = social.pending;
  return (
    <span className="social">
      <button type="button" id="friends-btn" className="ghost tiny" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon icon={UserPlus} />
        <span className="lbl">친구</span>
        {waiting > 0 && <span className="count-badge">{waiting}</span>}
      </button>
      {open && (
        <div className="social-pop friends-pop" role="dialog" aria-label="친구">
          <div className="pop-head">
            <p className="pop-title">친구</p>
            <PopupClose onClose={close} />
          </div>
          <FriendList
            social={social}
            mode="room"
            inRoom={inRoom}
            pageSize={isMobile() ? 5 : 6}
            onJoin={(id) => {
              close();
              onJoin(id);
            }}
          />
        </div>
      )}
    </span>
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

function NoticeRow({ n, fresh, social, onJoin }: { n: NotificationView; fresh: boolean; social: Social; onJoin: (roomId: string) => void }) {
  const pending = n.kind === 'friend_request' && social.incoming.some((f) => f.accountId === n.fromAccountId);
  const text =
    n.kind === 'friend_request' ? '친구 신청을 보냈어요' : n.kind === 'friend_accepted' ? '친구가 됐어요' : n.roomCode ? `${n.roomCode.slice(0, 3)} ${n.roomCode.slice(3)} 방으로 초대했어요` : '방으로 초대했어요';
  return (
    <li data-notice={n.id} data-kind={n.kind}>
      <div className={fresh ? 'people-row notice-row fresh' : 'people-row notice-row'}>
        <Avatar nickname={n.fromNickname} colorIndex={colorOf(n.fromAccountId)} accountId={n.fromAccountId} avatarV={n.fromAvatarV} />
        <span className="people-name">
          <FitText text={n.fromNickname} className="nick" minPx={12} />
          <span className="people-sub">
            {text} · {ago(n.createdAt)}
          </span>
        </span>
        <span className="row-actions">
          {pending && (
            <>
              <BusyButton className="primary tiny" busy={social.busy === `respond:${n.fromAccountId}`} onClick={() => social.respond(n.fromAccountId, true)}>
                수락
              </BusyButton>
              <button type="button" className="ghost tiny" onClick={() => social.respond(n.fromAccountId, false)}>
                거절
              </button>
            </>
          )}
          {n.kind === 'room_invite' && n.roomId && (
            <button type="button" className="primary tiny" onClick={() => onJoin(n.roomId!)}>
              들어가기
            </button>
          )}
          {!pending && (
            <button type="button" className="ghost tiny icon-only" aria-label="알림 지우기" onClick={() => social.dismiss(n.id)}>
              <Icon icon={X} />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/** 🔔 버튼 + 알림 창. 모바일에서는 버튼을 숨기고 ☰ 의 "알림" 이 같은 창을 연다 */
export function BellButton({ social, onJoin }: { social: Social; onJoin: (roomId: string) => void }) {
  const [open, setOpen] = usePopup('notices');
  const close = () => setOpen(false);
  useDismiss(open, close, '.social');
  const [page, setPage] = useState(0);
  // 연 순간 읽지 않았던 알림 (창이 열려 있는 동안 점으로 남긴다)
  const freshIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    freshIds.current = new Set(social.notifications.filter((n) => !n.read).map((n) => n.id));
    setPage(0);
    if (social.unread > 0) social.readAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const size = isMobile() ? 5 : 6;
  const pages = Math.max(1, Math.ceil(social.notifications.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = social.notifications.slice(cur * size, cur * size + size);
  return (
    <span className="social">
      <button
        type="button"
        id="bell-btn"
        className="ghost tiny"
        aria-label={social.unread > 0 ? `알림 ${social.unread}개` : '알림'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={Bell} />
        {social.unread > 0 && <span className="count-badge">{social.unread > 9 ? '9+' : social.unread}</span>}
      </button>
      {open && (
        <div className="social-pop notices-pop" role="dialog" aria-label="알림">
          <div className="pop-head">
            <p className="pop-title">알림</p>
            <PopupClose onClose={close} />
          </div>
          {social.notifications.length === 0 ? (
            <p className="list-empty dim">새 알림이 없어요.</p>
          ) : (
            <>
              <ul className="people-list">
                {shown.map((n) => (
                  <NoticeRow
                    key={n.id}
                    n={n}
                    fresh={freshIds.current.has(n.id)}
                    social={social}
                    onJoin={(id) => {
                      close();
                      onJoin(id);
                    }}
                  />
                ))}
              </ul>
              {pages > 1 && (
                <div className="list-head pager-only">
                  <span className="pager">
                    <button type="button" className="ghost tiny pager-btn" aria-label="앞 쪽" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                      <Icon icon={ChevronLeft} />
                    </button>
                    <span className="mono">
                      {cur + 1}/{pages}
                    </span>
                    <button type="button" className="ghost tiny pager-btn" aria-label="다음 쪽" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
                      <Icon icon={ChevronRight} />
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
