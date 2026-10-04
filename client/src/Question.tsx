// =============================================================================
// 문제 화면 (Phase 3 / guide 10·11·13·14절)
//
// ★★★ 클라이언트 타이머는 표시 전용이다 (guide 45절 / 01-GAME-RULES 16장).
//   ★ 0 에 도달해도 **어떤 상태 전환도 하지 않는다.** "결과 확인 중…" 만 보여주고
//     서버의 question.resolved 를 기다린다.
//   ★ 이 규칙을 깨면 사람마다 다른 시점에 문제가 끝난 것처럼 보이고,
//     선착순 판정에서 "내 화면에선 아직 시간이 남았는데" 가 발생한다.
//
// ★ 남은 시간은 서버가 준 절대 시각(endsAt)과 시계 오프셋으로 계산한다.
//   ★ Phase 2 의 카운트다운에서 이미 검증된 방식이다. 같은 방식을 쓴다.
//
// ★★ 별도의 답안 입력창을 만들지 않는다 (guide 12절 절대 규칙).
//   ★ 답안 제출은 채팅 입력창 하나뿐이다. 이 컴포넌트에 입력창이 없는 것이 그 구현이다.
//
// ★ 라벨 규칙 (D-022): 새로 만드는 버튼·배지는 styles.css 의 규칙을 그대로 받는다.
//   개별 요소에 white-space 를 다시 쓰지 않는다.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { formatDifficulties, formatTopics, type DifficultyTier, type GameTopic } from '@quiz/shared';
import Avatar from './Avatar.js';
import type { QuestionView, ResolutionView, SkipView } from './useRoom.js';

interface Props {
  socket: Socket;
  question: QuestionView;
  resolution: ResolutionView | null;
  skip: SkipView | null;
  /** 서버 시각 추정치를 돌려주는 함수 */
  serverNow: () => number;
  isHost: boolean;
  /** 방 상태. QUESTION_ACTIVE / QUESTION_RESOLVED */
  state: string;
  /** 지금까지의 점수판 */
  players: { accountId: string; nickname: string; colorIndex: number; score: number; connected: boolean }[];
  myAccountId: string;
  /** ★ R025 — 이 판의 난이도. 설정이 잠겨 있으므로 방 설정이 곧 이 판의 설정이다 */
  difficulties: DifficultyTier[];
  /** ★ R034 — 이 판의 분야 */
  topics: GameTopic[];
  /** ★ R034 — 지금 접속 인원 (넘기기 투표 현황 "몇 명 중") */
  activeCount: number;
}

