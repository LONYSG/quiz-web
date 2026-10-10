// =============================================================================
// ★★★ 모바일 ☰ 메뉴 (R042 · 건우 확정: 모바일 상단 = [방 제목] [👥 인원] [☰])
//
// ★ 건우: "모바일에 요소가 많아져 제목이 한 글자만 보이고 … 로 처리된다. 석 삼 자 메뉴에 몰아넣든지."
// ★ ☰ 안: 초대 · 프로필(대기실에서만) · 설정 · 안내 · 나가기. 👥 는 게임 중 자주 보므로 밖에 둔다.
// ★ 팝업은 하나 (popup.ts) — 항목을 누르면 그 창(설정 · 안내 · 프로필 · 나가기 확인)이 이 자리를 넘겨받는다.
//   초대는 링크를 복사하고 메뉴에 "복사됨" 을 잠깐 보인다.
// =============================================================================

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Info, Link, LogOut, Pencil, Settings, UserPlus } from 'lucide-react';
import PopupClose from './PopupClose.js';
import Icon from './Icon.js';

interface Props {
  canRename: boolean;
  onInvite: () => void;
  /** ★ R043 C — 친구 · 알림 */
  onFriends: () => void;
  onNotices: () => void;
  noticeCount: number;
  friendWaiting: number;
  onProfile: () => void;
  onSettings: () => void;
  onInfo: () => void;
  onLeave: () => void;
  onClose: () => void;
}

export default function MobileMenu({ canRename, onInvite, onFriends, onNotices, noticeCount, friendWaiting, onProfile, onSettings, onInfo, onLeave, onClose }: Props) {
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

  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal menu-modal" role="dialog" aria-label="메뉴">
        <div className="pop-head">
          <p className="pop-title">메뉴</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="menu-list" data-arrow-nav>
          <button type="button" className="menu-item" onClick={onInvite}>
            <Icon icon={Link} /> 초대
          </button>
          <button type="button" className="menu-item" onClick={onFriends}>
            <Icon icon={UserPlus} /> 친구
            {friendWaiting > 0 && <span className="count-badge inline">{friendWaiting}</span>}
          </button>
          <button type="button" className="menu-item" onClick={onNotices}>
            <Icon icon={Bell} /> 알림
            {noticeCount > 0 && <span className="count-badge inline">{noticeCount > 9 ? '9+' : noticeCount}</span>}
          </button>
          {canRename && (
            <button type="button" className="menu-item" onClick={onProfile}>
              <Icon icon={Pencil} /> 프로필
            </button>
          )}
          <button type="button" className="menu-item" onClick={onSettings}>
            <Icon icon={Settings} /> 설정
          </button>
          <button type="button" className="menu-item" onClick={onInfo}>
            <Icon icon={Info} /> 안내
          </button>
          <button type="button" className="menu-item danger-text" onClick={onLeave}>
            <Icon icon={LogOut} /> 나가기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
