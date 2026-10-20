// =============================================================================
// 아바타 (R033) — 닉네임 첫 글자 + 플레이어 색. 캐치마인드의 캐릭터 자리를 대신한다.
// ★ 색만으로 사람을 가르지 않는다 — 글자가 함께 있어 색약에도 구분된다 (Q-34 의 그 부분은 유지).
// ★★ R039 — 프로필 사진이 있으면 사진(원형). 주소에 버전(?v=)을 붙여 바뀌면 새로 받는다.
//   사진을 못 불러오면 첫 글자로 돌아간다.
// ★★ R056 — zoom 이면 누를 때 프로필 카드(사진 크게 · 업적 — PersonCard). 감싼 칸(참여자 칸의 강퇴 · 친구 신청)으로 번지지 않게 막고,
//   입력창(답안) 포커스를 빼앗지 않는다.
// =============================================================================

import { useState } from 'react';
import { openPersonCard } from './PersonCard.js';

interface Props {
  nickname: string;
  colorIndex: number;
  large?: boolean;
  /** 아주 작게 (채팅 줄) */
  xs?: boolean;
  accountId?: string;
  /** 사진 버전. 없으면(null/undefined) 첫 글자 */
  avatarV?: number | null;
  /** ★ R056 — 누르면 프로필 카드 */
  zoom?: boolean;
}

export default function Avatar({ nickname, colorIndex, large, xs, accountId, avatarV, zoom }: Props) {
  const [broken, setBroken] = useState(false);
  const initial = [...nickname.trim()][0]?.toUpperCase() ?? '?';
  const canZoom = Boolean(zoom && accountId);
  const cls = ['avatar', large ? 'lg' : '', xs ? 'xs' : '', canZoom ? 'zoomable' : ''].filter(Boolean).join(' ');
  const click = canZoom
    ? {
        role: 'button',
        'aria-label': `${nickname} 프로필`,
        'aria-hidden': undefined,
        title: `${nickname} 프로필`,
        'data-person': accountId,
        onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          openPersonCard({ accountId: accountId!, nickname, colorIndex, avatarV: broken ? null : avatarV });
        },
      }
    : {};
  if (accountId && avatarV && !broken) {
    return (
      <img
        className={`${cls} photo`}
        src={`/api/avatar/${accountId}?v=${avatarV}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setBroken(true)}
        {...click}
      />
    );
  }
  return (
    <span className={cls} style={{ background: `var(--p${colorIndex})` }} aria-hidden="true" {...click}>
      {initial}
    </span>
  );
}
