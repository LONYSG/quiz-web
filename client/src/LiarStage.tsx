// =============================================================================
// ★★★ 라이어 게임 화면 (R082 · D-339) — 퀴즈 판 자리(채팅은 그대로 아래)
//
// ★ 위에서부터: 머리(라운드 · 단계 · 남은 초) → 주제 + 내 카드(시민 = 키워드 / 라이어 = "들키지 마세요") → 단계 칸
//   · 설명: 순서 줄(차례 표시 · 한마디) — 말은 채팅 입력칸으로(차례 아닌 사람 채팅은 서버가 거른다 — 알림 한 줄)
//   · 투표: 사람 카드(자기 · 이미 지목된 사람 제외 · 재투표는 동률자만) · 집계: 누가 누굴 · 득표
//   · 항변 · 찬반(라이어다 / 아니다) · 키워드 맞히기(라이어만 입력) · 공개(라이어 · 키워드 · 결과 · 점수)
// ★ 상태는 글자 + 기호(사무실 흑백 — D-324): 차례 ▶ · 지목 ● · 라이어 🕵 대신 글 "라이어".
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { LIAR } from '@quiz/shared';
import type { LiarView, PlayerView } from './useRoom.js';

interface Props {
  socket: Socket;
  view: LiarView;
  players: PlayerView[];
  myAccountId: string;
  serverNow: () => number;
}

const PHASE_LABEL: Record<LiarView['phase'], string> = {
  assign: '제시어 확인',
  describe: '한마디씩',
  vote: '라이어 지목 투표',
  revote: '동률 — 다시 투표',
  tally: '투표 결과',
  defense: '최후의 항변',
  final: '찬반 투표',
  guess: '라이어의 마지막 기회',
  reveal: '공개',
};