export default function Question({
  socket,
  question,
  resolution,
  skip,
  serverNow,
  isHost,
  state,
  players,
  myAccountId,
  difficulties,
  topics,
  activeCount,
}: Props) {
  const active = state === 'QUESTION_ACTIVE';
  const [remainMs, setRemainMs] = useState(() => Math.max(0, question.endsAt - serverNow()));
  /** 강제 스킵·강제 종료 확인창 */
  const [confirming, setConfirming] = useState<'skip' | 'end' | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 100ms 마다 다시 그린다. 서버 tick 주기와 같아 표시가 어긋나 보이지 않는다.
    const id = setInterval(() => {
      setRemainMs(Math.max(0, question.endsAt - serverNow()));
    }, 100);
    return () => clearInterval(id);
  }, [question.endsAt, serverNow]);

  /**
   * ★★ 새 문제가 시작되면 문제가 보이는 위치로 스크롤한다 (R014 ui-check 실측으로 추가).
   *
   * ★★ 왜 필요한가 — 실측에서 찾은 결함이다
   *   ★ 채팅을 보려고 아래로 스크롤한 상태에서 다음 문제가 시작되면
   *     **문제 지문이 화면 위쪽 밖에 있다** (실측: top=-371px).
   *   ★★ 30초 승부에서 스크롤하는 데 시간을 쓰게 된다. 치명적이다.
   *
   * ★ 그러나 **문제 진행 중에는 사용자의 스크롤을 건드리지 않는다.**
   *   ★ 조건을 두 개로 좁혔다 —
   *     (1) epoch 가 바뀔 때만 (= 새 문제가 시작된 순간에만)
   *     (2) 문제 카드가 실제로 화면에서 벗어나 있을 때만
   *   ★ 근거: 이미 보이는데 스크롤하면 사용자가 보던 위치를 빼앗는다.
   *     ★ 그리고 매 렌더마다 하면 채팅을 읽을 수 없게 된다 (guide 36절의 취지와 같다).
   */
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // ★ 카드의 위쪽이 화면 밖이거나, 아래쪽이 화면 밖일 때만 끌어온다
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    // ★ behavior 를 'auto'(즉시)로 둔다. 'smooth' 는 애니메이션 동안 지문을 읽을 수 없고,
    //   ★ 30초 승부에서 그 시간이 아깝다. ★ 실측에서도 애니메이션 중에는 화면 밖이었다.
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [question.epoch]);

  /**
   * ★★ Q-56 — 단축키가 방장 확인창을 연다 (R015).
   *
   * ★ 왜 CustomEvent 로 받는가 — 단축키 정의는 Lobby 에 있고 확인창 상태는 여기 있다.
   *   ★ 상태를 Lobby 로 끌어올리면 문제 화면의 관심사가 밖으로 샌다.
   *   ★★ 그리고 단축키가 **확인창을 건너뛰고 바로 실행하면 안 된다** —
   *     실수로 누른 Alt+K 가 문제를 즉시 넘기면 되돌릴 수 없다.
   *     ★ 그래서 단축키도 버튼과 **같은 경로**(확인창)를 지나게 한다.
   */
  useEffect(() => {
    const openSkip = () => setConfirming('skip');
    const openEnd = () => setConfirming('end');
    window.addEventListener('qw:host-skip', openSkip);
    window.addEventListener('qw:host-end', openEnd);
    return () => {
      window.removeEventListener('qw:host-skip', openSkip);
      window.removeEventListener('qw:host-end', openEnd);
    };
  }, []);

  // ★ 문제가 바뀌면 확인창을 닫는다.
  //   ★ 근거: 확인창이 열린 채로 문제가 바뀌면 다음 문제를 스킵할 위험이 있다.
  //     ★ 서버가 epoch 로 막지만(host.forceSkip), 화면에서도 닫는 것이 맞다.
  useEffect(() => {
    setConfirming(null);
  }, [question.epoch]);

  /**
   * ★ Q-83 확정 — **정수 초로 표시한다.**
   *   ★ 건우: "시간 줄어드는 게 소수점 단위는 안 보여줘도 된다. 눈만 아프다."
   *   ★★ 내부 계산은 그대로 ms 다. 표시만 바꾼다 —
   *     정답 인정 경계는 서버의 endsAt 이고 화면 표기와 무관하다.
   *   ★ 올림(ceil)을 쓴다. 0.4초 남았는데 "0초" 로 보이면 이미 끝난 것처럼 읽힌다.
   */
  const sec = Math.ceil(remainMs / 1000);
  /**
   * 남은 10초 구간인가. 색을 바꿔 긴박함을 보여준다.
   * ★ R034 (40초) 판단 — **10초 주황 / 5초 빨강을 그대로 둔다.** 긴박함은 남은 "초" 의 문제라
   *   전체 시간이 늘어도 기준이 같아야 한다. 막대 길이는 비율이라 40초에 맞춰 자연히 줄어든다.
   *   (15초에는 초성 힌트가 나오는 것 자체가 신호다)
   */
  const urgent = active && remainMs <= 10_000;

  const sendSkipVote = (vote: boolean) => {
    socket.emit('skip.vote', { vote, epoch: question.epoch });
  };

  /** ★ 줄어드는 막대의 길이 (0~1). 문제 시간 30초 기준 */
  const ratio = Math.max(0, Math.min(1, remainMs / Math.max(1, question.endsAt - question.startedAt)));
  /** 마지막 5초 — 숫자와 막대가 빨갛게 뛴다 */
  const last5 = active && remainMs <= 5_000;
  const winner =
    resolution?.reason === 'correct'
      ? players.find((p) => p.accountId === resolution.winnerAccountId) ?? null
      : null;

  return (
    <>
      <section ref={cardRef} className={`card question-card${urgent ? ' urgent' : ''}`}>
        <div className="q-head">
          <span className="q-progress mono">
            문제 {question.index} / {question.total}
          </span>
          {/* ★ 카테고리는 대분류다. 소분류 이름은 힌트가 되므로 서버가 보내지 않는다 */}
          <span className="badge cat">{question.categoryName}</span>
          {/* ★ R025 — 어떤 난이도로 하는 판인지 */}
          <span className="badge diff">난이도 {formatDifficulties(difficulties)}</span>
          {/* ★ R034 — 분야를 골라 한 판이면 표시한다 (전체면 자리를 차지하지 않는다) */}
          {formatTopics(topics) !== '전체' && (
            <span className="badge diff">분야 {formatTopics(topics)}</span>
          )}
          {question.selfExperienced && (
            /* ★ 본인에게만 보이는 배지 (01-GAME-RULES 12장) */
            <span className="badge exp">이미 풀어본 퀴즈입니다</span>
          )}
          {/* ★★ R033 — 남은 시간은 **작은 숫자**로 머리줄 오른쪽에 (건우: "너무 크다").
              ★ 0 이 되어도 여기서 상태를 바꾸지 않는다. 서버 이벤트를 기다린다 */}
          {active &&
            (remainMs > 0 ? (
              <span className={`q-timer mono${last5 ? ' urgent' : ''}`}>{sec}초</span>
            ) : (
              <span className="q-timer dim">결과 확인 중…</span>
            ))}
        </div>

        {/* ★★ 1순위 — 문제 지문. 새 문제마다 살짝 올라오며 나타난다 (key=epoch) */}
        <p key={question.epoch} className="q-text">
          {question.text}
        </p>

        {/* ★ 줄어드는 막대 (40초 기준 비율). 남은 10초는 주황, 5초는 빨강 */}
        {active && (
          <div className="q-timebar" aria-hidden="true">
            <div
              className={`q-timebar-fill${last5 ? ' urgent' : urgent ? ' warn' : ''}`}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
        )}

        {/* ★★ 힌트 자리 — **처음부터 두 줄을 잡아 둔다** (R033).
            ★ 건우: "10초 초성 힌트 공개 시 문제와 초성 사이에 줄바꿈이 생겨서 못생겨진다."
            ★ 힌트가 나와도 아래가 밀리지 않는다. 힌트가 없는 문제는 빈 자리로 남는다 */}
        {active && (
          <div className="q-hints">
            {/* ── ★★ 일반 힌트 (R028). 남은 30초부터 (R034). 없는 문제는 아무것도 나오지 않는다 */}
            {question.generalHint && (
              <p className="q-hint q-hint-general">
                <span className="hint-label">힌트</span> <span>{question.generalHint}</span>
              </p>
            )}
            {/* ── 초성 힌트 (남은 15초부터 — R034) */}
            {question.hintRevealed && (
              <p className="q-hint">
                <span className="hint-label">초성</span>{' '}
                {question.hint ? (
                  <span className="mono hint-value">{question.hint}</span>
                ) : (
                  <span className="dim">이 문제는 힌트가 없습니다</span>
                )}
              </p>
            )}
          </div>
        )}

        {/* ★ R034 — 경험자는 참여자 칸의 "경험" 배지로 옮겼다 (전원 공개 D-011 은 그대로).
            ★ 무슨 뜻인지는 ⓘ 안내에 있다 */}
      </section>

      {/* ── ★★ 정답 공개 (QUESTION_RESOLVED) — 정답자를 화면에서 가장 크게 (건우 요청) */}
      {resolution && (
        <section key={resolution.epoch} className="card reveal-card">
          {winner ? (
            <>
              <Confetti />
              <div className="winner">
                <Avatar nickname={winner.nickname} colorIndex={winner.colorIndex} large />
                <div>
                  <p className="winner-label">정답!</p>
                  <p className="winner-name" style={{ color: `var(--p${winner.colorIndex})` }}>
                    {winner.nickname}
                    {winner.accountId === myAccountId && <span className="badge me">나</span>}
                  </p>
                </div>
                <span className="winner-plus">+1</span>
              </div>
            </>
          ) : (
            <p className="reveal-title">{resolveTitle(resolution, players)}</p>
          )}
          <p className="reveal-answer">
            정답 <strong>{resolution.displayAnswer}</strong>
          </p>
          {resolution.explanation && <p className="note">{resolution.explanation}</p>}
          <p className="note dim">
            {/* ★★ R034 (Q-17 개정) — 마지막 문제도 5초 뒤에 결과로 간다 */}
            {question.index >= question.total
              ? '마지막 문제였습니다. 잠시 후 결과 화면으로 이동합니다.'
              : '잠시 후 다음 문제가 시작됩니다. 그 사이에도 채팅할 수 있습니다.'}
          </p>
        </section>
      )}

      {/* ── ★★ 행동 줄 (R034) — 넘기기 투표를 가장 크게. 방장 버튼은 작게 옆에.
          ★ 건우: "스킵 투표가 아예 안 된다 / 눈에 잘 띄게 / 몇 명 중 몇 명인지." */}
      {(active || isHost) && confirming === null && (
        <section className="card action-bar">
          {active && skip && (
            <div className="skip-box">
              <button
                type="button"
                className={skip.selfVoted ? 'skip-btn voted' : 'skip-btn'}
                disabled={skip.threshold === null}
                aria-pressed={skip.selfVoted}
                onClick={() => sendSkipVote(!skip.selfVoted)}
              >
                {skip.selfVoted ? '⏭ 넘기기 취소' : '⏭ 넘기기 투표'} <kbd>Alt+S</kbd>
              </button>
              {skip.threshold === null ? (
                <span className="skip-status note">
                  혼자일 때는 투표로 넘길 수 없어요{isHost ? ' — 방장 넘기기를 쓰세요' : ''}
                </span>
              ) : (
                <span className="skip-status">
                  <span className="skip-count mono">
                    {skip.votes} / {skip.threshold}
                  </span>
                  <span className="skip-dots" aria-hidden="true">
                    {Array.from({ length: skip.threshold }, (_, i) => (
                      <i key={i} className={i < skip.votes ? 'on' : undefined} />
                    ))}
                  </span>
                  {/* ★ 누가 투표했는지는 표시하지 않는다 (guide 22절). 서버도 명단을 보내지 않는다 */}
                  <span className="note dim">
                    접속 {activeCount}명 중 {skip.threshold}명이 누르면 넘어가요
                  </span>
                </span>
              )}
            </div>
          )}
          {isHost && (
            <div className="host-tools">
              {active && (
                <button type="button" className="ghost tiny" onClick={() => setConfirming('skip')}>
                  방장 넘기기 <kbd>Alt+K</kbd>
                </button>
              )}
              <button type="button" className="ghost tiny" onClick={() => setConfirming('end')}>
                강제 종료 <kbd>Alt+Q</kbd>
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── 방장 확인창. 방향키·Enter·마우스·터치로 모두 조작할 수 있어야 한다 (guide 23절).
          ★ autoFocus 로 Enter 가 바로 먹는다. */}
      {isHost && confirming !== null && (
        <section className="card host-card">
          <div className="confirm">
            <p className="big">
              {confirming === 'skip'
                ? '이 문제를 넘길까요? 정답이 공개됩니다.'
                : '게임을 강제 종료할까요? 정답을 공개하지 않고 결과 화면으로 갑니다.'}
            </p>
            {confirming === 'end' && (
              <p className="note">
                강제 종료한 문제는 <strong>경험 기록을 남기지 않습니다.</strong> 이미 지나간 문제의
                기록은 그대로 유지됩니다.
              </p>
            )}
            <div className="field-row">
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => {
                  if (confirming === 'skip') {
                    socket.emit('host.forceSkip', { epoch: question.epoch });
                  } else {
                    // ★ 강제 종료에는 epoch 를 담지 않는다. 게임 전체 액션이다
                    socket.emit('host.forceEnd', {});
                  }
                  setConfirming(null);
                  document.querySelector<HTMLInputElement>('.chat-card input')?.focus();
                }}
              >
                예
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setConfirming(null);
                  // ★★ 확인창이 닫히면 포커스가 채팅 입력으로 돌아와야 한다 (Q-56)
                  document.querySelector<HTMLInputElement>('.chat-card input')?.focus();
                }}
              >
                아니오
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** ★ 정답 꽃가루 — 정답이 나왔을 때만. 조각 몇 개만 (과하지 않게) */
function Confetti() {
  const colors = ['var(--accent)', 'var(--accent-2)', 'var(--ok)', 'var(--warn)', 'var(--p5)'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

function resolveTitle(
  r: ResolutionView,
  players: { accountId: string; nickname: string }[],
): string {
  switch (r.reason) {
    case 'correct': {
      const w = players.find((p) => p.accountId === r.winnerAccountId);
      return `정답! ${w?.nickname ?? ''}`;
    }
    case 'timeout':
      return '시간 종료';
    case 'skip_vote':
      return '투표로 넘겼습니다';
    case 'host_skip':
      return '방장이 넘겼습니다';
    default:
      return '문제 종료';
  }
}
