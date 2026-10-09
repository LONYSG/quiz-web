// =============================================================================
// 결과 화면 (guide 38·39절)
//
// ★★ R035 — **순위 카드 하나**만 둔다. 건우: "마지막 문제 정답은 이미 정답 공개를 거친다 / 정답 속도는 뭐에 쓰는지
//   모르겠다 / 문제별 기록도 굳이 필요 없다. 순위만 잘 보이게."
//   ★ 문제별 기록·사람별 요약은 서버가 여전히 만들어 보낸다(game.result) — 화면에서만 뺐다. 되살리기 쉽다.
// ★ 동점자는 공동 순위 (guide 39절) · 접속 종료자 표시 · 다시 하기(5초 뒤 바로 시작) / 로비로.
// =============================================================================

import type { Socket } from 'socket.io-client';
import Avatar from './Avatar.js';
import FitText from './FitText.js';
import type { GameResultView, PlayerView } from './useRoom.js';

interface Props {
  socket: Socket;
  /** ★ R039 — 프로필 사진을 찾으려고 */
  players: PlayerView[];
  result: GameResultView;
  isHost: boolean;
  myAccountId: string;
}

/** 종료 사유 안내. ★ 사용자가 읽을 문장으로 만든다. 코드값을 그대로 보여주지 않는다 */
function endReasonText(reason: string): string {
  switch (reason) {
    case 'completed':
      return '설정한 문제를 모두 진행했습니다.';
    case 'force_ended':
      return '방장이 게임을 강제 종료했습니다.';
    case 'no_questions':
      return '출제할 수 있는 문제가 소진되어 조기 종료되었습니다.';
    case 'abandoned':
      return '일시정지가 길어져 게임이 종료되었습니다.';
    case 'server_restart':
      return '서버가 재시작되어 게임이 종료되었습니다.';
    default:
      return '게임이 종료되었습니다.';
  }
}

export default function GameResult({ socket, players, result, isHost, myAccountId }: Props) {
  const champs = result.ranking.filter((r) => r.rank === 1 && r.score > 0);
  // ★ 사람이 많으면 순위를 두 줄로 나눠 세로를 아낀다 (스크롤 없음 — R035)
  const twoCols = result.ranking.length > 5;
  // ★ 종료 사유는 "설정한 문제를 다 했다" 가 아닐 때만 진행 알림으로 남긴다 (설명은 ⓘ)
  const notice =
    result.endReason === 'completed' ? null : result.abortedNote ?? endReasonText(result.endReason);

  // ★★ R035 — 결과 화면은 **순위 카드 하나**. 마지막 문제 정답 · 응답 속도 · 문제별 기록을 지웠다 (건우: "순위만 잘 보이게")
  return (
    <section className="card result-card">
      {champs.length > 0 && (
        <div className="champion">
          <span className="champion-trophy" aria-hidden="true">
            🏆
          </span>
          <div className="champion-names">
            <p className="winner-label">{champs.length > 1 ? '공동 우승!' : '우승!'}</p>
            <p className="champion-name">
              {champs.map((c, i) => (
                <span key={c.accountId} style={{ color: `var(--p${c.colorIndex})` }}>
                  {i > 0 && ' · '}
                  {c.nickname}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      <ol className={twoCols ? 'ranking two' : 'ranking'}>
        {result.ranking.map((r) => (
          <li
            key={r.accountId}
            className={
              [r.connected ? '' : 'offline', r.rank === 1 && r.score > 0 ? 'first' : '', r.accountId === myAccountId ? 'mine' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            {/* ★ 동점자는 공동 순위다 (guide 39절). 서버가 계산해 보낸다 */}
            <span className="rank mono">
              {r.score > 0 && r.rank <= 3 ? (
                <span className="medal" aria-hidden="true">
                  {['🥇', '🥈', '🥉'][r.rank - 1]}
                </span>
              ) : null}{' '}
              {r.rank}위
            </span>
            <Avatar nickname={r.nickname} colorIndex={r.colorIndex} accountId={r.accountId} avatarV={players.find((p) => p.accountId === r.accountId)?.avatarV} />
            <FitText text={r.nickname} className="nick" style={{ color: `var(--p${r.colorIndex})` }} minPx={11} />
            {!r.connected && <span className="badge off">접속 종료</span>}
            <span className="score mono">{r.score}점</span>
          </li>
        ))}
      </ol>

      {notice && <p className="info">{notice}</p>}

      <div className="next-row" data-arrow-nav>
        {isHost ? (
          <>
            {/* ★★ R035 — 다시 하기 = 같은 설정으로 **5초 뒤 바로 시작** / 로비로 = 설정을 바꾸러 간다 */}
            <button type="button" className="primary big-btn" autoFocus onClick={() => socket.emit('game.again', {})}>
              🔁 다시 하기
            </button>
            <button type="button" className="ghost" onClick={() => socket.emit('game.toLobby', {})}>
              로비로
            </button>
          </>
        ) : (
          <p className="note">방장이 다음 게임을 준비 중입니다.</p>
        )}
      </div>
    </section>
  );
}
