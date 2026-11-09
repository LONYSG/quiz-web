// =============================================================================
// ★★★ R081 — 미니게임 2차 화면 (D-338): 순서대로 · 빙고
//
// ★ 순서대로: 카드 5 — 누른 차례대로 ①~⑤ · 누른 카드를 다시 누르면 그것과 뒤 번호 취소 · 바뀔 때마다 지금 순서를 보낸다(마지막 상태) ·
//   PC 1~5 키. 공개 = 정답 순서 + 연도 · 내 순서(자리 맞음 ✓) · 쌍 점수.
// ★ 빙고: 4×4 내 판(서버가 나에게만 보냄 — private.board) · 채우기 판 = 많이 말하기 꼴 입력칸 · 호명 판 = 내 판의 안 칠한 칸 하나 누르기(한 번) ·
//   칠한 칸 ✓ + 바탕(사무실 흑백에도 기호로 — D-324) · 호명 띠(누가 뭘 · 몇 판에 있었나 · 자동).
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Check } from 'lucide-react';
import Icon from '../Icon.js';
import { sfx } from '../sound.js';
import type { MinigameRoundRow, MinigameView } from '../useRoom.js';
import { typingTarget } from '../reportGuard.js';
import { TopicInput, useTimer } from './TopicGames.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}
type NameOf = (id: string) => { nickname: string; colorIndex: number } | undefined;
type Card = { id: string; label: string };
const NUM = ['①', '②', '③', '④', '⑤', '⑥'];

// ─────────────────────────────────────────────────────────────────────────────
// 순서대로
// ─────────────────────────────────────────────────────────────────────────────
export function OrderPick({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const cards = (p.cards as Card[] | undefined) ?? [];
  const t = useTimer(view, serverNow);
  const [st, setSt] = useState<{ key: string; picked: string[] } | null>(null);
  const picked = st?.key === t.key ? st.picked : [];
  const press = (id: string) => {
    if (!t.canPlay) return;
    const i = picked.indexOf(id);
    const next = i >= 0 ? picked.slice(0, i) : [...picked, id];
    setSt({ key: t.key, picked: next });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { order: next } });
  };
  useEffect(() => {
    if (!t.canPlay) return undefined;
    const on = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > cards.length) return;
      e.preventDefault();
      e.stopPropagation();
      press(cards[n - 1]!.id);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  const done = picked.length === cards.length && cards.length > 0;
  return (
    <div className="quiz-stage order-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${t.left * 100}%` }} />
      </div>
      <p className="topic-title" data-topic={String(p.topic ?? '')}>
        <strong>{String(p.nameKo ?? '')}</strong>
        <span className="dim"> — 오래된 것부터 차례로 ({String(p.basis ?? '연도')}) </span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
      <div className="order-cards">
        {cards.map((c, i) => {
          const at = picked.indexOf(c.id);
          return (
            <button key={c.id} type="button" className={`order-card${at >= 0 ? ' picked' : ''}`} data-order-card={c.id} data-order-at={at >= 0 ? at + 1 : ''} disabled={!t.canPlay} onClick={() => press(c.id)}>
              {!mobile && <span className="choice-key mono">{i + 1}</span>}
              <span className="order-num mono" aria-hidden={at < 0}>
                {at >= 0 ? NUM[at] : ''}
              </span>
              <span className="order-label">{c.label}</span>
            </button>
          );
        })}
      </div>
      <p className={`quiz-num-help${done ? ' ok' : ' dim'}`} data-order-done={done ? '1' : ''}>
        {view.spectating ? '구경 중이에요' : done ? '다 골랐어요 — 시간 안에 바꿔도 돼요' : `${picked.length} / ${cards.length} — 다 눌러야 점수 · 두 장씩 앞뒤 순서가 맞은 쌍마다 1점(10쌍)`}
      </p>
    </div>
  );
}

