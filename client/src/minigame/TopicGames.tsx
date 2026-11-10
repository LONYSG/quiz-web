// =============================================================================
// ★★★ R080 — 미니게임 1차 화면 (D-330 · D-337): 많이 말하기 · 겹치면 무효 · 객관식 5연속
//
// ★ 많이 말하기: 주제 · 남은 시간 막대 · 입력칸(Enter 마다 보냄 · 포커스 유지 — 모바일 키보드가 내려가지 않게 같은 요소) ·
//   서버 답(minigame.feedback — 나에게만)으로 ✓ 항목 이름 / 이미 말함 / ✗. 남의 답 · 남의 개수는 판 중에 안 보인다.
//   공개(roundResult): 사람마다 맞힌 것(나만 말한 답 표시) · 못 말한 것(많으면 접기) · "이건 왜 정답 아냐?"(내 오답을 채운 제보 창).
// ★ 겹치면 무효: 주제 · 15초 · 답 하나(바꿀 수 있음) — 내 답이 정답 집합 안인지만 바로 보인다(남과 겹치는지는 공개 때).
// ★ 객관식 5연속: 질문 + 보기 넷(1~4 키 · 클릭/톡) · 한 번만 · 7초.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Check, X } from 'lucide-react';
import Icon from '../Icon.js';
import { sfx } from '../sound.js';
import type { MinigameRoundRow, MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { isReportOpen, typingTarget } from '../reportGuard.js';
import { TopicReportButton } from '../AppReport.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}
type NameOf = (id: string) => { nickname: string; colorIndex: number } | undefined;

/** ★ 판(token)마다 주제 이름 · 객관식 문항 기록 — 최종 결과(round 가 비는 단계)에서 쓴다 */
const topicOfRun = new Map<string, string>();
const choiceLog = new Map<string, Map<number, { text: string; options: string[]; answer: number | null }>>();
export function rememberRound(view: MinigameView): void {
  const p = view.round?.params;
  if (!p) return;
  if (typeof p.nameKo === 'string') topicOfRun.set(view.token, p.nameKo);
  if (view.key === 'choice' && Array.isArray(p.options)) {
    let m = choiceLog.get(view.token);
    if (!m) choiceLog.set(view.token, (m = new Map()));
    const prev = m.get(view.roundIndex);
    const ans = view.round?.reveal && typeof view.round.reveal.answer === 'number' ? view.round.reveal.answer : (prev?.answer ?? null);
    m.set(view.roundIndex, { text: String(p.text ?? ''), options: p.options as string[], answer: ans });
  }
}

export function useTimer(view: MinigameView, serverNow: () => number) {
  const playing = view.phase === 'play';
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const playMs = view.round?.playMs ?? 30_000;
  const left = t0 !== null ? Math.max(0, 1 - (now - t0) / playMs) : 1;
  const leftSec = t0 !== null ? Math.max(0, Math.ceil((playMs - (now - t0)) / 1000)) : Math.round(playMs / 1000);
  return { key, t0, left, leftSec, playing, canPlay: playing && !view.spectating };
}

/** ★ R088 — hint: 겹치는 이름("서구")이면 "어느 서구? 앞 동네를 붙여 주세요" */
type Fb = { result: 'ok' | 'dup' | 'wrong'; label?: string | null; text?: string; count?: number; hint?: string };

/** 글 입력칸 하나(퀴즈 입력칸과 같은 꼴) — 보내도 비우기만 하고 포커스는 그대로 */
export function TopicInput({ canPlay, mobile, placeholder, onSend, resetKey, label }: { canPlay: boolean; mobile: boolean; placeholder: string; onSend: (t: string) => void; resetKey: string; label: string }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText('');
    if (canPlay && !mobile) window.setTimeout(() => !isReportOpen() && ref.current?.focus({ preventScroll: true }), 30);
  }, [resetKey, canPlay]);
  return (
    <form
      className="quiz-num topic-form"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!canPlay || !t) return;
        onSend(t);
        setText('');
      }}
    >
      <div className="quiz-num-row">
        <input
          ref={ref}
          className="quiz-num-input topic-input"
          data-topic-input
          size={12}
          maxLength={40}
          value={text}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          disabled={!canPlay}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
        />
        {canPlay && (
          <button type="submit" className="primary quiz-num-ok" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()}>
            확인
          </button>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 많이 말하기
// ─────────────────────────────────────────────────────────────────────────────
export function ManyTalk({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const t = useTimer(view, serverNow);
  const [st, setSt] = useState<{ key: string; found: string[]; last: Fb | null } | null>(null);
  const mine = st?.key === t.key ? st : null;
  useEffect(() => {
    const on = (fb: Fb & { token: string; roundIndex: number }) => {
      if (fb.token !== view.token || fb.roundIndex !== view.roundIndex) return;
      const k = `${fb.token}:${fb.roundIndex}`;
      setSt((s) => {
        const prev = s?.key === k ? s : { key: k, found: [] as string[], last: null };
        return { key: k, found: fb.result === 'ok' && fb.label ? [...prev.found, fb.label] : prev.found, last: fb };
      });
      sfx(fb.result === 'ok' ? 'mg-tap' : 'mg-foul');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);
  const send = (text: string) => {
    if (t.t0 === null) return;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text, elapsedMs: performance.now() - t.t0 } });
  };
  const last = mine?.last ?? null;
  const found = mine?.found ?? [];
  return (
    <div className="quiz-stage topic-stage many-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="topic-title" data-topic={String(p.topic ?? '')}>
        <strong>{String(p.nameKo ?? '')}</strong>
        <span className="dim"> — 최대한 많이! </span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
      {/* ★ R088 (D-345 · 18 §9 scope) — 정답 범위 한 줄(없으면 안 보임) */}
      {p.scope ? <p className="topic-scope dim" data-topic-scope>{String(p.scope)}</p> : null}
      <TopicInput canPlay={t.canPlay} mobile={mobile} resetKey={t.key} placeholder={view.spectating ? '구경 중' : '떠오르는 대로 치고 Enter'} label="정답 입력" onSend={send} />
      <p className={`quiz-num-help topic-fb${last?.result === 'ok' ? ' ok' : last ? ' bad' : ' dim'}`} data-feedback={last?.result ?? ''}>
        {last?.result === 'ok' ? (
          <>
            <Icon icon={Check} /> {last.label}
          </>
        ) : last?.result === 'dup' ? (
          `"${last.label ?? last.text}" — 이미 말했어요`
        ) : last?.result === 'wrong' ? (
          <>
            <Icon icon={X} /> {last.hint ? <span data-topic-hint>{last.hint}</span> : `"${last.text}" — 아니에요`}
          </>
        ) : view.spectating ? (
          '구경 중이에요 — 끝나면 모두의 답이 공개돼요'
        ) : (
          '남의 답은 끝나야 보여요'
        )}
      </p>
      {!view.spectating && (
        <div className="topic-mine" aria-label="내가 맞힌 것">
          <span className="topic-count mono" data-many-count={found.length}>
            {found.length}개
          </span>
          <span className="topic-chips">
            {found.map((l, i) => (
              <span key={`${l}-${i}`} className="topic-chip ok">
                {l}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** 많이 말하기 공개 — 사람마다 맞힌 것 · 나만 말한 답 · 못 말한 것 · 제보 버튼 */
export function ManyReveal({ view, rows, myAccountId, nameOf }: { view: MinigameView; rows: readonly MinigameRoundRow[]; myAccountId: string; nameOf: NameOf }) {
  const rv = view.round?.reveal ?? {};
  const labels = (rv.labels as Record<string, string> | undefined) ?? {};
  const missed = (rv.missed as string[] | undefined) ?? [];
  const topic = String(rv.nameKo ?? view.round?.params?.nameKo ?? '');
  const total = Number(rv.total ?? view.round?.params?.total ?? 0);
  const mine = rows.find((r) => r.accountId === myAccountId);
  const wrong = (mine?.extra?.wrong as string[] | undefined) ?? [];
  return (
    <div className="topic-reveal many-reveal" data-many-reveal>
      <p className="topic-reveal-title">
        <strong>{topic}</strong> <span className="dim">· 전체 {total}개</span>
      </p>
      <ul className="many-people">
        {rows.map((r) => {
          const n = nameOf(r.accountId);
          const ids = (r.extra?.found as string[] | undefined) ?? [];
          const only = new Set((r.extra?.only as string[] | undefined) ?? []);
          return (
            <li key={r.accountId} className={r.accountId === myAccountId ? 'me' : undefined} data-many-row={ids.length}>
              <span className="nick" style={{ color: `var(--p${n?.colorIndex ?? 0})` }}>
                {n?.nickname ?? '나간 사람'}
              </span>
              <span className="mono topic-count">{ids.length}개</span>
              <span className="topic-chips">
                {ids.map((id) => (
                  <span key={id} className={only.has(id) ? 'topic-chip only' : 'topic-chip'} title={only.has(id) ? '나만 말한 답' : undefined} data-only={only.has(id) ? '1' : undefined}>
                    {labels[id] ?? id}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      {missed.length > 0 && (
        <details className="topic-missed" open={missed.length <= 40} data-missed={missed.length}>
          <summary>
            아무도 못 말한 것 <span className="mono">{missed.length}</span>개
          </summary>
          <span className="topic-chips">
            {missed.map((l) => (
              <span key={l} className="topic-chip miss">
                {l}
              </span>
            ))}
          </span>
        </details>
      )}
      {!view.spectating && !view.practice && (
        <p className="topic-report-line">
          {wrong.length > 0 && <span className="dim">정답 아님 처리: {wrong.slice(-6).map((w) => `"${w}"`).join(' · ')}</span>}
          <TopicReportButton topic={topic} wrong={wrong} />
        </p>
      )}
    </div>
  );
}

/** 최종 결과 밑 — 제보 버튼만(주제는 판 기록에서) */
export function ManyFinalReport({ view, myAccountId }: { view: MinigameView; myAccountId: string }) {
  if (view.spectating || view.practice) return null;
  const row = view.roundResults[0]?.rows.find((r) => r.accountId === myAccountId);
  const wrong = (row?.extra?.wrong as string[] | undefined) ?? [];
  return (
    <p className="topic-report-line">
      <TopicReportButton topic={topicOfRun.get(view.token) ?? ''} wrong={wrong} />
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 겹치면 무효
// ─────────────────────────────────────────────────────────────────────────────
export function UniquePick({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const t = useTimer(view, serverNow);
  const [st, setSt] = useState<{ key: string; fb: Fb } | null>(null);
  const mine = st?.key === t.key ? st.fb : null;
  useEffect(() => {
    const on = (fb: Fb & { token: string; roundIndex: number }) => {
      if (fb.token !== view.token || fb.roundIndex !== view.roundIndex) return;
      setSt({ key: `${fb.token}:${fb.roundIndex}`, fb });
      sfx(fb.result === 'ok' ? 'mg-tap' : 'mg-foul');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);
  const send = (text: string) => {
    if (t.t0 === null) return;
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text, elapsedMs: performance.now() - t.t0 } });
  };
  return (
    <div className="quiz-stage topic-stage unique-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="topic-title" data-topic={String(p.topic ?? '')}>
        <strong>{String(p.nameKo ?? '')}</strong>
        <span className="dim"> — 남과 안 겹칠 답 하나! </span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
      {/* ★ R088 (D-345 · 18 §9 scope) — 정답 범위 한 줄(없으면 안 보임) */}
      {p.scope ? <p className="topic-scope dim" data-topic-scope>{String(p.scope)}</p> : null}
      <TopicInput canPlay={t.canPlay} mobile={mobile} resetKey={t.key} placeholder={view.spectating ? '구경 중' : mine ? '바꾸려면 다시 치기' : '답 하나 → Enter'} label="답 입력" onSend={send} />
      <p className={`quiz-num-help topic-fb${mine?.result === 'ok' ? ' ok' : mine ? ' bad' : ' dim'}`} data-feedback={mine?.result ?? ''} data-unique-mine={mine?.label ?? mine?.text ?? ''}>
        {mine?.result === 'ok' ? (
          <>
            내 답 <strong>{mine.label}</strong> <Icon icon={Check} /> <span className="dim">· 바꿔도 돼요</span>
          </>
        ) : mine ? (
          <>
            <Icon icon={X} /> {mine.hint ? <span data-topic-hint>{mine.hint}</span> : `"${mine.text}" — 이 주제의 정답이 아니에요(0점) · 다시!`}
          </>
        ) : view.spectating ? (
          '구경 중이에요'
        ) : (
          '마지막에 낸 답 하나만 — 남과 같으면 둘 다 0점'
        )}
      </p>
    </div>
  );
}

export function UniqueReveal({ view, rows, myAccountId, nameOf }: { view: MinigameView; rows: readonly MinigameRoundRow[]; myAccountId: string; nameOf: NameOf }) {
  const topic = String(view.round?.reveal?.nameKo ?? view.round?.params?.nameKo ?? '');
  return (
    <div className="topic-reveal unique-reveal" data-unique-reveal>
      <p className="topic-reveal-title">
        <strong>{topic}</strong>
      </p>
      <ul className="unique-people">
        {rows.map((r) => {
          const n = nameOf(r.accountId);
          const ex = r.extra ?? {};
          const text = (ex.label as string | null) ?? (ex.text as string | undefined) ?? null;
          const state = !text ? 'none' : ex.win ? 'win' : ex.dup ? 'dup' : 'bad';
          return (
            <li key={r.accountId} className={`${r.accountId === myAccountId ? 'me ' : ''}u-${state}`} data-unique-state={state}>
              <span className="nick" style={{ color: `var(--p${n?.colorIndex ?? 0})` }}>
                {n?.nickname ?? '나간 사람'}
              </span>
              <span className="unique-ans">{text ?? '안 냄'}</span>
              <span className="unique-tag">{state === 'win' ? '+1' : state === 'dup' ? '겹침 · 0' : state === 'bad' ? '정답 아님 · 0' : '0'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 객관식 5연속
// ─────────────────────────────────────────────────────────────────────────────
export function ChoicePick({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const options = (p.options as string[] | undefined) ?? [];
  const t = useTimer(view, serverNow);
  const [picked, setPicked] = useState<{ key: string; c: number } | null>(null);
  const mine = picked?.key === t.key ? picked.c : null;
  const pick = (c: number) => {
    if (!t.canPlay || mine !== null || t.t0 === null) return;
    setPicked({ key: t.key, c });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { choice: c, elapsedMs: performance.now() - t.t0 } });
  };
  useEffect(() => {
    if (!t.canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      e.preventDefault();
      e.stopPropagation();
      pick(n - 1);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  return (
    <div className="quiz-stage choice-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${(mine !== null ? 0 : t.left) * 100}%` }} />
      </div>
      <p className="choice-q no-copy">
        <span className="badge choice-cat">{String(p.category ?? '')}</span> {String(p.text ?? '')}
      </p>
      <div className="choice-grid">
        {options.map((o, i) => (
          <button key={i} type="button" className={`choice-opt${mine === i ? ' picked' : ''}${mine !== null && mine !== i ? ' other' : ''}`} data-choice={i} disabled={!t.canPlay || mine !== null} onClick={() => pick(i)}>
            {!mobile && <span className="choice-key mono">{i + 1}</span>}
            <span className="choice-text">{o}</span>
          </button>
        ))}
      </div>
      <p className="quiz-num-help dim">{mine !== null ? '골랐어요!' : view.spectating ? '구경 중이에요' : mobile ? '보기를 톡' : '1 ~ 4 키 또는 클릭'}</p>
    </div>
  );
}

export function ChoiceReveal({ view, mine }: { view: MinigameView; mine: MinigameRoundRow | undefined }) {
  const p = view.round?.params ?? {};
  const options = (p.options as string[] | undefined) ?? [];
  const ans = Number(view.round?.reveal?.answer ?? -1);
  const my = typeof mine?.extra?.choice === 'number' ? (mine.extra.choice as number) : null;
  return (
    <div className="choice-reveal" data-choice-reveal>
      <p className="choice-q no-copy">{String(p.text ?? '')}</p>
      <div className="choice-grid">
        {options.map((o, i) => (
          <span key={i} className={`choice-opt${i === ans ? ' answer' : ''}${my === i && i !== ans ? ' wrong' : ''}${my === i ? ' picked' : ''}`} data-choice-answer={i === ans ? '1' : undefined}>
            <span className="choice-text">{o}</span>
            {i === ans && <Icon icon={Check} />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 최종 — 10문제 정답(내가 틀린 것 표시) */
export function ChoiceAnswers({ view, myAccountId }: { view: MinigameView; myAccountId: string }) {
  const log = choiceLog.get(view.token);
  if (!log || log.size === 0) return null;
  return (
    <ol className="choice-answers" data-choice-answers>
      {view.roundResults.map((rr) => {
        const q = log.get(rr.roundIndex);
        if (!q) return null;
        const row = rr.rows.find((r) => r.accountId === myAccountId);
        const ok = row?.extra?.correct === true;
        return (
          <li key={rr.roundIndex} className={view.spectating ? undefined : ok ? 'ok' : 'bad'}>
            <span className="choice-a-q">{q.text}</span>
            <strong className="choice-a-a">{q.answer !== null ? q.options[q.answer] : '?'}</strong>
          </li>
        );
      })}
    </ol>
  );
}

/** 판 결과 표의 값 글 */
export function topicValueText(view: MinigameView, r: MinigameRoundRow): string {
  if (view.key === 'many') return `${Number(((r.extra?.found as unknown[]) ?? []).length)}개`;
  if (view.key === 'unique') {
    const ex = r.extra ?? {};
    const text = (ex.label as string | null) ?? (ex.text as string | undefined) ?? null;
    return !text ? '안 냄' : ex.win ? `${text}` : ex.dup ? `${text} · 겹침` : `${text} · 정답 아님`;
  }
  if (!r.submitted) return '안 고름';
  return r.extra?.correct ? `정답 ${((r.value ?? 0) / 1000).toFixed(2)}초` : '오답';
}
