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
import { formatDifficulties, formatGapNsString, formatTopics, RULES, type DifficultyTier, type GameTopic } from '@quiz/shared';
import QuestionText from './QuestionText.js';
import Avatar from './Avatar.js';
import ChatText from './ChatText.js';
import Emoji from './Emoji.js';
import FitText from './FitText.js';
import ConfirmModal from './ConfirmModal.js';
import { usePopup } from './popup.js';
import type { ChatView, QuestionView, ResolutionView, SkipView } from './useRoom.js';

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
  players: { accountId: string; nickname: string; colorIndex: number; score: number; connected: boolean; avatarV?: number | null }[];
  myAccountId: string;
  /** ★ R025 — 이 판의 난이도. 설정이 잠겨 있으므로 방 설정이 곧 이 판의 설정이다 */
  difficulties: DifficultyTier[];
  /** ★ R034 — 이 판의 분야 */
  topics: GameTopic[];
  /** ★ R034 — 지금 접속 인원 (넘기기 투표 현황 "몇 명 중") */
  activeCount: number;
  /** ★★ R038 — 세레머니: 정답 공개 동안 정답자가 친 채팅 (정답 메시지부터) */
  ceremony: ChatView[];
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
  ceremony,
}: Props) {
  const active = state === 'QUESTION_ACTIVE';
  const [remainMs, setRemainMs] = useState(() => Math.max(0, question.endsAt - serverNow()));
  const [, setTick] = useState(0);
  /** 강제 스킵·강제 종료 확인 — ★ R041 팝업 (한 번에 하나) */
  const [skipOpen, setSkipOpen] = usePopup('host-skip');
  const [endOpen, setEndOpen] = usePopup('host-end');
  const confirming: 'skip' | 'end' | null = skipOpen ? 'skip' : endOpen ? 'end' : null;
  const setConfirming = (v: 'skip' | 'end' | null) => {
    if (v === 'skip') setSkipOpen(true);
    else if (v === 'end') setEndOpen(true);
    else {
      setSkipOpen(false);
      setEndOpen(false);
    }
  };
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 100ms 마다 다시 그린다. 서버 tick 주기와 같아 표시가 어긋나 보이지 않는다.
    const id = setInterval(() => {
      setRemainMs(Math.max(0, question.endsAt - serverNow()));
      // ★ R035 — 정답 공개 중에도 "N초 후" 안내가 줄어들도록 다시 그린다
      setTick((t) => t + 1);
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
    setSkipOpen(false);
  }, [question.epoch, setSkipOpen]);

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
  const urgent = active && remainMs <= RULES.TIMER_WARN_MS;

  const sendSkipVote = (vote: boolean) => {
    socket.emit('skip.vote', { vote, epoch: question.epoch });
  };

  /** ★ 줄어드는 막대의 길이 (0~1). 문제 시간 30초 기준 */
  /**
   * ★★ R038 — 막대 = 남은 시간 ÷ **문제 시간(RULES.QUESTION_DURATION_MS)**.
   *   ★ 옛 코드는 (endsAt − startedAt) 로 나눴다. 일시정지 뒤 재개하면 endsAt 이 미뤄지는데 startedAt 은 그대로라
   *     분모가 커지고 → **막대가 남은 시간보다 짧게** 그려졌다 (R038 1장).
   */
  const ratio = Math.max(0, Math.min(1, remainMs / RULES.QUESTION_DURATION_MS));
  /** 마지막 5초 — 숫자가 빨갛게 뛴다 */
  const last5 = active && remainMs <= RULES.TIMER_URGENT_MS;
  /**
   * ★★ R038 — 막대 색을 **서서히** 바꾼다 (건우: "빨간색으로 자연스럽게 전환").
   *   15→10초: 보라 → 주황 / 10→5초: 주황 → 빨강. 그 뒤는 빨강.
   */
  const toWarn = Math.max(0, Math.min(1, (RULES.TIMER_FADE_MS - remainMs) / (RULES.TIMER_FADE_MS - RULES.TIMER_WARN_MS)));
  const toBad = Math.max(0, Math.min(1, (RULES.TIMER_WARN_MS - remainMs) / (RULES.TIMER_WARN_MS - RULES.TIMER_URGENT_MS)));
  const barColor =
    toBad > 0
      ? `color-mix(in oklab, var(--bad) ${Math.round(toBad * 100)}%, var(--warn))`
      : toWarn > 0
        ? `color-mix(in oklab, var(--warn) ${Math.round(toWarn * 100)}%, var(--accent))`
        : undefined;
  const winner =
    resolution?.reason === 'correct'
      ? players.find((p) => p.accountId === resolution.winnerAccountId) ?? null
      : null;

  // ★★ R035 — 정답 공개 8초 중 남은 시간 (다음 문제·결과까지). 앞 3초는 안내를 띄우지 않는다
  const nextRemainMs = resolution?.nextAt != null ? Math.max(0, resolution.nextAt - serverNow()) : null;
  const showNext = nextRemainMs !== null && nextRemainMs <= RULES.RESOLVED_NOTICE_AT_MS;
  const isLastQuestion = question.index >= question.total;

  // ★★ R035 — 가운데 **카드 하나**: 머리줄 · 지문 · 막대 · (힌트 + 행동 줄) 또는 (정답 공개)
  return (
    <section ref={cardRef} className={`card question-card${urgent ? ' urgent' : ''}`}>
      <div className="q-head">
        <span className="q-progress mono">
          {question.index} / {question.total}
        </span>
        {/* ★ 카테고리는 대분류다. 소분류 이름은 힌트가 되므로 서버가 보내지 않는다 */}
        <span className="badge cat">{question.categoryName}</span>
        <span className="badge diff">난이도 {formatDifficulties(difficulties)}</span>
        {formatTopics(topics) !== '전체' && <span className="badge diff">분야 {formatTopics(topics)}</span>}
        {question.selfExperienced && (
          /* ★ 본인에게만 보이는 배지 (01-GAME-RULES 12장) — 진행에 필요한 알림이다 */
          <span className="badge exp">이미 풀어본 퀴즈 — 이번 문제는 점수 없음</span>
        )}
        {/* ★ 0 이 되어도 여기서 상태를 바꾸지 않는다. 서버 이벤트를 기다린다 */}
        {active &&
          (remainMs > 0 ? (
            <span className={`q-timer mono${last5 ? ' urgent' : ''}`}>{sec}초</span>
          ) : (
            <span className="q-timer dim">결과 확인 중…</span>
          ))}
      </div>

      {/* ★★ 1순위 — 문제 지문. 문장마다 줄을 바꾸고 긴 문장은 글자를 줄여 한 줄에 (R035) */}
      <QuestionText text={question.text} />

      {active && (
        <div className="q-timebar" aria-hidden="true">
          <div
            className={`q-timebar-fill${last5 ? ' urgent' : ''}`}
            data-ratio={ratio.toFixed(3)}
            style={{ transform: `scaleX(${ratio})`, ...(barColor ? { background: barColor } : {}) }}
          />
        </div>
      )}

      {/* ── ★★ R039 — 힌트 두 자리는 처음부터 **잠긴 칸**으로 보인다 (🔒 + 열리는 시점). 시간이 되면 열리며 내용이 나온다.
          ★ 건우: "힌트가 나타나기까지 비어 있어서 불균형해 보인다." → 빈 자리가 아니라 "곧 열릴 자리". 칸 높이는 같아 출렁이지 않는다.
          ★★ R040 — 일반 힌트가 없는 문제는 **처음부터** "없음" (서버가 문제 시작 때 있음/없음 여부만 보낸다).
            옛 R039 는 30초에 화면 시계로 "없음" 으로 바꿨다 → 힌트가 있는 문제도 서버 push 가 오기 전 잠깐 "없음" 이 떴다 */}
      {active && (
        <div className="q-hints">
          {question.generalHint ? (
            <p key="g-open" className="q-hint q-hint-general open">
              <span className="hint-label">힌트</span> <span>{question.generalHint}</span>
            </p>
          ) : question.hasGeneralHint === false ? (
            <p className="q-hint locked none">
              <span className="hint-label">힌트</span> <span>없음</span>
            </p>
          ) : (
            <p className="q-hint locked">
              <span className="hint-label">힌트</span> <span>🔒 {RULES.GENERAL_HINT_REVEAL_AT_MS / 1000}초</span>
            </p>
          )}
          {question.hintRevealed ? (
            <p key="c-open" className="q-hint open">
              <span className="hint-label">초성</span>{' '}
              {question.hint ? <span className="mono hint-value">{question.hint}</span> : <span className="dim">없음</span>}
            </p>
          ) : (
            <p className="q-hint locked">
              <span className="hint-label">초성</span> <span>🔒 {RULES.HINT_REVEAL_AT_MS / 1000}초</span>
            </p>
          )}
        </div>
      )}

      {/* ── ★★ 정답 공개 (8초) — 정답자 가장 크게 · 정답 · 해설 크게 · ★ R038 세레머니 · 뒷북 · 3초 뒤 "N초 후" */}
      {resolution && (
        <div key={resolution.epoch} className={winner ? 'reveal has-winner' : 'reveal'}>
          <div className="reveal-main">
            {winner ? (
              <>
                <Confetti />
                <div className="winner">
                  <Avatar nickname={winner.nickname} colorIndex={winner.colorIndex} large accountId={winner.accountId} avatarV={winner.avatarV} />
                  <div className="winner-text">
                    {/* ★ R040 (건우) — "+1" 이 오른쪽 끝에 어중간하게 떨어져 있었다 → "정답!" 바로 옆 (닉네임 바로 위) */}
                    <p className="winner-label">정답!</p>
                    {/* ★★ R040 — 화면에서 가장 큰 글씨지만 자리보다 길면 줄인다 ("…"·여러 줄 없이)
                        ★ R041 (건우) — "+1" 은 **닉네임 바로 옆** ("정답 옆은 동떨어진 느낌") */}
                    <div className="winner-name-row">
                      <FitText as="p" text={winner.nickname} className="winner-name" style={{ color: `var(--p${winner.colorIndex})` }} minPx={18} />
                      <span className="winner-plus">+1</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="reveal-title">{resolveTitle(resolution, players)}</p>
            )}
            <p className="reveal-answer">
              정답 <strong>{resolution.displayAnswer}</strong>
            </p>
            {resolution.explanation && <p className="reveal-explain">{resolution.explanation}</p>}
          </div>

          {/* ★★★ 소감 칸 (R038 세레머니 → R040 "소감") — 정답자가 이 8초 동안 치는 채팅을 **모두에게 크게**. 정답자가 없으면 칸이 없다.
              ★ R040 — 좌우·상하 가운데 · 가로로 넘치면 줄바꿈 · 세로로 넘치면 "…" (채팅 로그에는 전체) */}
          {winner && (
            <div className="ceremony" aria-live="polite">
              <p className="ceremony-head">
                🎉 <span style={{ color: `var(--p${winner.colorIndex})` }}>{winner.nickname}</span>의 소감
              </p>
              <div className="ceremony-msgs">
                {/* ★ R040 — 정답 공개 순간에는 **빈 칸** (정답 채팅은 넣지 않는다). 그 뒤 치는 말부터 */}
                {ceremony.slice(-1).map((m) => (
                    /* ★ R039 — 최신 한 마디만. key=메시지 id 라 **같은 말이라도 새 채팅이면** 다시 튀어 오른다 */
                    <p key={m.id} className="ceremony-msg">
                      {m.emojiId ? (
                        <Emoji id={m.emojiId} size={56} />
                      ) : (
                        <ChatText text={m.text} mine={m.accountId === myAccountId} masked={m.masked} />
                      )}
                    </p>
                ))}
              </div>
            </div>
          )}

          {/* ★★★ 뒷북 — 간발의 차로 늦은 사람 (세레머니와 대비되게 초라하게). 채팅은 강조하지 않는다 */}
          {winner && resolution.late.length > 0 && (
            <p className="late-row">
              <span className="late-label">뒷북</span>
              {resolution.late.map((l) => (
                <span key={l.accountId} className="late-item">
                  <span style={{ color: `var(--p${l.colorIndex})` }}>{l.nickname}</span>{' '}
                  <span className="mono">+{formatGapNsString(l.diffNs)}초</span>
                </span>
              ))}
            </p>
          )}

          {/* ★ 진행 안내 — 작고 흐리게. 자리를 잡아 두어 3초 뒤 나타나도 화면이 출렁이지 않는다 */}
          <p className="reveal-next" aria-live="polite">
            {showNext && nextRemainMs !== null
              ? `${Math.ceil(nextRemainMs / 1000)}초 후 ${isLastQuestion ? '결과 화면' : '다음 문제'}`
              : ' '}
          </p>
        </div>
      )}

      {/* ── ★★ 행동 줄 — 넘기기 투표를 가장 크게. 방장 버튼은 작게 옆에 */}
      {(active || isHost) && (
        <div className="action-bar">
          {active && skip && (
            <div className="skip-box">
              <button
                type="button"
                className={skip.selfVoted ? 'skip-btn voted' : 'skip-btn'}
                disabled={skip.threshold === null}
                aria-pressed={skip.selfVoted}
                onClick={() => sendSkipVote(!skip.selfVoted)}
              >
                {skip.selfVoted ? '⏭ 취소' : '⏭ 넘기기'}
              </button>
              {skip.threshold === null ? (
                <span className="skip-status note dim">혼자선 투표 불가</span>
              ) : (
                /* ★★ R039 (건우) — 숫자 없이: **접속 인원 수만큼** 아이콘, 투표마다 하나씩 채워진다.
                   ★ 넘어가는 지점(필요 표수)의 아이콘에는 깃발을 단다 — 몇 개 채우면 넘어가는지 숫자 없이 보인다.
                   ★ 누가 투표했는지는 표시하지 않는다 (guide 22절) — 앞에서부터 채운다 */
                <span
                  className="skip-icons"
                  role="img"
                  aria-label={`넘기기 ${skip.votes}표 · ${skip.threshold}표면 넘어감`}
                  data-votes={skip.votes}
                  data-threshold={skip.threshold}
                >
                  {Array.from({ length: Math.max(activeCount, skip.threshold ?? 0) }, (_, i) => (
                    <i
                      key={i}
                      className={[i < skip.votes ? 'on' : '', i === (skip.threshold ?? 0) - 1 ? 'goal' : ''].filter(Boolean).join(' ') || undefined}
                    />
                  ))}
                </span>
              )}
            </div>
          )}
          {isHost && (
            <div className="host-tools">
              {active && (
                <button type="button" className="ghost tiny" onClick={() => setConfirming('skip')}>
                  ⏭ 방장
                </button>
              )}
              <button type="button" className="ghost tiny" onClick={() => setConfirming('end')}>
                ⏹ 종료
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 방장 확인 — ★ R041 팝업 (방향키·Enter·Esc · 화면 가운데). 카드에 요소를 끼워 넣지 않는다 */}
      {isHost && confirming !== null && (
        <ConfirmModal
          kind={confirming === 'skip' ? 'host-skip' : 'host-end'}
          title={confirming === 'skip' ? '이 문제를 넘길까요?' : '게임을 끝낼까요?'}
          note={confirming === 'end' && active ? '지금 문제는 경험 기록이 남지 않아요.' : undefined}
          actions={[
            {
              label: confirming === 'skip' ? '넘기기' : '끝내기',
              danger: confirming === 'end',
              onClick: () => {
                if (confirming === 'skip') {
                  socket.emit('host.forceSkip', { epoch: question.epoch });
                } else {
                  // ★ 강제 종료에는 epoch 를 담지 않는다. 게임 전체 액션이다
                  socket.emit('host.forceEnd', {});
                }
                setConfirming(null);
                document.querySelector<HTMLInputElement>('.chat-card input')?.focus();
              },
            },
          ]}
          onCancel={() => {
            setConfirming(null);
            // ★★ 확인창이 닫히면 포커스가 채팅 입력으로 돌아와야 한다 (Q-56)
            document.querySelector<HTMLInputElement>('.chat-card input')?.focus();
          }}
        />
      )}
    </section>
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
