// =============================================================================
// 참여자 칸 (R034 → ★ R035 개편 — 캐치마인드식 양옆 5칸 · 5칸)
//
// ★ R035 건우: "아이디를 키우고, '이 사람이 지금 이런 채팅을 쳤구나' 가 화면으로 더 잘 보였으면.
//               빈 자리와 계정 옆 번호는 필요 없다."
//   · 방장 = 칸 모서리 👑 / 나 = 테두리 색 + 이름 굵게 / 점수 = 구석에 숫자만
//   · 번호·"빈 자리" 글자 없음. 빈 칸은 흐린 빈 카드로 남긴다 (없애면 사람이 들어올 때마다 배치가 출렁인다)
//   · ★★ R039 — 칸에 채팅을 보이지 않고 **이모티콘**을 크게 (건우: "대화가 잘려 애매했다. 이모티콘 공간으로")
//   · ★ 정답 공개 때 정답자 칸도 반짝 — 정답자 연출이 양옆까지 이어진다
//
// ★★★ 경험자 정답 마스킹 — 칸의 메시지는 채팅 로그와 **같은 메시지 객체**를 같은 ChatText 로 그린다.
//   마스킹은 서버가 받는 사람마다 가려 보낸 본문에 이미 들어 있다 → 로그와 칸이 어긋날 수 없다.
// ★ 메시지는 칸 **안**에 둔다 — 가운데로 튀어나오면 문제 지문을 가린다.
// =============================================================================

import { nicknameFits } from '@quiz/shared';
import Avatar from './Avatar.js';
import Emoji from './Emoji.js';
import FitText from './FitText.js';
import type { PlayerView } from './useRoom.js';
import Icon from './Icon.js';
import { Crown } from 'lucide-react';

interface Props {
  player: PlayerView | null;
  me: boolean;
  /** 지금 문제를 이미 풀어 본 사람인가 (문제 진행 중에만) */
  experienced: boolean;
  /** 점수를 보여 줄까 (게임 중·결과) */
  showScore: boolean;
  /** 1등인가 (점수 > 0) */
  lead: boolean;
  /** 로비 — 경험률 문구 */
  rate: string | null;
  /** ★ R039 — 지금 띄울 이모티콘 (번호 + 메시지 id — 같은 이모티콘이라도 새로 보내면 다시 튄다) */
  emoji: { id: number; key: string } | null;
  /** ★ R039 — 순위 (점수가 있을 때) */
  rank: number | null;
  /** 방금 정답을 맞힌 사람인가 (반짝). 값이 바뀌면 다시 반짝인다 */
  winnerKey: number | null;
  /** ★ R041 — 방장이 이 칸을 누르면 강퇴/차단 팝업 (없으면 누를 수 없는 칸) */
  onPick?: () => void;
}

export default function Seat({
  player,
  me,
  experienced,
  showScore,
  lead,
  rate,
  emoji,
  rank,
  winnerKey,
  onPick,
}: Props) {
  if (!player) return <div className="seat-card empty" aria-hidden="true" />;

  const cls = [
    'seat-card',
    player.connected ? '' : 'offline',
    lead ? 'lead' : '',
    me ? 'mine' : '',
    winnerKey !== null ? 'winner' : '',
    onPick ? 'pickable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  // ★ R040 — 한도를 넘는 옛 닉네임: 바꾸기 전까지 게임 시작이 막힌다 → 방장도 누구 때문인지 본다
  const mustRename = !nicknameFits(player.nickname);
  const hasBadges = experienced || !player.connected || mustRename;
  return (
    <div
      key={winnerKey ?? 'seat'}
      className={cls}
      data-account={player.accountId}
      {...(onPick
        ? {
            role: 'button',
            tabIndex: 0,
            title: `${player.nickname} — 강퇴 · 차단`,
            onClick: onPick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick();
              }
            },
          }
        : {})}
    >
      {player.isHost && (
        <span className="crown" title="방장" aria-label="방장">
          <Icon icon={Crown} fill="currentColor" />
        </span>
      )}
      {showScore && (
        <span key={`${player.accountId}-${player.score}`} className="seat-score score mono">
          {rank !== null && <span className="seat-rank">{rank}위</span>}
          {player.score}
        </span>
      )}
      <div className="seat-top">
        <Avatar nickname={player.nickname} colorIndex={player.colorIndex} accountId={player.accountId} avatarV={player.avatarV} />
        {/* ★★ R040 — "…" 없이: 자리보다 길면 글자를 줄인다 (R041 한도 10칸 — 1536×864 에서 한글 10자 실측) */}
        <FitText text={player.nickname} className="nick seat-nick" style={{ color: `var(--p${player.colorIndex})` }} minPx={14} />
      </div>
      {hasBadges && (
        <div className="seat-badges">
          {experienced && (
            <span className="badge exp" title="이 문제를 이미 풀어 봤습니다 — 판정에서 빠지고 채팅의 정답은 가려집니다">
              경험
            </span>
          )}
          {!player.connected && <span className="badge off">접속 종료</span>}
          {mustRename && <span className="badge off">닉네임 변경 필요</span>}
        </div>
      )}
      {rate && <span className="seat-rate dim mono">{rate}</span>}
      {/* ★★ R039 — 칸의 가장 큰 자리 = 이모티콘. 나타날 때 튀어 오른다 (채팅은 채팅 로그에서만 — 건우 확인) */}
      <div className="seat-emoji" aria-live="polite">
        {emoji && (
          <span key={emoji.key} className="seat-emoji-pop">
            <Emoji id={emoji.id} size={64} />
          </span>
        )}
      </div>
    </div>
  );
}
