// =============================================================================
// ★★★ R085 — OX 10연속 화면 (D-342 · docs/18 §11)
//
// ★ 판: 문장 하나(크게) · O / X 큰 버튼 두 개(PC: O · X 키 또는 ← →) · 5초 · 누르면 바꿀 수 있음(마지막 — 다시 눌러 바꿈).
// ★ 공개(문장마다): 정답 O/X · 해설 한 줄 · 내 답 맞음/틀림. 최종: 10 문장 정답 + 해설 목록(내가 틀린 것 표시).
// ★ 상태는 색 + 글자(O · X · ✓ · ✗) — 사무실 테마 흑백(D-324)에서도 읽힌다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Check, X } from 'lucide-react';
import Icon from '../Icon.js';
import { sfx } from '../sound.js';
import type { MinigameRoundRow, MinigameView } from '../useRoom.js';
import { typingTarget } from '../reportGuard.js';
import { useTimer } from './TopicGames.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

/** ★ 판(token)마다 문장 · 정답 · 해설 — 최종 결과(round 가 비는 단계)에서 목록으로 */
const oxLog = new Map<string, Map<number, { statement: string; answer: boolean | null; explanation: string }>>();
export function rememberOx(view: MinigameView): void {
  if (view.key !== 'ox') return;
  const p = view.round?.params;
  if (!p || typeof p.statement !== 'string') return;
  let m = oxLog.get(view.token);
  if (!m) oxLog.set(view.token, (m = new Map()));
  const prev = m.get(view.roundIndex);
  const rv = view.round?.reveal;
  m.set(view.roundIndex, {
    statement: p.statement,
    answer: rv && typeof rv.answer === 'boolean' ? rv.answer : (prev?.answer ?? null),
    explanation: rv && typeof rv.explanation === 'string' ? rv.explanation : (prev?.explanation ?? ''),
  });
}

const OX = (b: boolean) => (b ? 'O' : 'X');

export function OxPick({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const t = useTimer(view, serverNow);
  const [picked, setPicked] = useState<{ key: string; v: boolean } | null>(null);
  const mine = picked?.key === t.key ? picked.v : null;
  const pick = (v: boolean) => {
    if (!t.canPlay || t.t0 === null || mine === v) return;
    setPicked({ key: t.key, v });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { pick: v, elapsedMs: Math.round(performance.now() - t.t0) } });
  };
  useEffect(() => {
    if (!t.canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      const v = k === 'o' || e.key === 'ArrowLeft' || k === 'ㅐ' ? true : k === 'x' || e.key === 'ArrowRight' || k === 'ㅌ' ? false : null;
      if (v === null) return;
      e.preventDefault();
      e.stopPropagation();
      pick(v);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  return (
    <div className="quiz-stage ox-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="ox-statement no-copy" data-ox-statement>
        {p.category ? <span className="badge choice-cat">{String(p.category)}</span> : null} {String(p.statement ?? '')}
      </p>
      <div className="ox-buttons">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`ox-btn ${v ? 'o' : 'x'}${mine === v ? ' picked' : ''}${mine !== null && mine !== v ? ' other' : ''}`}
            data-ox={OX(v)}
            aria-pressed={mine === v}
            disabled={!t.canPlay}
            onClick={() => pick(v)}
          >
            <span className="ox-mark">{OX(v)}</span>
            {!mobile && <span className="ox-key mono">{v ? 'O · ←' : 'X · →'}</span>}
          </button>
        ))}
      </div>
      <p className="quiz-num-help dim" data-ox-mine={mine === null ? '' : OX(mine)}>
        {mine !== null ? `${OX(mine)} 골랐어요 — 바꿔도 돼요` : view.spectating ? '구경 중이에요' : `맞으면 O · 틀리면 X — ${t.leftSec}초`}
      </p>
    </div>
  );
}

export function OxReveal({ view, mine }: { view: MinigameView; mine: MinigameRoundRow | undefined }) {
  const rv = view.round?.reveal ?? {};
  const ans = rv.answer === true;
  const my = typeof mine?.extra?.pick === 'boolean' ? (mine.extra.pick as boolean) : null;
  return (
    <div className="ox-reveal" data-ox-reveal={OX(ans)}>
      <p className="ox-statement small no-copy">{String(rv.statement ?? view.round?.params?.statement ?? '')}</p>
      <p className="ox-answer">
        <span className={`ox-mark big ${ans ? 'o' : 'x'}`}>{OX(ans)}</span>
        {my !== null && !view.spectating && (
          <span className={`ox-my ${my === ans ? 'ok' : 'bad'}`} data-ox-my={my === ans ? 'ok' : 'bad'}>
            <Icon icon={my === ans ? Check : X} /> 내 답 {OX(my)}
          </span>
        )}
        {my === null && !view.spectating && <span className="ox-my none">안 고름</span>}
      </p>
      <p className="ox-expl" data-ox-expl>
        {String(rv.explanation ?? '')}
      </p>
    </div>
  );
}

/** 최종 — 10 문장 정답 + 해설(내가 틀린 것 표시) */
export function OxAnswers({ view, myAccountId }: { view: MinigameView; myAccountId: string }) {
  const log = oxLog.get(view.token);
  if (!log || log.size === 0) return null;
  return (
    <ol className="ox-answers" data-ox-answers>
      {view.roundResults.map((rr) => {
        const q = log.get(rr.roundIndex);
        if (!q) return null;
        const row = rr.rows.find((r) => r.accountId === myAccountId);
        const ok = row?.extra?.correct === true;
        return (
          <li key={rr.roundIndex} className={view.spectating ? undefined : ok ? 'ok' : 'bad'} data-ox-row={ok ? 'ok' : 'bad'}>
            <strong className={`ox-mark ${q.answer ? 'o' : 'x'}`}>{q.answer === null ? '?' : OX(q.answer)}</strong>
            <span className="ox-a-text">
              <span className="ox-a-q">{q.statement}</span>
              {q.explanation && <span className="ox-a-e dim">{q.explanation}</span>}
            </span>
            {!view.spectating && <span className="ox-a-mine">{ok ? '✓' : '✗'}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** 판 결과 표의 값 글 */
export function oxValueText(r: MinigameRoundRow): string {
  if (typeof r.extra?.pick !== 'boolean') return '안 고름';
  return r.extra.correct ? `${OX(r.extra.pick as boolean)} 정답 ${((r.value ?? 0) / 1000).toFixed(2)}초` : `${OX(r.extra.pick as boolean)} 오답`;
}