export default function LiarStage({ socket, view, players, myAccountId, serverNow }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);
  const left = Math.max(0, Math.ceil((view.phaseEndsAt - serverNow()) / 1000));
  const total = Math.max(1, view.phaseEndsAt - view.phaseStartedAt);
  const frac = Math.max(0, Math.min(1, (view.phaseEndsAt - serverNow()) / total));
  const nameOf = (id: string | null) => (id ? (players.find((p) => p.accountId === id)?.nickname ?? '나간 사람') : '');
  const colorOf = (id: string) => `var(--p${players.find((p) => p.accountId === id)?.colorIndex ?? 0})`;
  const [notice, setNotice] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    const on = (p: { message: string }) => setNotice({ text: p.message, at: Date.now() });
    socket.on('liar.chatRejected', on);
    return () => {
      socket.off('liar.chatRejected', on);
    };
  }, [socket]);
  const showNotice = notice && Date.now() - notice.at < 3000;
  const me = view.participants.includes(myAccountId) ? myAccountId : null;
  const myTurn = view.turn !== null && view.turn === me;

  return (
    <section className={`card liar-card liar-${view.phase}`} data-liar-phase={view.phase} aria-live="polite">
      <header className="liar-head">
        <span className="mg-badge">라이어 게임</span>
        <span className="mono liar-round">
          {view.round} / {view.rounds}라운드
        </span>
        <strong className="liar-phase">{PHASE_LABEL[view.phase]}</strong>
        <span className="mg-spacer" />
        <span className="mono liar-left">{left}초</span>
      </header>
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${frac * 100}%` }} />
      </div>

      <div className="liar-word">
        <span className="liar-topic">
          주제 <strong data-liar-topic>{view.nameKo}</strong>
        </span>
        {view.spectating ? (
          <span className="liar-mine spect">구경 중{view.keyword ? ` · 키워드 ${view.keyword}` : ''}</span>
        ) : view.amLiar ? (
          <span className="liar-mine liar" data-liar-me="liar">
            당신이 <strong>라이어</strong> — 들키지 마세요
          </span>
        ) : (
          <span className="liar-mine citizen" data-liar-me="citizen">
            키워드 <strong data-liar-keyword>{view.keyword}</strong>
          </span>
        )}
      </div>

      {/* 순서 줄 · 한마디 */}
      <ol className="liar-order" data-liar-order>
        {view.order.map((a) => {
          const said = view.says.find((s) => s.accountId === a);
          const defense = view.says.filter((s) => s.accountId === a).slice(1);
          return (
            <li key={a} className={`${view.turn === a ? 'turn' : ''}${a === me ? ' me' : ''}${view.accused === a ? ' accused' : ''}`} data-liar-turn={view.turn === a ? '1' : ''}>
              <span className="liar-nick" style={{ color: colorOf(a) }}>
                {view.turn === a ? '▶ ' : ''}
                {nameOf(a)}
              </span>
              <span className={said?.auto ? 'liar-say dim' : 'liar-say'}>{said ? said.text : view.phase === 'describe' || view.phase === 'assign' ? '…' : '(말 없음)'}</span>
              {defense.length > 0 && <span className="liar-say defense">항변: {defense[defense.length - 1]!.text}</span>}
            </li>
          );
        })}
      </ol>

      {(view.phase === 'describe' || view.phase === 'defense') && (
        <p className={myTurn ? 'liar-help mine' : 'liar-help dim'} data-liar-help>
          {myTurn
            ? view.phase === 'defense'
              ? `내 최후의 항변 — 채팅으로 한 줄(${LIAR.SAY_MAX}자 · 키워드 금지)`
              : `내 차례 — 채팅으로 한마디(${LIAR.SAY_MAX}자 · 키워드는 말할 수 없어요)`
            : `${nameOf(view.turn)} 님 ${view.phase === 'defense' ? '최후의 항변' : '차례'} — 기다려 주세요`}
        </p>
      )}

      {(view.phase === 'vote' || view.phase === 'revote') && (
        <VoteCards view={view} me={me} nameOf={nameOf} colorOf={colorOf} socket={socket} />
      )}

      {view.phase === 'tally' && view.lastTally && (
        <div className="liar-tally" data-liar-tally>
          <ul>
            {Object.entries(view.lastTally.votes).map(([v, t]) => (
              <li key={v}>
                <span style={{ color: colorOf(v) }}>{nameOf(v)}</span> → <strong>{nameOf(t)}</strong>
              </li>
            ))}
          </ul>
          <p className="liar-result-line">
            {view.accused ? (
              <>
                ● <strong>{nameOf(view.accused)}</strong> 지목 ({view.lastTally.counts[view.accused] ?? 0}표) — 최후의 항변
              </>
            ) : view.candidates ? (
              `동률 — ${view.candidates.map((c) => nameOf(c)).join(' · ')} 중에서 다시 투표`
            ) : (
              '라이어를 못 찾았어요'
            )}
          </p>
        </div>
      )}

      {view.phase === 'final' && <FinalVote view={view} me={me} nameOf={nameOf} socket={socket} />}

      {view.phase === 'guess' && (
        <div className="liar-guess" data-liar-guess>
          <p>
            ● <strong>{nameOf(view.liar)}</strong> 님이 라이어였어요! 키워드를 맞히면 +{LIAR.SCORE_LIAR_GUESS}
          </p>
          {view.amLiar ? <GuessInput socket={socket} /> : <p className="dim">라이어가 키워드를 맞히는 중…</p>}
        </div>
      )}

      {view.phase === 'reveal' && (
        <div className="liar-reveal" data-liar-reveal={view.outcome ?? ''}>
          <p className="liar-reveal-main">
            라이어는 <strong style={{ color: view.liar ? colorOf(view.liar) : undefined }}>{nameOf(view.liar)}</strong> · 키워드 <strong>{view.keyword}</strong>
          </p>
          <p className="liar-result-line">
            {view.outcome === 'caught'
              ? `찾았다! ${view.guessOk ? `라이어가 키워드도 맞힘(“${view.guess}”) +${LIAR.SCORE_LIAR_GUESS}` : view.guess ? `라이어 답 “${view.guess}” — 틀림` : '라이어가 답을 못 냈어요'}`
              : view.outcome === 'escaped'
                ? `엉뚱한 사람을 지목 — 라이어 승리 +${LIAR.SCORE_LIAR_ESCAPE}`
                : `라이어를 못 찾았어요 — 라이어 승리 +${LIAR.SCORE_LIAR_ESCAPE}`}
          </p>
          {view.scores && Object.keys(view.scores).length > 0 && (
            <p className="liar-scores" data-liar-scores={Object.keys(view.scores).length}>
              {Object.entries(view.scores).map(([a, n]) => (
                <span key={a}>
                  <span style={{ color: colorOf(a) }}>{nameOf(a)}</span> +{n}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {showNotice && (
        <p className="liar-notice" role="status" data-liar-notice>
          {notice!.text}
        </p>
      )}
    </section>
  );
}

function VoteCards({ view, me, nameOf, colorOf, socket }: { view: LiarView; me: string | null; nameOf: (id: string | null) => string; colorOf: (id: string) => string; socket: Socket }) {
  const pool = (view.phase === 'revote' && view.candidates ? view.candidates : view.participants.filter((a) => !view.accusedTried.includes(a))).filter((a) => a !== me);
  return (
    <div className="liar-vote" data-liar-vote>
      <p className="liar-help dim">
        {me ? '라이어 같은 사람을 고르세요(바꿔도 돼요 — 마지막 선택)' : '구경 중'} · {view.votedCount}/{view.participants.length}명
      </p>
      <div className="liar-people">
        {pool.map((a) => (
          <button key={a} type="button" className={view.myVote === a ? 'liar-person picked' : 'liar-person'} data-liar-target={a} disabled={!me} onClick={() => socket.emit('liar.vote', { target: a })}>
            <span style={{ color: colorOf(a) }}>{nameOf(a)}</span>
            {view.myVote === a && <span className="liar-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FinalVote({ view, me, nameOf, socket }: { view: LiarView; me: string | null; nameOf: (id: string | null) => string; socket: Socket }) {
  const can = me !== null && me !== view.accused;
  return (
    <div className="liar-final" data-liar-final>
      <p>
        ● <strong>{nameOf(view.accused)}</strong> 님이 라이어일까요? <span className="dim">{view.votedCount}명 냄 · 과반이면 확정</span>
      </p>
      {can ? (
        <div className="liar-final-btns">
          <button type="button" className={view.myFinal === true ? 'primary picked' : 'primary'} data-liar-yes onClick={() => socket.emit('liar.final', { yes: true })}>
            라이어다{view.myFinal === true ? ' ✓' : ''}
          </button>
          <button type="button" className={view.myFinal === false ? 'ghost picked' : 'ghost'} data-liar-no onClick={() => socket.emit('liar.final', { yes: false })}>
            아니다{view.myFinal === false ? ' ✓' : ''}
          </button>
        </div>
      ) : (
        <p className="dim">{me === view.accused ? '다른 사람들이 정하는 중…' : '구경 중'}</p>
      )}
    </div>
  );
}

function GuessInput({ socket }: { socket: Socket }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      className="quiz-num topic-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) socket.emit('liar.guess', { text: text.trim() });
      }}
    >
      <div className="quiz-num-row">
        <input ref={ref} className="quiz-num-input topic-input" data-liar-guess-input maxLength={40} value={text} autoComplete="off" placeholder="키워드는?" aria-label="키워드 맞히기" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()} />
        <button type="submit" className="primary quiz-num-ok" disabled={!text.trim()}>
          확인
        </button>
      </div>
    </form>
  );
}
