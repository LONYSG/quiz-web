// =============================================================================
// 결과 화면 (guide 38·39·40절) — ★★ Phase 4 본체 (R016)
//
// ★ R014 의 최소 형태(임시 구현)를 대체한다. 그때 없던 것 —
//   · ★ 문제별 정답자와 응답 시간 (guide 40절 4·5번)
//   · ★ 사람별 정답 수 / 평균 정답 시간 / 최속 기록
//   · ★ 종료 사유를 네 갈래로 구분해 안내
//
// ★★ 무엇을 넣지 않았는가 — 그리고 그 근거 (중요하다)
//   guide 40절의 통계 후보 9종 중 **한 게임 안에서 의미가 닫히는 것만** 넣었다.
//   ★ 카테고리별 성적 / 누적 정답률 / 게임 참가 기록 / 경험 기록은
//     **여러 게임에 걸친 값**이라 한 게임의 결과 화면에서 읽을 수 있는 정보가 아니다.
//     ★ 그것들은 개인 통계 화면의 몫이다 (09-BACKLOG. 원천 데이터는 이미 전부 쌓이고 있다).
//   ★★ 그리고 전부 넣으면 건우의 "스크롤 없이 한 화면" 목표와 정면으로 충돌한다.
//
// ★ 문제 목록은 **고정 높이 + 내부 스크롤**이다.
//   ★ 근거: 문제 수가 최대 200이다. 문서를 늘리면 화면 하나에 절대 들어오지 않는다.
//     ★ 바깥(문서)이 늘어나지 않으므로 "스크롤 없이 한 화면" 규칙을 지킨다.
//
// ★★ 중단된 문제의 정답은 보여주지 않는다.
//   ★ 아무도 정답을 보지 못했고 경험 기록도 남지 않았다 (Q-47).
//     ★ 여기서 정답을 보여주면 "경험 기록 없이 정답만 아는" 사람이 생긴다.
//       그 문제가 다음 게임에 다시 나오면 그 사람만 유리하다.
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

/** 문제 하나가 어떻게 끝났는지 */
function reasonLabel(reason: string): string {
  switch (reason) {
    case 'correct':
      return '정답';
    case 'timeout':
      return '시간 종료';
    case 'skip_vote':
      return '투표로 넘김';
    case 'host_skip':
      return '방장이 넘김';
    case 'aborted':
      return '중단됨';
    default:
      return reason;
  }
}

/** ★ 응답 시간은 소수점 한 자리까지만 (Q-83 의 취지 — 읽는 값은 간결하게) */
function sec(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}초`;
}

export default function GameResult({ socket, result, isHost, myAccountId }: Props) {
  const nameOf = (accountId: string | null) =>
    result.ranking.find((r) => r.accountId === accountId) ?? null;
  const statOf = (accountId: string) =>
    result.playerStats.find((s) => s.accountId === accountId) ?? null;

  return (
    <>
      {/* ★★ 순위와 문제별 기록을 **나란히** 놓는다 (R016 / 한 화면 목표).
          ★ 근거: 세로로 쌓으면 결과 화면이 뷰포트를 넘는다. 실측 1.10배였다.
            ★ 둘 다 "게임이 어떻게 끝났는가" 를 읽는 정보라 나란히 두는 것이 자연스럽다.
          ★ 좁은 화면에서는 자동으로 한 열로 돌아간다. */}
      <div className="result-grid">
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
          {result.ranking.map((r) => {
            const s = statOf(r.accountId);
            return (
              <li key={r.accountId} className={r.connected ? undefined : 'offline'}>
                {/* ★ 동점자는 공동 순위다 (guide 39절). 서버가 계산해 보낸다 */}
                <span className="rank mono">{r.rank}위</span>
                <span className="nick" style={{ color: `var(--p${r.colorIndex})` }}>
                  {r.nickname}
                </span>
                {r.accountId === myAccountId && <span className="badge me">나</span>}
                {!r.connected && <span className="badge off">접속 종료</span>}
                <span className="score mono">{r.score}점</span>
                {/* ★ 사람별 요약. 맞힌 것이 없으면 자리를 차지하지 않는다 */}
                {s && s.correct > 0 && (
                  <span className="pstat dim mono">
                    평균 {sec(s.avgResponseMs)} · 최속 {sec(s.fastestMs)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <p className="note">
          {endReasonText(result.endReason)}{' '}
          <span className="dim mono">
            ({result.endedQuestionCount} / {result.totalQuestions}문제 진행)
          </span>
        </p>
        {result.abortedNote && <p className="info">{result.abortedNote}</p>}
      </section>

      {/* ── ★★ 문제별 기록 (guide 40절 4·5번) */}
      {result.questions.length > 0 && (
        <section className="card qlog-card">
          <h2>
            문제별 기록 <span className="dim mono">{result.questions.length}문제</span>
          </h2>
          <ol className="qlog">
            {result.questions.map((q) => {
              const winner = nameOf(q.winnerAccountId);
              return (
                <li key={q.index} className={q.reason === 'correct' ? undefined : 'miss'}>
                  <span className="qlog-no mono">{q.index}</span>
                  <span className="qlog-main">
                    <span className="qlog-text">{q.text}</span>
                    <span className="qlog-sub dim">
                      {/* ★ 중단된 문제는 정답을 보여주지 않는다 (파일 헤더의 근거) */}
                      {q.displayAnswer ? (
                        <>
                          정답 <strong>{q.displayAnswer}</strong>
                        </>
                      ) : (
                        <>정답 미공개</>
                      )}
                      {q.experiencedCount > 0 && (
                        <> · 이미 풀어본 사람 {q.experiencedCount}명</>
                      )}
                    </span>
                  </span>
                  <span className="qlog-who">
                    {winner ? (
                      <>
                        <span className="nick" style={{ color: `var(--p${winner.colorIndex})` }}>
                          {winner.nickname}
                        </span>{' '}
                        <span className="mono dim">{sec(q.responseMs)}</span>
                      </>
                    ) : (
                      <span className="dim">{reasonLabel(q.reason)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      </div>

      <section className="card next-card">
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
