// =============================================================================
// 아바타 (R033) — 닉네임 첫 글자 + 플레이어 색. 캐치마인드의 캐릭터 자리를 대신한다.
// ★ 색만으로 사람을 가르지 않는다 — 글자가 함께 있어 색약에도 구분된다 (Q-34 의 그 부분은 유지).
// ★★ R039 — 프로필 사진이 있으면 사진(원형). 주소에 버전(?v=)을 붙여 바뀌면 새로 받는다.
//   사진을 못 불러오면 첫 글자로 돌아간다.
// =============================================================================

import { useState } from 'react';

interface Props {
  nickname: string;
  colorIndex: number;
  large?: boolean;
  /** 아주 작게 (채팅 줄) */
  xs?: boolean;
  accountId?: string;
  /** 사진 버전. 없으면(null/undefined) 첫 글자 */
  avatarV?: number | null;
}

export default function Avatar({ nickname, colorIndex, large, xs, accountId, avatarV }: Props) {
  const [broken, setBroken] = useState(false);
  const initial = [...nickname.trim()][0]?.toUpperCase() ?? '?';
  const cls = ['avatar', large ? 'lg' : '', xs ? 'xs' : ''].filter(Boolean).join(' ');
  if (accountId && avatarV && !broken) {
    return (
      <img
        className={`${cls} photo`}
        src={`/api/avatar/${accountId}?v=${avatarV}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={cls} style={{ background: `var(--p${colorIndex})` }} aria-hidden="true">
      {initial}
    </span>
  );
}
