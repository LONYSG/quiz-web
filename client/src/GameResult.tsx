// =============================================================================
// 결과 화면 (guide 38·39절)
//
// ★★ TEMP-P4-01 — 이 화면은 **Phase 4 범위**다.
//   ★ Phase 3 에서는 "게임이 끝났는데 아무 화면도 없다" 를 피하기 위한 최소 형태만 만든다.
//     · 순위 / 닉네임(색상) / 점수 / 접속 상태          ← 있다
//     · 마지막 문제 정답 (Q-17)                          ← 있다
//     · 종료 사유 안내                                   ← 있다
//     · 다시 하기 / 로비로                               ← 있다 (서버 동작이 동일하다)
//     · ★ 통계 / 문제별 정답자 / 애니메이션 / 공유       ← Phase 4
//   ★ Phase 4 에서 이 파일을 다시 만든다. grep TEMP-P4 로 찾을 수 있다.
//
// ★ 왜 최소 형태라도 지금 만드는가 (R007 교훈)
//   ★ R007 에서 건우가 "결과 화면이 없는 것" 을 결함으로 오해한 일이 있다.
//   ★ 화면이 아예 없으면 "게임이 끝났는데 멈췄다" 와 구분되지 않는다.
//     그래서 최소한 순위와 다음 행동은 보여준다.
// =============================================================================

import type { Socket } from 'socket.io-client';
import type { GameResultView } from './useRoom.js';

interface Props {
  socket: Socket;
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

export default function GameResult({ socket, result, isHost, myAccountId }: Props) {
  return (
    <>
      <section className="card result-card">
        <h2>게임 결과</h2>

        {/* ★★ 마지막 문제의 정답을 상단에 표시한다 (Q-17 확정).
            ★ 마지막 문제는 5초 대기를 생략하므로 정답을 볼 기회가 여기밖에 없다. */}
        {result.lastQuestionReveal && (
          <div className="last-reveal">
            <p className="note dim">마지막 문제 ({result.lastQuestionReveal.index}번)</p>
            <p className="q-text small">{result.lastQuestionReveal.text}</p>
            <p className="reveal-answer">
              정답 <strong>{result.lastQuestionReveal.displayAnswer}</strong>
            </p>
            {result.lastQuestionReveal.explanation && (
              <p className="note">{result.lastQuestionReveal.explanation}</p>
            )}
          </div>
        )}

        <ol className="ranking">
          {result.ranking.map((r) => (
            <li key={r.accountId} className={r.connected ? undefined : 'offline'}>
              {/* ★ 동점자는 공동 순위다 (guide 39절). 서버가 계산해 보낸다 */}
              <span className="rank mono">{r.rank}위</span>
              <span className="nick" style={{ color: `var(--p${r.colorIndex})` }}>
                {r.nickname}
              </span>
              {r.accountId === myAccountId && <span className="badge me">나</span>}
              {!r.connected && <span className="badge off">접속 종료</span>}
              <span className="score mono">{r.score}점</span>
            </li>
          ))}
        </ol>

        <p className="note">
          {endReasonText(result.endReason)}{' '}
          <span className="dim mono">
            ({result.endedQuestionCount} / {result.totalQuestions}문제 진행)
          </span>
        </p>
        {result.abortedNote && <p className="info">{result.abortedNote}</p>}

        {/* ★ Phase 3 의 범위를 정직하게 알린다 (D-030 규칙: 없는 것을 밝힌다) */}
        <p className="note dim">
          ★ 이 화면은 <strong>Phase 4 에서 다시 만듭니다.</strong> 지금은 순위와 다음 행동만
          있습니다. 문제별 정답자·통계는 아직 없는 것이 정상입니다.
        </p>
      </section>

      <section className="card">
        <h2>다음</h2>
        {isHost ? (
          <>
            <div className="field-row">
              {/* ★★ 두 버튼의 서버 동작은 동일하다 (04-PROTOCOL T30/T31).
                  ★ UI 차이만 둔다 — 다시 하기는 곧 시작할 의도, 로비로는 설정을 볼 의도.
                  ★ 어느 쪽도 게임을 자동으로 시작하지 않는다 (guide 38절). */}
              <button type="button" autoFocus onClick={() => socket.emit('game.again', {})}>
                다시 하기 <kbd>Alt+A</kbd>
              </button>
              <button type="button" className="ghost" onClick={() => socket.emit('game.toLobby', {})}>
                로비로 <kbd>Alt+L</kbd>
              </button>
            </div>
            <p className="note">
              직전 게임의 설정값이 복원됩니다. <strong>게임은 자동으로 시작되지 않습니다.</strong>{' '}
              로비에서 시작 버튼을 눌러 주세요.
              <br />
              경험 기록은 유지됩니다. 다음 게임의 문제는 갱신된 경험 기록을 반영해 새로
              선정됩니다.
            </p>
          </>
        ) : (
          <p className="note">방장이 다음 게임을 준비 중입니다.</p>
        )}
      </section>
    </>
  );
}
