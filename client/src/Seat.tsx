// =============================================================================
// 참여자 칸 (R034 → ★ R035 개편 — 캐치마인드식 양옆 5칸 · 5칸)
//
// ★ R035 건우: "아이디를 키우고, '이 사람이 지금 이런 채팅을 쳤구나' 가 화면으로 더 잘 보였으면.
//               빈 자리와 계정 옆 번호는 필요 없다."
//   · 방장 = 칸 모서리 👑 / 나 = 테두리 색 + 이름 굵게 / 점수 = 구석에 숫자만
//   · 번호·"빈 자리" 글자 없음. 빈 칸은 흐린 빈 카드로 남긴다 (없애면 사람이 들어올 때마다 배치가 출렁인다)
//   · ★★ **마지막 메시지를 칸에 계속 보인다.** 새 메시지가 오면 반짝 (4초 뒤 사라지던 R034 방식을 바꿨다)
//   · ★ 정답 공개 때 정답자 칸도 반짝 — 정답자 연출이 양옆까지 이어진다
//
// ★★★ 경험자 정답 마스킹 — 칸의 메시지는 채팅 로그와 **같은 메시지 객체**를 같은 ChatText 로 그린다.
//   마스킹은 서버가 받는 사람마다 가려 보낸 본문에 이미 들어 있다 → 로그와 칸이 어긋날 수 없다.
// ★ 메시지는 칸 **안**에 둔다 — 가운데로 튀어나오면 문제 지문을 가린다.
// =============================================================================

import Avatar from './Avatar.js';
import ChatText from './ChatText.js';
import type { ChatView, PlayerView } from './useRoom.js';

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
  /** 이 사람의 마지막 메시지 */
  lastMsg: ChatView | null;
  /** 막 도착한 메시지인가 (반짝) */
  fresh: boolean;
  /** 방금 정답을 맞힌 사람인가 (반짝). 값이 바뀌면 다시 반짝인다 */
  winnerKey: number | null;
  canKick: boolean;
  onKick: () => void;
}

export default function Seat({
  player,
  me,
  experienced,
  showScore,
  lead,
  rate,
  lastMsg,
  fresh,
  winnerKey,
  canKick,
  onKick,
}: Props) {
  if (!player) return <div className="seat-card empty" aria-hidden="true" />;

  const cls = [
    'seat-card',
    player.connected ? '' : 'offline',
    lead ? 'lead' : '',
    me ? 'mine' : '',
    winnerKey !== null ? 'winner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const hasBadges = experienced || !player.connected || canKick;
  return (
    <div key={winnerKey ?? 'seat'} className={cls} data-account={player.accountId}>
      {player.isHost && (
        <span className="crown" title="방장" aria-label="방장">
          👑
        </span>
      )}
      {showScore && (
        <span key={`${player.accountId}-${player.score}`} className="seat-score score mono">
          {player.score}
        </span>
      )}
      <div className="seat-top">
        <Avatar nickname={player.nickname} colorIndex={player.colorIndex} accountId={player.accountId} avatarV={player.avatarV} />
        <span className="nick seat-nick" style={{ color: `var(--p${player.colorIndex})` }}>
          {player.nickname}
        </span>
      </div>
      {hasBadges && (
        <div className="seat-badges">
          {experienced && (
            <span className="badge exp" title="이 문제를 이미 풀어 봤습니다 — 판정에서 빠지고 채팅의 정답은 가려집니다">
              경험
            </span>
          )}
          {!player.connected && <span className="badge off">접속 종료</span>}
          {canKick && (
            <button type="button" className="tiny" onClick={onKick}>
              내보내기
            </button>
          )}
        </div>
      )}
      {rate && <span className="seat-rate dim mono">{rate}</span>}
      {lastMsg && (
        <div key={lastMsg.id} className={fresh ? 'seat-msg fresh' : 'seat-msg'}>
          <ChatText text={lastMsg.text} mine={me} masked={lastMsg.masked} />
        </div>
      )}
    </div>
  );
}
