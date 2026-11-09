// =============================================================================
// ★★★ 라이어 게임 화면 (R082 · D-339) — 퀴즈 판 자리(채팅은 그대로 아래)
//
// ★ 위에서부터: 머리(라운드 · 단계 · 바퀴 · 남은 초) → 주제 + 내 카드(시민 = 키워드 / 라이어 = "들키지 마세요")
//   → ★ R087 큰 줄(지금 차례의 설명 · 변론을 모두가 크게) → 설명칸(차례인 사람만) → 순서 줄 → 단계 칸 → 설명 기록(접힘)
// ★★ R087 개정(D-344 · 찬종 테스트 1): 설명 · 변론은 채팅이 아니라 **설명칸**(liar.say) — 채팅은 늘 자유(키워드만 서버가 거른다)
//   · 설명 기록 패널: 기본 접힘 · Tab(또는 H — 입력칸 밖) · 버튼 · 투표 중에도 열 수 있다
//   · 투표 바퀴: 지목 → 변론 → 죽일지/살릴지(살린다 ≥ 죽인다면 산다 → 다음 바퀴 전원 대상) · 최대 LIAR.VOTE_BOUTS 바퀴
// ★ 상태는 글자 + 기호(사무실 흑백 — D-324): 차례 ▶ · 지목 ● · 설명 함 ✓ · 라이어 🕵 대신 글 "라이어".
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
  defense: '최후의 변론',
  final: '죽일까 살릴까',
  guess: '라이어의 마지막 기회',
  reveal: '공개',
};

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

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
  // ★ R087 — 설명 기록 패널(기본 접힘) · Tab 은 어디서나 · H 는 입력칸 밖에서
  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const h = (e.key === 'h' || e.key === 'H' || e.key === 'ㅗ') && !typing(e.target);
      if (e.key === 'Tab' || h) {
        e.preventDefault();
        setLogOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const showNotice = notice && Date.now() - notice.at < 3000;
  const me = view.participants.includes(myAccountId) ? myAccountId : null;
  const myTurn = view.turn !== null && view.turn === me && (view.phase === 'describe' || view.phase === 'defense');
  const roundSays = view.says.filter((s) => s.kind === 'say');
  const saidSet = new Set(roundSays.map((s) => s.accountId));
  // 큰 줄 — 설명 단계: 바로 앞 설명 · 변론 · 죽일까 단계: 이 바퀴 변론
  const lastDefense = [...view.says].reverse().find((s) => s.kind === 'defense' && s.bout === view.bout) ?? null;
  const stageSay =
    view.phase === 'describe' || view.phase === 'assign'
      ? (roundSays[roundSays.length - 1] ?? null)
      : view.phase === 'defense' || view.phase === 'final'
        ? lastDefense
        : null;
  const boutTag = view.bouts > 1 && view.phase !== 'assign' && view.phase !== 'describe' && view.phase !== 'reveal' && view.phase !== 'guess' ? `${view.bout} / ${view.bouts}바퀴` : null;

  return (
    <section className={`card liar-card liar-${view.phase}`} data-liar-phase={view.phase} data-liar-bout={view.bout} aria-live="polite">
      <header className="liar-head">
        <span className="mg-badge">라이어 게임</span>
        <span className="mono liar-round">
          {view.round} / {view.rounds}라운드
        </span>
        <strong className="liar-phase">{PHASE_LABEL[view.phase]}</strong>
        {boutTag && <span className="mono liar-bout" data-liar-bout-tag>{boutTag}</span>}
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

      {/* ★ R087 — 큰 줄: 지금 단계의 설명 · 변론을 모두가 크게 */}
      {(view.phase === 'describe' || view.phase === 'assign' || view.phase === 'defense' || view.phase === 'final') && (
        <div className={`liar-stage-line${stageSay?.kind === 'defense' ? ' defense' : ''}`} data-liar-stage-line={stageSay ? stageSay.kind : ''}>
          {stageSay ? (
            <>
              <span className="liar-stage-who" style={{ color: colorOf(stageSay.accountId) }}>
                {stageSay.kind === 'defense' ? '변론 · ' : ''}
                {nameOf(stageSay.accountId)}
              </span>
              <span className={stageSay.auto ? 'liar-stage-text dim' : 'liar-stage-text'} data-liar-stage-text>
                {stageSay.text}
              </span>
            </>
          ) : (
            <span className="liar-stage-text dim">{view.phase === 'assign' ? '곧 한 사람씩 설명해요' : view.phase === 'defense' ? `${nameOf(view.accused)} 님의 최후의 변론을 기다리는 중…` : '첫 설명을 기다리는 중…'}</span>
          )}
        </div>
      )}

      {(view.phase === 'describe' || view.phase === 'defense') &&
        (myTurn ? (
          <SayInput key={`${view.round}:${view.phase}:${view.bout}:${view.says.length}`} socket={socket} defense={view.phase === 'defense'} />
        ) : (
          <p className="liar-help dim" data-liar-help>
            ▶ {nameOf(view.turn)} 님 {view.phase === 'defense' ? '최후의 변론' : '차례'} — 채팅은 자유롭게
          </p>
        ))}

      {/* 순서 줄 — 이름 · 차례 · 설명 함(글은 위 큰 줄 · 기록 패널) */}
      <ol className="liar-order liar-order-names" data-liar-order>
        {view.order.map((a) => (
          <li key={a} className={`${view.turn === a ? 'turn' : ''}${a === me ? ' me' : ''}${view.accused === a ? ' accused' : ''}`} data-liar-turn={view.turn === a ? '1' : ''}>
            <span className="liar-nick" style={{ color: colorOf(a) }}>
              {view.turn === a ? '▶ ' : saidSet.has(a) ? '✓ ' : ''}
              {nameOf(a)}
            </span>
          </li>
        ))}
      </ol>

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
                ● <strong>{nameOf(view.accused)}</strong> 지목 ({view.lastTally.counts[view.accused] ?? 0}표) — 최후의 변론
              </>
            ) : view.candidates ? (
              `동률 — ${view.candidates.map((c) => nameOf(c)).join(' · ')} 중에서 다시 투표`
            ) : view.bout < view.bouts ? (
              '이번 바퀴는 못 정했어요 — 모두를 대상으로 다시 투표'
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
                ? `시민 ${nameOf(view.accusedTried[view.accusedTried.length - 1] ?? null)} 님을 죽였어요 — 라이어 승리 +${LIAR.SCORE_LIAR_ESCAPE}`
                : `${view.bouts}바퀴 동안 라이어를 못 찾았어요 — 라이어 승리 +${LIAR.SCORE_LIAR_ESCAPE}`}
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

      {/* ★ R087 — 설명 기록(기본 접힘 · Tab / H · 버튼) */}
      <div className={logOpen ? 'liar-log open' : 'liar-log'} data-liar-log={logOpen ? 'open' : 'closed'}>
        <button type="button" className="ghost tiny liar-log-btn" data-liar-log-toggle aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
          설명 기록 {view.says.length} {logOpen ? '▴' : '▾'} <span className="dim liar-log-key">Tab</span>
        </button>
        {logOpen && (
          <ol className="liar-log-list" data-liar-log-list>
            {view.says.length === 0 && <li className="dim">아직 없어요</li>}
            {view.says.map((s, i) => (
              <li key={i} className={s.kind === 'defense' ? 'defense' : ''}>
                <span className="liar-nick" style={{ color: colorOf(s.accountId) }}>
                  {s.kind === 'defense' ? `변론(${s.bout}바퀴) · ` : ''}
                  {nameOf(s.accountId)}
                </span>
                <span className={s.auto ? 'liar-say dim' : 'liar-say'}>{s.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/** ★ R087 — 설명칸(차례인 사람만 · Enter = 등록 · 채팅과 따로) */
function SayInput({ socket, defense }: { socket: Socket; defense: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const send = () => {
    const t = text.trim();
    if (t) socket.emit('liar.say', { text: t });
  };
  return (
    <form
      className="quiz-num topic-form liar-say-form mine"
      data-liar-say-form={defense ? 'defense' : 'say'}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <p className="liar-help mine">{defense ? `내 최후의 변론 — 한 줄(${LIAR.SAY_MAX}자 · 키워드 금지)` : `내 차례 — 키워드 설명 한 줄(${LIAR.SAY_MAX}자 · 키워드는 말할 수 없어요)`}</p>
      <div className="quiz-num-row">
        <input
          ref={ref}
          className="quiz-num-input topic-input"
          data-liar-say-input
          maxLength={LIAR.SAY_MAX}
          value={text}
          autoComplete="off"
          placeholder={defense ? '변론 한 줄' : '설명 한 줄'}
          aria-label={defense ? '최후의 변론' : '키워드 설명'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              send();
            }
          }}
        />
        <button type="submit" className="primary quiz-num-ok" disabled={!text.trim()}>
          등록
        </button>
      </div>
    </form>
  );
}

function VoteCards({ view, me, nameOf, colorOf, socket }: { view: LiarView; me: string | null; nameOf: (id: string | null) => string; colorOf: (id: string) => string; socket: Socket }) {
  // ★ R087 — 바퀴마다 전원 대상(살아난 사람도) · 재투표는 동률자만
  const pool = (view.phase === 'revote' && view.candidates ? view.candidates : view.participants).filter((a) => a !== me);
  const saved = view.bout > 1 && view.phase === 'vote' && view.lastFinal && !view.lastFinal.passed ? view.accusedTried[view.accusedTried.length - 1] ?? null : null;
  return (
    <div className="liar-vote" data-liar-vote>
      {saved && (
        <p className="liar-help" data-liar-saved>
          지난 바퀴: {nameOf(saved)} 님 살림(죽인다 {view.lastFinal!.yes} · 살린다 {view.lastFinal!.no}) — 모두를 대상으로 다시
        </p>
      )}
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
        ● <strong>{nameOf(view.accused)}</strong> 님을 죽일까요, 살릴까요? <span className="dim">{view.votedCount}명 냄 · 살린다가 같거나 많으면 살아요</span>
      </p>
      {can ? (
        <div className="liar-final-btns">
          <button type="button" className={view.myFinal === true ? 'primary picked' : 'primary'} data-liar-yes onClick={() => socket.emit('liar.final', { yes: true })}>
            죽인다{view.myFinal === true ? ' ✓' : ''}
          </button>
          <button type="button" className={view.myFinal === false ? 'ghost picked' : 'ghost'} data-liar-no onClick={() => socket.emit('liar.final', { yes: false })}>
            살린다{view.myFinal === false ? ' ✓' : ''}
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