export function OrderReveal({ view, mine }: { view: MinigameView; mine: MinigameRoundRow | undefined }) {
  const p = view.round?.params ?? {};
  const ans = (view.round?.reveal?.answer as (Card & { year: number })[] | undefined) ?? [];
  const my = (mine?.extra?.order as string[] | undefined) ?? [];
  const labelOf = new Map(ans.map((a) => [a.id, a.label]));
  return (
    <div className="topic-reveal order-reveal" data-order-reveal>
      <p className="topic-reveal-title">
        <strong>{String(p.nameKo ?? '')}</strong> <span className="dim">· {String(p.basis ?? '연도')} 순</span>
      </p>
      <ol className="order-answer">
        {ans.map((a, i) => (
          <li key={a.id} className={my[i] === a.id ? 'ok' : my.length ? 'bad' : undefined}>
            <span className="mono order-year">{a.year}</span>
            <span className="order-label">{a.label}</span>
            {my.length === ans.length && (
              <span className="order-mine dim">
                {my[i] === a.id ? <Icon icon={Check} /> : `내 ${i + 1}번: ${labelOf.get(my[i] ?? '') ?? '—'}`}
              </span>
            )}
          </li>
        ))}
      </ol>
      {/* ★ R087 (D-344 · 찬종 "틀려도 점수 주는 거 같은데") — 점수식은 그대로(D-338) · 표시를 크게 · 뜻을 한 줄로 */}
      {mine && !view.spectating && (
        <div className="order-pairs" data-order-pairs={mine.extra?.pairs ?? ''}>
          {my.length === ans.length ? (
            <>
              <p className="order-pairs-big">
                맞은 쌍 <strong className="mono">{Number(mine.extra?.pairs ?? 0)} / 10</strong> → <strong className="mono">{Number(mine.extra?.pairs ?? 0)}점</strong>
              </p>
              <p className="dim order-pairs-why">카드 두 장씩 10쌍 중 앞뒤 순서가 맞은 쌍 수 — 하나만 자리를 바꾸면 9 · 전부 거꾸로면 0</p>
            </>
          ) : (
            <p className="order-pairs-big">다 못 골랐어요 — 0점</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 빙고
// ─────────────────────────────────────────────────────────────────────────────
type Cell = { id: string; label: string; marked: boolean } | null;
type Hist = { round: number; accountId: string; label: string; auto: boolean; onBoards: number; mine: boolean };
interface BingoPriv {
  board: Cell[];
  manual: number;
  lines: number;
  bingoAt: number | null;
  bingos: number;
  history: Hist[];
}
const privOf = (view: MinigameView) => (view.round?.private ?? null) as unknown as BingoPriv | null;

export function BingoBoard({ board, size, onPick, picked, disabled }: { board: Cell[]; size: number; onPick?: (i: number) => void; picked?: number | null; disabled?: boolean }) {
  return (
    <div className="bingo-board" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} data-bingo-board>
      {board.map((c, i) => (
        <button
          key={i}
          type="button"
          className={`bingo-cell${c?.marked ? ' on' : ''}${picked === i ? ' picked' : ''}${c ? '' : ' empty'}`}
          data-bingo-cell={i}
          data-on={c?.marked ? '1' : ''}
          disabled={disabled || !onPick || !c || c.marked}
          onClick={() => onPick?.(i)}
        >
          {c ? <span className="bingo-label">{c.label}</span> : <span className="dim">·</span>}
          {c?.marked && <span className="bingo-check" aria-label="칠함">✓</span>}
        </button>
      ))}
    </div>
  );
}

function CallBand({ calls, nameOf }: { calls: { accountId: string; label: string; auto: boolean; onBoards: number }[]; nameOf: NameOf }) {
  if (!calls.length) return null;
  return (
    <ul className="bingo-band" data-bingo-band={calls.length}>
      {calls.map((c, i) => {
        const n = nameOf(c.accountId);
        return (
          <li key={i}>
            <span className="nick" style={{ color: `var(--p${n?.colorIndex ?? 0})` }}>
              {n?.nickname ?? '?'}
            </span>{' '}
            <strong>{c.label}</strong>
            <span className="dim">
              {' '}
              · {c.onBoards}판{c.auto ? ' · 자동' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function BingoPlay({ socket, view, serverNow, mobile }: Props) {
  const nameOf: NameOf = (id) => view.participants.find((x) => x.accountId === id);
  const p = view.round?.params ?? {};
  const size = Number(p.size ?? 4);
  const fill = p.phase === 'fill';
  const t = useTimer(view, serverNow);
  const priv = privOf(view);
  const [fb, setFb] = useState<{ key: string; result: string; label?: string; text?: string } | null>(null);
  // ★ 채우기 중에는 판이 다시 오지 않는다(내 입력은 나에게만 — 방 전체 알림 없음) → 내 판정(cell · label)으로 바로 채워 보인다
  const [local, setLocal] = useState<{ key: string; cells: Record<number, string> } | null>(null);
  const [pick, setPick] = useState<{ key: string; cell: number } | null>(null);
  const myPick = pick?.key === t.key ? pick.cell : null;
  const myFb = fb?.key === t.key ? fb : null;
  useEffect(() => {
    const on = (f: { token: string; roundIndex: number; result: string; label?: string; text?: string; cell?: number }) => {
      if (f.token !== view.token || f.roundIndex !== view.roundIndex) return;
      const k = `${f.token}:${f.roundIndex}`;
      setFb({ key: k, result: f.result, label: f.label, text: f.text });
      if (f.result === 'ok' && typeof f.cell === 'number') setLocal((s) => ({ key: k, cells: { ...(s?.key === k ? s.cells : {}), [f.cell as number]: f.label ?? '' } }));
      sfx(f.result === 'ok' ? 'mg-tap' : 'mg-foul');
    };
    socket.on('minigame.feedback', on);
    return () => {
      socket.off('minigame.feedback', on);
    };
  }, [socket, view.token, view.roundIndex]);
  const send = (text: string) => socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text } });
  const call = (cell: number) => {
    if (!t.canPlay || myPick !== null || priv?.bingoAt) return;
    setPick({ key: t.key, cell });
    sfx('mg-tap');
    socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { cell } });
  };
  const mineLocal = local?.key === t.key ? local.cells : {};
  const board: Cell[] = (priv?.board ?? Array.from({ length: size * size }, () => null)).map((c, i) => c ?? (mineLocal[i] !== undefined ? { id: `local-${i}`, label: mineLocal[i]!, marked: false } : null));
  const filled = board.filter(Boolean).length;
  const lastRound = Math.max(0, ...(priv?.history ?? []).map((h) => h.round));
  return (
    <div className="quiz-stage bingo-stage">
      <div className="circle-bar" aria-hidden="true">
        <span style={{ width: `${(myPick !== null ? 0 : t.left) * 100}%` }} />
      </div>
      <p className="topic-title" data-topic={String(p.topic ?? '')}>
        <strong>{String(p.nameKo ?? '')}</strong>
        <span className="dim">{fill ? ' — 내 판을 채우세요! ' : ` — 호명 ${String(p.call)}/${String(p.calls)} · ${priv?.lines ?? 0}줄 `}</span>
        <span className="mono topic-left">{t.leftSec}초</span>
      </p>
      {fill ? (
        <>
          <TopicInput canPlay={t.canPlay && filled < board.length} mobile={mobile} resetKey={t.key} placeholder={view.spectating ? '구경 중' : filled >= board.length ? '판이 다 찼어요' : '정답 치고 Enter → 다음 칸'} label="빙고 칸 채우기" onSend={send} />
          <p className={`quiz-num-help topic-fb${myFb?.result === 'ok' ? ' ok' : myFb ? ' bad' : ' dim'}`} data-feedback={myFb?.result ?? ''}>
            {myFb?.result === 'ok'
              ? `✓ ${myFb.label} — ${filled}/${board.length}칸`
              : myFb?.result === 'dup'
                ? `"${myFb.label}" — 이미 판에 있어요`
                : myFb?.result === 'wrong'
                  ? `✗ "${myFb.text}" — 아니에요`
                  : myFb?.result === 'full'
                    ? '판이 다 찼어요'
                    : view.spectating
                      ? '구경 중이에요'
                      : '남이 많이 고를 것 같은 답일수록 잘 불려요 · 빈 칸은 끝에 자동으로'}
          </p>
        </>
      ) : (
        <p className="quiz-num-help dim" data-bingo-call-help>
          {view.spectating
            ? '구경 중이에요'
            : priv?.bingoAt
              ? `빙고! (${priv.bingoAt}번째 호명) — 끝날 때까지 구경`
              : myPick !== null
                ? '불렀어요 — 모두 동시에 공개'
                : `내 판에서 부를 칸 하나를 ${mobile ? '톡' : '클릭'} — 안 고르면 자동`}
        </p>
      )}
      {!view.spectating && <BingoBoard board={board} size={size} onPick={fill ? undefined : call} picked={myPick} disabled={!t.canPlay || Boolean(priv?.bingoAt)} />}
      {!fill && lastRound > 0 && (
        <CallBand calls={(priv?.history ?? []).filter((h) => h.round === lastRound)} nameOf={nameOf} />
      )}
    </div>
  );
}

export function BingoReveal({ view, rows, myAccountId, nameOf }: { view: MinigameView; rows: readonly MinigameRoundRow[]; myAccountId: string; nameOf: NameOf }) {
  const p = view.round?.params ?? {};
  const rv = view.round?.reveal ?? {};
  const priv = privOf(view);
  const size = Number(p.size ?? 4);
  const newBingo = (rv.newBingo as string[] | undefined) ?? [];
  return (
    <div className="topic-reveal bingo-reveal" data-bingo-reveal={String(rv.phase ?? '')}>
      <p className="topic-reveal-title">
        <strong>{String(p.nameKo ?? '')}</strong>{' '}
        <span className="dim">{rv.phase === 'fill' ? '· 판 완성 — 이제 호명!' : `· 호명 ${String(rv.round ?? '')}`}</span>
      </p>
      {rv.phase === 'call' && <CallBand calls={(rv.calls as { accountId: string; label: string; auto: boolean; onBoards: number }[] | undefined) ?? []} nameOf={nameOf} />}
      {newBingo.length > 0 && (
        <p className="bingo-new" data-bingo-new={newBingo.length}>
          빙고! {newBingo.map((a) => nameOf(a)?.nickname ?? '?').join(' · ')}
        </p>
      )}
      {priv && !view.spectating && (
        <>
          <BingoBoard board={priv.board} size={size} />
          <p className="quiz-num-help dim" data-bingo-mine={priv.lines}>
            {rv.phase === 'fill' ? `직접 채운 ${priv.manual}칸 · 나머지 ${size * size - priv.manual}칸은 자동` : `${priv.lines}줄${priv.bingoAt ? ' · 빙고!' : ''}`}
          </p>
        </>
      )}
      {rv.phase === 'call' && (
        <p className="dim bingo-left">
          빙고 {rows.filter((r) => r.extra?.bingoAt).length} / {rows.length}명{rv.over ? ' — 끝!' : ''}
        </p>
      )}
      {myAccountId ? null : null}
    </div>
  );
}

export function orderBingoValueText(view: MinigameView, r: MinigameRoundRow): string {
  if (view.key === 'order') return r.submitted && r.value !== null ? `${r.value}쌍` : '못 고름';
  const ex = r.extra ?? {};
  if (ex.bingoAt) return `빙고(${String(ex.bingoAt)}번째)`;
  if (ex.manual !== undefined && ex.lines === undefined) return `직접 ${String(ex.manual)}칸`;
  return `${Number(ex.lines ?? 0)}줄 · ${Number(ex.marked ?? 0)}칸`;
}
