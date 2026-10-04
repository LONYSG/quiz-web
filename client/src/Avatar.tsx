// =============================================================================
// 아바타 (R033) — 닉네임 첫 글자 + 플레이어 색. 캐치마인드의 캐릭터 자리를 대신한다.
// ★ 색만으로 사람을 가르지 않는다 — 글자가 함께 있어 색약에도 구분된다 (Q-34 의 그 부분은 유지).
// =============================================================================

interface Props {
  nickname: string;
  colorIndex: number;
  large?: boolean;
}

export default function Avatar({ nickname, colorIndex, large }: Props) {
  const initial = [...nickname.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span
      className={large ? 'avatar lg' : 'avatar'}
      style={{ background: `var(--p${colorIndex})` }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
