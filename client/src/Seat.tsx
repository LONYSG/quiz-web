// =============================================================================
// 참여자 칸 (R034 — 캐치마인드식 배치: 왼쪽 5칸 · 오른쪽 5칸)
//
// ★ 건우: "가운데 문제, 양옆에 참여자 칸. 참여자 칸에 최근 채팅이 말풍선으로 잠깐 뜨게.
//          점수·접속 종료·방장·경험자도 칸에서 보이게."
//
// ★★★ 말풍선에도 경험자 정답 마스킹이 걸려야 한다.
//   → 말풍선은 **채팅 로그와 같은 메시지 객체**를 같은 ChatText 로 그린다.
//     ★ 마스킹은 서버가 받는 사람마다 다르게 보낸 본문(센티널 포함)에 이미 들어 있다.
//       말풍선이 따로 문자열을 만들지 않으므로 로그와 말풍선이 어긋날 수 없다.
//
// ★ 말풍선은 칸 **안**에 뜬다. 가운데 문제 칸으로 튀어나가면 지문을 가린다 (30~40초 승부).
// =============================================================================

import Avatar from './Avatar.js';
import ChatText from './ChatText.js';
import type { ChatView, PlayerView } from './useRoom.js';

interface Props {
  seatNo: number;
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
  bubble: ChatView | null;
  canKick: boolean;
  onKick: () => void;
}

export default function Seat({
  seatNo,
  player,
  me,
  experienced,
  showScore,
  lead,
  rate,
  bubble,
  canKick,
  onKick,
}: Props) {
  if (!player) {
    return (
      <div className="seat-card empty" aria-hidden="true">
        <span className="seat-no">{seatNo}</span>
        <span className="seat-empty">빈 자리</span>
      </div>
    );
  }
  const cls = ['seat-card', player.connected ? '' : 'offline', lead ? 'lead' : '', me ? 'mine' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-account={player.accountId}>
      <div className="seat-top">
        {/* ★ 색약을 고려해 자리 번호를 함께 둔다 (Q-34 의 이 부분은 유지) */}
        <span className="seat-no">{seatNo}</span>
        <Avatar nickname={player.nickname} colorIndex={player.colorIndex} />
        <span className="nick seat-nick" style={{ color: `var(--p${player.colorIndex})` }}>
          {player.nickname}
        </span>
        {showScore && (
          <span key={`${player.accountId}-${player.score}`} className="seat-score score mono">
            {player.score}
          </span>
        )}
      </div>
      <div className="seat-badges">
        {player.isHost && <span className="badge host">방장</span>}
        {me && <span className="badge me">나</span>}
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
        {rate && <span className="seat-rate dim mono">{rate}</span>}
      </div>
      {bubble && (
        <div key={bubble.id} className="bubble">
          <ChatText text={bubble.text} mine={me} masked={bubble.masked} />
        </div>
      )}
    </div>
  );
}
