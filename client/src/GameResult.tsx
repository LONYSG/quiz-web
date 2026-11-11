// =============================================================================
// 결과 화면 (guide 38·39절)
//
// ★★ R035 — **순위 카드 하나**만 둔다. 건우: "마지막 문제 정답은 이미 정답 공개를 거친다 / 정답 속도는 뭐에 쓰는지
//   모르겠다 / 문제별 기록도 굳이 필요 없다. 순위만 잘 보이게."
//   ★ 문제별 기록·사람별 요약은 서버가 여전히 만들어 보낸다(game.result) — 화면에서만 뺐다. 되살리기 쉽다.
// ★ 동점자는 공동 순위 (guide 39절) · 접속 종료자 표시 · 다시 하기(5초 뒤 바로 시작) / 로비로.
// =============================================================================

import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import Avatar from './Avatar.js';
import FitText from './FitText.js';
import type { GameResultView, PlayerView } from './useRoom.js';
import Icon from './Icon.js';
import { ResultFeedback } from './QuestionFeedback.js';
import { SongResultList } from './SongStage.js';
import { RotateCcw } from 'lucide-react';
import { TeamResultLine, TeamTag } from './Team.js';
import type { Team } from '@quiz/shared';

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
  // ★★★ R057 — 미니게임만 판: 점수 = 미니게임 순위 점수 합 · 문제 평가 없음
  const mgOnly = result.mode === 'minigame';
  const champs = result.ranking.filter((r) => r.rank === 1 && r.score > 0);
  // ★ 사람이 많으면 순위를 두 줄로 나눠 세로를 아낀다 (스크롤 없음 — R035)
  const twoCols = result.ranking.length > 5;
  // ★ 종료 사유는 "설정한 문제를 다 했다" 가 아닐 때만 진행 알림으로 남긴다 (설명은 ⓘ)
  // ★★★ R079 — 팀전 판: 순위 위 팀 줄 · 행에 팀 태그
  const teams = result.teams ?? null;
  const teamOf = (id: string): Team | null => (teams ? (teams.blue.members.includes(id) ? 'blue' : teams.red.members.includes(id) ? 'red' : null) : null);
  // ★ R079 — 내 팀이 보너스를 받았으면 포인트샵 잔액을 다시 읽게(지급은 서버가 판 끝에 쓴다 — 조금 뒤)
  const myBonus = teams && teams.winner && teams.bonus > 0 && teamOf(myAccountId) === teams.winner;
  useEffect(() => {
    if (!myBonus) return undefined;
    const t = window.setTimeout(() => window.dispatchEvent(new Event('qw:grants')), 1500);
    return () => window.clearTimeout(t);
  }, [myBonus, result.gameId]);
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

      {teams && <TeamResultLine teams={teams} mine={teamOf(myAccountId)} />}

      {mgOnly && (
        <p className="dim mg-result-sub">
          {/* ★ R063 (D-259) — 계산식은 적지 않는다(찬종 #17) */}
          미니게임만 · {result.minigameSeries?.done ?? 0}개
        </p>
      )}

      <ol className={twoCols ? 'ranking two' : 'ranking'}>
        {result.ranking.map((r) => (
          <li
            key={r.accountId}
            className={
              [r.connected ? '' : 'offline', r.rank === 1 && r.score > 0 ? 'first' : '', r.accountId === myAccountId ? 'mine' : '', teams && teamOf(r.accountId) ? `team-${teamOf(r.accountId)}` : '']
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
            <Avatar nickname={r.nickname} colorIndex={r.colorIndex} accountId={r.accountId} avatarV={players.find((p) => p.accountId === r.accountId)?.avatarV} zoom />
            <FitText text={r.nickname} className="nick" style={{ color: `var(--p${r.colorIndex})` }} minPx={11} />
            {teams && teamOf(r.accountId) && <TeamTag team={teamOf(r.accountId)!} small />}
            {!r.connected && <span className="badge off">접속 종료</span>}
            <span className="score mono">{r.score}점</span>
          </li>
        ))}
      </ol>

      {notice && <p className="info">{notice}</p>}

      {/* ★★★ R056 — 이번 판 문제 평가(접이식 · 기본 펼침) — 정답 공개 때 못 누른 사람 · 기타 의견 */}
      {/* ★ R082 — 라이어 판은 문제가 없다 */}
      {result.gameId && !mgOnly && result.mode !== 'liar' && result.mode !== 'draw' && result.mode !== 'song' && <ResultFeedback gameId={result.gameId} />}
      {/* ★★★ R096 — 노래 맞히기 판: 곡별 누가 맞혔나 한 줄(못 맞힌 곡도 제목 공개) */}
      {result.mode === 'song' && <SongResultList questions={result.questions} players={players} />}

      <div className="next-row" data-arrow-nav>
        {isHost ? (
          <>
            {/* ★★ R035 — 다시 하기 = 같은 설정으로 **5초 뒤 바로 시작** / 로비로 = 설정을 바꾸러 간다 */}
            <button type="button" className="primary big-btn" autoFocus onClick={() => socket.emit('game.again', {})}>
              <Icon icon={RotateCcw} /> 다시 하기
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
