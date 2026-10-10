// =============================================================================
// ★★★ 친구 초대 토스트 (R044 A-5 · 건우: "초대는 하단에 작게 토스트 — 거기에 수락/거절을")
//
// ★ 자리: 기존 알림 한 줄(Toast)과 같은 자리 · 같은 모양 (PC 아래 · 방 안 PC 는 입력 줄 위 · 모바일 방 안은 위).
// ★ "○○ 님이 초대했어요" + [수락] [거절] + ✕
//   수락 = 그 방으로 (지금 다른 방이면 App 이 "나가고 들어갈까요?" 확인) — 그 방에 들어가면 초대는 지운다
//   거절 = 초대를 지운다 (서버) / ✕ = 이 토스트만 닫는다 — 친구 창의 그 친구 줄에 "나를 초대했어요 [들어가기]" 는 남는다
// ★ (판단) 사람이 누를 때까지 남는다 — 저절로 사라지지 않는다. 방이 사라지면 함께 사라진다.
// ★ (판단) 여러 개면 **가장 최근 것 하나**만 보이고 "외 N개" 를 붙인다. 하나를 처리하면 다음 것이 보인다.
// ★★ 게임 중(카운트다운 · 문제 · 일시정지)에는 띄우지 않는다 — 친구 버튼 숫자 · ☰ 점만. 결과 · 로비로 오면 아직 살아 있는 초대가 그때 뜬다.
// =============================================================================

import { useState } from 'react';
import Avatar from './Avatar.js';
import { colorOf } from './FriendList.js';
import PopupClose from './PopupClose.js';
import type { Social } from './useSocial.js';

interface Props {
  social: Social;
  /** 게임 중이면 false */
  show: boolean;
  onAccept: (roomId: string) => void;
}

export default function InviteToast({ social, show, onAccept }: Props) {
  /** ✕ 로 닫은 초대 (이 화면에서만) */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const list = social.invites.filter((n) => !hidden.has(n.id));
  const cur = list[0];
  if (!show || !cur) return null;
  const hide = (id: string) => setHidden((prev) => new Set(prev).add(id));
  return (
    <div className="toast-layer invite-layer">
      <div className="toast invite-toast" role="status" data-notice={cur.id}>
        <Avatar nickname={cur.fromNickname} colorIndex={colorOf(cur.fromAccountId)} accountId={cur.fromAccountId} avatarV={cur.fromAvatarV} />
        <p className="invite-toast-text">
          <strong className="nick">{cur.fromNickname}</strong> 님이 초대했어요
          {list.length > 1 && <span className="dim"> · 외 {list.length - 1}개</span>}
        </p>
        <span className="invite-toast-actions">
          <button
            type="button"
            className="primary tiny"
            onClick={() => {
              hide(cur.id);
              onAccept(cur.roomId!);
            }}
          >
            수락
          </button>
          <button type="button" className="ghost tiny" onClick={() => social.dismiss(cur.id)}>
            거절
          </button>
        </span>
        <PopupClose onClose={() => hide(cur.id)} />
      </div>
    </div>
  );
}
