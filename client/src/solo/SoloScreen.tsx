// =============================================================================
// ★★★ R118 (docs/24 4절 · 5-4 · R114 시안 "솔로 진행 안 A" · 솔로 시작 · 끝 · 띠 받는 순간) — 혼자 하기 화면
//
//   시작: 내 띠(누르면 단계표) · 최고 · 규칙 세 줄 · ★ R123 아이템 고르기(힌트 5P · 초성 10P · 넘기기 30P · 0~3개) · [시작]
//   진행(안 A): 목숨 · 맞힌 개수 / 문제 카드 / 입력칸 하나 / ★ R123 아이템 줄(Alt+1 · 2 · 3)
//   ★★ R123 (찬종 "템포가 너무 빨라서 지친다 · 숨 고르기") — 문제마다 정답 + 해설 → 점 셋 카운트(영상 nextCount 와 같다 — 1초에 하나 · 똑) → 다음.
//     해설 중 Enter(모바일 탭)면 바로 카운트로. 틀린 답은 보낸 순간 입력칸이 흔들리고 짧은 부저(시간 안이면 다시 친다).
//   끝: 기록 크게 · 최고 · 띠 · 얻은 포인트 · 쓴 아이템 · 틀린 문제(질문 짧게 + 정답) · [로비] [다시] — ★ R123 스크롤 없이 한 화면
//   띠 받는 순간: 끝 화면 위 짧은 그림 + 소리 하나 + "+40P"
//   ★ 앱 CSS · 지금 부품만 — 새 값은 R118 · R123 블록의 배치뿐.
//   ★ 화면을 벗어나면(visibilitychange · blur) 그 문제는 실패(4-5) — 시작 화면에 미리 알린다.
//   ★★ R123 B1 — 로비가 이미 들고 있는 내 기록(initialMe)으로 첫 그림부터 다 그린다 · 새로 받기는 판이 끝난 뒤 조용히.
//   ★★ R124 (찬종 "답 처리가 너무 느려" · "카운트다운 후에 시작" · "끝난 뒤 문제가 ... 로 생략") —
//     [시작] = 곧바로 3 · 2 · 1(같이 하기의 Countdown 부품 · tick 소리) → 첫 문제 · 분명히 틀린 답은 서버를 기다리지 않고 곧바로 흔든다 ·
//     끝 화면 틀린 문제 = 질문 · 정답 · 해설 전부(말줄임 없음 · 줄바꿈)
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createPortal } from 'react-dom';
import { ChevronLeft, Eye, Heart, Home, Lightbulb, Minus, Plus, RotateCcw, Send, SkipForward, TrendingUp, Type } from 'lucide-react';
import {
  BELT_COLORS,
  BELT_NAMES,
  BELT_ROMAN,
  BELT_STARTS,
  SOLO,
  SOLO_ITEMS,
  SOLO_ITEM_MAX,
  NO_SOLO_ITEMS,
  beltColorOf,
  beltLabel,
  soloItemsCost,
  type SoloEndView,
  type SoloItemCounts,
  type SoloItemKind,
  type SoloMeView,
} from '@quiz/shared';
import type { LucideIcon } from 'lucide-react';
import ConfirmModal from '../ConfirmModal.js';
import Countdown from '../Countdown.js';
import Icon from '../Icon.js';
import Notice from '../Notice.js';
import PopupClose from '../PopupClose.js';
import QuestionText from '../QuestionText.js';
import type { PointBalance } from '../api.js';
import { MINE, loadPoints, warmPoints } from '../mine.js';
import { useWarm } from '../warm.js';
import { sfx } from '../sound.js';
import { siteInfo } from '../site.js';
import { useShortcuts } from '../shortcuts.js';
import { isMobileUi } from '../uiMode.js';
import { BeltOf } from '../gongbang/Belt.js';
import { fetchSoloMe, useSolo } from './useSolo.js';
import GradeDots from '../GradeDots.js';

interface Props {
  socket: Socket;
  serverNow: () => number;
  /** 도는 판을 이어받으며 열었다(새로 고침 · 새 탭) */
  resume: boolean;
  onClose: () => void;
  /** ★ R123 B1 — 로비가 들고 있는 내 기록(있으면 첫 그림부터 다 그린다) · 새로 받은 값을 로비에도 돌려준다 */
  initialMe?: SoloMeView | null;
  onMe?: (m: SoloMeView) => void;
}

const ITEM_ICON: Record<SoloItemKind, LucideIcon> = { hint: Lightbulb, initial: Type, skip: SkipForward };
/** 아이템 고르기 — 판마다 남겨 둔다(다시 할 때 같은 것) */
let lastPick: SoloItemCounts = { ...NO_SOLO_ITEMS };

function Lives({ n }: { n: number }) {
  return (
    <span className="solo-lives" aria-label={`목숨 ${n}`} data-lives={n}>
      {Array.from({ length: SOLO.LIVES }, (_, i) => (
        <span key={i} className={i < n ? 'on' : 'off'}>
          <Icon icon={Heart} fill="currentColor" />
        </span>
      ))}
    </span>
  );
}

/** 띠 한 줄(크게) — 시작 · 끝 화면 · ★ R123 onOpen 이면 누르는 단추(단계표) */
function BeltLine({ step, sub, onOpen }: { step: number | null; sub: string; onOpen?: () => void }) {
  const body = (
    <>
      <BeltOf step={step} width={64} />
      <div>
        <b>{beltLabel(step)}</b>
        <small className="dim">{sub}</small>
      </div>
    </>
  );
  return onOpen ? (
    <button type="button" className="solo-belt solo-belt-btn" data-solo-belt={step ?? 'none'} data-belt-table-open onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="solo-belt" data-solo-belt={step ?? 'none'}>
      {body}
    </div>
  );
}

function nextText(next: { step: number; need: number } | null | undefined): string {
  if (!next) return '가장 높은 단계예요';
  if (next.step === 0) return '한 판이면 화이트벨트';
  const color = beltColorOf(next.step) !== beltColorOf(next.step - 1);
  return `${color ? '다음 띠' : '다음 단계'}까지 ${next.need}문제`;
}

/** ★★ R123 B3 — 띠 단계표(띠 다섯 × 숫자 다섯 · 칸마다 필요한 최고 기록 · 내 칸 · 다음 칸까지) — 스크롤 없이 한 화면 */
function BeltTable({ me, onClose }: { me: SoloMeView; onClose: () => void }) {
  const mine = me.belt ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal belt-table-pop" role="dialog" aria-label="띠 단계" data-belt-table>
        <div className="pop-head">
          <p className="pop-title">띠 단계</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="belt-table" role="table">
          {BELT_COLORS.map((color, ci) => (
            <div key={color} className="belt-row" role="row">
              <span className="belt-row-name" role="rowheader">
                {BELT_NAMES[color].replace('벨트', '')}
              </span>
              {BELT_ROMAN.map((r, di) => {
                const step = ci * 5 + di;
                const on = mine === step;
                const got = mine !== null && step <= mine;
                return (
                  <span key={r} role="cell" className={`belt-cell${on ? ' mine' : ''}${got ? ' got' : ''}`} data-belt-cell={step} aria-label={`${BELT_NAMES[color]} ${r} 최고 ${BELT_STARTS[step]}문제`}>
                    <BeltOf step={step} width={30} />
                    <small className="mono">{BELT_STARTS[step]}</small>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="belt-table-foot">
          <span>
            지금 <b>{beltLabel(mine)}</b>
          </span>
          <span className="dim">{nextText(me.next)}</span>
        </p>
        <p className="dim belt-table-note">숫자는 그 칸에 필요한 최고 기록이에요</p>
      </div>
    </div>,
    document.body,
  );
}

export default function SoloScreen({ socket, serverNow, resume, onClose, initialMe = null, onMe }: Props) {
  const { s, start, answer, away, quit, item, next, reset } = useSolo(socket, resume, serverNow);
  const belt = siteInfo().belt;
  const [me, setMe] = useState<SoloMeView | null>(initialMe);
  const [draft, setDraft] = useState('');
  const [quitOpen, setQuitOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [promo, setPromo] = useState<SoloEndView['belt'] | null>(null);
  const [now, setNow] = useState(() => serverNow());
  const [shake, setShake] = useState(false);
  const [pick, setPick] = useState<SoloItemCounts>(() => ({ ...lastPick }));
  // ★★★ R125 B1 — 잔액은 마지막에 안 값(mine)으로 바로 그리고 · 시작 화면 · 끝난 뒤 새로 받는다(쓰는 순간은 서버가 다시 센다)
  const points = useWarm<PointBalance>(MINE.points, loadPoints, false)?.balance ?? null;
  /** 마지막 문제의 해설을 다 봤다(Enter · 시간) — 그 뒤 끝 화면 */
  const [endSeen, setEndSeen] = useState(false);
  /** 이번 판에 아이템을 샀나 */
  const [bought, setBought] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobile = isMobileUi();

  // ★ R123 B1 — 내 기록은 판이 끝난 뒤에만 다시 받는다(시작 화면은 로비의 값으로 이미 다 그려져 있다) · 처음 값이 없으면 그때만 받는다
  useEffect(() => {
    if (s.phase !== 'end' && !(s.phase === 'start' && me === null)) return;
    let live = true;
    void fetchSoloMe().then((m) => {
      if (!live || !m) return;
      setMe(m);
      onMe?.(m);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);
  // 내 포인트(아이템 고르기) — 시작 화면에서 · 끝난 뒤(값이 바뀌었다)
  useEffect(() => {
    if (s.phase !== 'start' && s.phase !== 'end') return;
    void warmPoints();
  }, [s.phase]);

  // 남은 시간 · 해설 · 카운트 — 100ms 마다(보여 주기만 · 마감은 서버)
  useEffect(() => {
    if (s.phase !== 'play' && s.phase !== 'end' && s.phase !== 'starting') return;
    const id = window.setInterval(() => setNow(serverNow()), 100);
    return () => window.clearInterval(id);
  }, [s.phase, serverNow]);

  // 새 문제 — 입력칸 비우고 포커스 유지(휴대폰 키보드가 내려가지 않게)
  const qn = s.q?.n ?? 0;
  useEffect(() => {
    if (!qn) return;
    setDraft('');
    sfx('question');
    inputRef.current?.focus({ preventScroll: true });
  }, [qn]);
  // 결과 소리
  const lastKey = s.last ? `${s.last.n}:${s.last.end}` : '';
  useEffect(() => {
    if (!s.last) return;
    sfx(s.last.ok ? 'correct' : s.last.end === 'skip' ? 'skip' : 'timeout');
    setEndSeen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);
  // ★ R123 — 틀린 답 즉시: 입력칸 흔들림 + 짧은 부저
  useEffect(() => {
    if (!s.wrongSeq) return undefined;
    sfx('mg-foul');
    setShake(false);
    const raf = window.requestAnimationFrame(() => setShake(true));
    const id = window.setTimeout(() => setShake(false), 360);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, [s.wrongSeq]);
  // ★ R123 — 점 카운트 소리(영상 nextCount — 1초에 하나 · 똑)
  const countAt = s.last?.countAt ?? null;
  const dots = countAt !== null && now >= countAt ? Math.min(3, Math.floor((now - countAt) / 1000) + 1) : 0;
  const dotsRef = useRef(0);
  useEffect(() => {
    if (dots > dotsRef.current && dots >= 1) sfx('nextCount');
    dotsRef.current = dots;
  }, [dots]);
  // ★★ R124 — 시작 카운트다운 소리(같이 하기와 같은 tick · 1초에 하나)
  const countEndsAt = s.q === null && s.phase !== 'end' ? s.countEndsAt : null;
  const startSec = countEndsAt !== null ? Math.max(0, Math.ceil((countEndsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (startSec > 0) sfx('tick');
  }, [startSec]);
  // 마지막 문제(목숨 0): 해설 시간이 끝나면 끝 화면
  const explainUntil = s.last?.explainUntil ?? 0;
  const finalExplain = s.phase === 'end' && s.last !== null && s.last.nextAt === null && !endSeen;
  useEffect(() => {
    if (finalExplain && now >= explainUntil) setEndSeen(true);
  }, [finalExplain, now, explainUntil]);
  // 끝 — 띠가 올랐으면 그 순간(해설을 다 본 뒤)
  const showEnd = s.phase === 'end' && s.end !== null && !finalExplain;
  useEffect(() => {
    if (!showEnd || !s.end?.belt?.change) return;
    setPromo(s.end.belt);
    sfx('mg-final');
    const id = window.setTimeout(() => setPromo(null), 2600);
    return () => window.clearTimeout(id);
  }, [showEnd, s.end]);

  // 화면을 벗어나면 그 문제는 실패(4-5)
  const active = s.phase === 'play' && s.q !== null && s.last === null;
  useEffect(() => {
    if (!active || !s.q) return;
    const n = s.q.n;
    const onVis = () => {
      if (document.visibilityState === 'hidden') away(n);
    };
    const onBlur = () => away(n);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, [active, s.q, away]);

  // 해설 중인가(카운트 전) — Enter · 탭이면 바로 카운트로
  const explaining = s.last !== null && (countAt === null ? finalExplain : now < countAt);
  const skipExplain = () => {
    if (!s.last) return;
    if (s.phase === 'end') setEndSeen(true);
    else if (countAt !== null && now < countAt) next(s.last.n);
  };

  // ★ R123 — 해설 중 Enter 는 입력칸에 초점이 없어도 먹는다(문서 전체 · 입력칸의 Enter 는 입력칸이 처리)
  const skipRef = useRef(skipExplain);
  skipRef.current = skipExplain;
  useEffect(() => {
    if (!explaining) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || (e.target as HTMLElement | null)?.matches?.('[data-solo-input]')) return;
      e.preventDefault();
      skipRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [explaining]);

  const send = () => {
    const t = draft.trim();
    if (!t || !active || !s.q) return;
    answer(s.q, t);
    setDraft('');
  };

  // ★ R123 — 아이템(판 중) · 단축키 Alt+1 · 2 · 3(입력 중에도 · 모바일 화면에서도 작동 · 안내는 PC 에서만)
  const q = s.q;
  const left = q?.items ?? NO_SOLO_ITEMS;
  const usedHere = q?.usedHere ?? [];
  const canItem = (k: SoloItemKind) => active && left[k] > 0 && (k === 'skip' || !usedHere.includes(k)) && (k !== 'hint' || q?.hasHint !== false);
  const fireItem = (k: SoloItemKind) => {
    if (!q || !canItem(k)) return;
    item(q.n, k);
    inputRef.current?.focus({ preventScroll: true });
  };
  // 산 것이 있는 판만 아이템 줄(이어받은 판은 남은 개수로)
  const anyBought = s.phase === 'play' && (bought || left.hint + left.initial + left.skip > 0);
  useShortcuts(
    SOLO_ITEMS.map((it) => ({ combo: `Alt+${it.key}`, fkey: null, label: it.label, when: s.phase === 'play', run: () => fireItem(it.kind), hideInList: true })),
  );

  const remain = q ? Math.max(0, q.endsAt - now) : 0;
  const ratio = q ? Math.max(0, Math.min(1, remain / q.limitMs)) : 0;
  const urgent = active && remain <= 3000;
  const sec = Math.ceil(remain / 1000);

  const head = (title: string, back: (() => void) | null) => (
    <header className="room-head solo-head">
      <div className="room-title">
        {back && (
          <button type="button" className="ghost tiny gb-back" aria-label="뒤로" onClick={back}>
            <Icon icon={ChevronLeft} />
          </button>
        )}
        <h1>{title}</h1>
      </div>
    </header>
  );

  // ── 시작
  if (s.phase === 'start') {
    const cost = soloItemsCost(pick);
    const bal = points;
    const after = bal === null ? null : bal - cost;
    const setN = (k: SoloItemKind, d: number) => {
      const nextPick = { ...pick, [k]: Math.max(0, Math.min(SOLO_ITEM_MAX, pick[k] + d)) };
      lastPick = nextPick;
      setPick(nextPick);
    };
    return (
      <div className="solo-screen solo-start" data-solo="start">
        {head('혼자 하기', onClose)}
        <section className="card solo-me">
          {belt && (
            <BeltLine
              step={me?.belt ?? null}
              sub={me && me.runs > 0 ? `최고 ${me.best}문제, ${nextText(me.next)}` : nextText(me?.next)}
              onOpen={me ? () => setTableOpen(true) : undefined}
            />
          )}
          {!belt && <p className="solo-best">최고 기록 <b className="mono">{me?.best ?? 0}</b></p>}
        </section>
        <section className="card solo-rules" aria-label="규칙">
          <p>
            <span className="solo-rule-ic heart"><Icon icon={Heart} fill="currentColor" /></span>
            목숨 셋, 시간 안에 못 맞히면 하나씩 줄어요
          </p>
          <p>
            <span className="solo-rule-ic"><Icon icon={TrendingUp} /></span>
            맞힐수록 어려워져요
          </p>
          <p>
            <span className="solo-rule-ic"><Icon icon={Eye} /></span>
            화면을 벗어나면 그 문제는 실패
          </p>
        </section>
        {/* ★★ R123 B6 — 아이템 고르기(판마다 · 0~3개 · 남은 것은 판이 끝나면 돌려받는다) */}
        <section className="card solo-items-pick" aria-label="아이템" data-solo-items-pick>
          {SOLO_ITEMS.map((it) => {
            const canUp = pick[it.kind] < SOLO_ITEM_MAX && (bal === null || cost + it.price <= bal);
            return (
              <div key={it.kind} className="solo-item-row" data-item-row={it.kind}>
                <span className="solo-rule-ic"><Icon icon={ITEM_ICON[it.kind]} /></span>
                <span className="solo-item-name">
                  <b>{it.label}</b> <small className="dim mono">{it.price}P</small>
                </span>
                <span className="solo-stepper">
                  <button type="button" className="ghost tiny" aria-label={`${it.label} 빼기`} data-item-minus={it.kind} disabled={pick[it.kind] <= 0} onClick={() => setN(it.kind, -1)}>
                    <Icon icon={Minus} />
                  </button>
                  <b className="mono" data-item-count={it.kind}>{pick[it.kind]}</b>
                  <button type="button" className="ghost tiny" aria-label={`${it.label} 더하기`} data-item-plus={it.kind} disabled={!canUp} onClick={() => setN(it.kind, 1)}>
                    <Icon icon={Plus} />
                  </button>
                </span>
              </div>
            );
          })}
          <p className="solo-item-sum" data-item-sum={cost}>
            <span>
              쓸 포인트 <b className="mono">{cost}P</b>
            </span>
            <span className="dim">
              지금 <b className="mono">{bal ?? '?'}P</b>
            </span>
            <span className="dim">
              남을 포인트 <b className="mono">{after ?? '?'}P</b>
            </span>
          </p>
          <p className="dim solo-item-note">안 쓴 아이템은 판이 끝나면 돌려받아요</p>
        </section>
        {s.error && <Notice tone="bad" name="solo-start">{s.error}</Notice>}
        <button
          type="button"
          className="primary big-btn solo-go"
          data-solo-start
          onClick={() => {
            setBought(cost > 0);
            start(cost > 0 ? pick : undefined);
          }}
          disabled={after !== null && after < 0}
        >
          시작
        </button>
        {tableOpen && me && <BeltTable me={me} onClose={() => setTableOpen(false)} />}
      </div>
    );
  }

  // ── 끝
  if (showEnd && s.end) {
    const e = s.end;
    const beltPts = e.belt?.change?.points ?? 0;
    const used = e.items?.used;
    const usedText = used ? SOLO_ITEMS.filter((it) => used[it.kind] > 0).map((it) => `${it.label} ${used[it.kind]}`).join(', ') : '';
    return (
      <div className="solo-screen solo-end" data-solo="end">
        {head('혼자 하기 끝', null)}
        <section className={`card solo-result${e.wrongs.length > 0 ? ' compact' : ''}`} data-solo-score={e.correct}>
          <small className="dim">이번 기록</small>
          <b className="solo-huge mono">{e.correct}</b>
          <small>
            최고 <b className="mono">{e.best}</b>
            {e.newBest && e.correct > 0 && <b className="solo-newbest"> 새 기록!</b>}
          </small>
          {e.belt && <BeltLine step={e.belt.step} sub={nextText(e.belt.next)} onOpen={me ? () => setTableOpen(true) : undefined} />}
          {(beltPts > 0 || usedText || (e.items && e.items.refunded > 0)) && (
            <p className="solo-end-meta" data-solo-end-meta>
              {beltPts > 0 && <span className="solo-pts mono">+{beltPts}P</span>}
              {usedText && <span className="dim">쓴 아이템 {usedText}</span>}
              {e.items && e.items.refunded > 0 && <span className="dim">돌려받음 {e.items.refunded}P</span>}
            </p>
          )}
        </section>
        {/* ★ R123 B7 → ★★ R124 3-2(찬종 "... 로 생략되어 있고 눌러 봐도 안 나와") — 질문 · 정답 · 해설 전부(말줄임 없음 · 접지 않음) */}
        {e.wrongs.length > 0 && (
          <section className="card solo-wrongs" aria-label="틀린 문제" data-solo-wrongs>
            {e.wrongs.map((w) => (
              <div key={w.n} className="solo-wq" data-wq={w.n}>
                <p className="solo-wq-text">{w.text}</p>
                <p className="solo-wq-ans">
                  <small className="dim">정답</small> <b>{w.answer}</b>
                </p>
                {w.explanation && <p className="solo-wq-expl dim">{w.explanation}</p>}
              </div>
            ))}
          </section>
        )}
        <div className="solo-actions">
          <button type="button" data-solo-lobby onClick={onClose}>
            <Icon icon={Home} /> 로비
          </button>
          <button type="button" className="primary" data-solo-again onClick={() => {
            // 아이템을 고른 판이면 시작 화면에서 다시 확인(값이 든다) · 아니면 바로
            if (soloItemsCost(lastPick) > 0) reset();
            else {
              setBought(false);
              start();
            }
          }}>
            <Icon icon={RotateCcw} /> 다시
          </button>
        </div>
        {tableOpen && me && <BeltTable me={me} onClose={() => setTableOpen(false)} />}
        {promo?.change && (
          <div className="solo-promo-back" onPointerDown={() => setPromo(null)} data-solo-promo>
            <div className="solo-promo" role="status">
              <div className="solo-burst" aria-hidden="true" />
              <BeltOf step={promo.change.after} width={120} />
              <b>{beltLabel(promo.change.after)}</b>
              <small>
                {promo.change.before === null
                  ? '첫 띠를 받았어요'
                  : beltColorOf(promo.change.after) !== beltColorOf(promo.change.before)
                    ? '새 띠를 받았어요'
                    : '단계가 올랐어요'}
              </small>
              {promo.change.points > 0 && <span className="solo-pts mono">+{promo.change.points}P</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 진행(안 A) · 해설 · 카운트
  const last = s.last;
  const verdict = last ? (last.ok ? '정답!' : last.end === 'skip' ? '넘겼어요' : last.end === 'away' ? '화면을 벗어났어요' : '시간 끝') : '';
  return (
    <div className="solo-screen solo-play" data-solo="play">
      <div className="solo-bar">
        <Lives n={s.lives} />
        <span className="solo-sp" />
        <span className="solo-count">
          <small>맞힌 개수</small>
          <b className="mono" data-solo-correct>{s.correct}</b>
        </span>
        <button type="button" className="ghost tiny solo-quit" onClick={() => setQuitOpen(true)} disabled={s.phase === 'end' || s.phase === 'starting'}>
          그만하기
        </button>
      </div>
      <section
        className={`card question-card solo-q${urgent ? ' urgent' : ''}${last && !last.ok && last.end !== 'skip' ? ' miss' : ''}${last ? ' revealed' : ''}`}
        data-solo-q={q?.n ?? 0}
        data-solo-phase={last ? (explaining ? 'explain' : 'count') : 'question'}
        onPointerDown={last && explaining ? skipExplain : undefined}
      >
        {q ? (
          <>
            <div className="q-head">
              <span className="q-progress mono">{q.n}번째</span>
              <span className="badge cat">{q.category}</span>
              <GradeDots grade={q.grade} />
              {active && <span className={`q-timer mono${urgent ? ' urgent' : ''}`}>{sec}초</span>}
            </div>
            {last ? (
              <div className={`solo-reveal-big${last.ok ? ' ok' : last.end === 'skip' ? ' skip' : ' bad'}`} data-solo-reveal={last.ok ? 'ok' : last.end}>
                <b className="solo-verdict">{verdict}</b>
                <p className="solo-answer">
                  <small className="dim">정답</small> <b>{last.answer}</b>
                </p>
                {last.explanation && <p className="solo-expl" data-solo-expl>{last.explanation}</p>}
              </div>
            ) : (
              <>
                <QuestionText text={q.text} />
                {(q.hint || q.initial) && (
                  <div className="q-hints solo-hints">
                    {q.hint && (
                      <p className="q-hint q-hint-general open" data-solo-hint>
                        <span className="hint-label">힌트</span> <span>{q.hint}</span>
                      </p>
                    )}
                    {q.initial && (
                      <p className="q-hint open" data-solo-initial>
                        <span className="hint-label">초성</span> <span className="mono">{q.initial}</span>
                      </p>
                    )}
                  </div>
                )}
                <div className="q-timebar" aria-hidden="true">
                  <div className={`q-timebar-fill${urgent ? ' urgent' : ''}`} style={{ transform: `scaleX(${ratio})` }} />
                </div>
              </>
            )}
            {/* ★ R123 — "다음 문제" 점 셋(영상 QuestionFrame 의 예고 알약 꼴 · 1초에 하나 · 똑) · 자리는 해설 동안에도 비워 둔다 */}
            {last && last.nextAt !== null && (
              <span className={`solo-next${countAt !== null && now >= countAt ? ' on' : ''}`} data-solo-next={dots}>
                다음 문제
                <span className="solo-next-dots">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={dots >= i ? 'lit' : ''} />
                  ))}
                </span>
              </span>
            )}
            {last && explaining && !mobile && <small className="dim solo-skip-hint">Enter 로 넘어가기</small>}
          </>
        ) : countEndsAt !== null ? (
          <div className="solo-countdown" data-solo-countdown={startSec}>
            <Countdown socket={socket} endsAt={countEndsAt} serverNow={serverNow} isHost={false} />
          </div>
        ) : (
          <p className="dim solo-wait">문제를 고르는 중…</p>
        )}
      </section>
      <div className="field-row chat-input-row solo-input">
        <input
          ref={inputRef}
          value={draft}
          className={shake ? 'input-shake' : undefined}
          maxLength={SOLO.ANSWER_MAX_LEN}
          placeholder={active ? '정답을 입력하세요' : ''}
          aria-label="정답"
          data-solo-input
          autoComplete="off"
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!active && s.last) skipExplain();
            else send();
          }}
        />
        <button type="button" className="primary send-btn" aria-label="보내기" onMouseDown={(e) => e.preventDefault()} onClick={send} disabled={!active}>
          <Icon icon={Send} />
        </button>
      </div>
      {/* ★ R123 B6 — 아이템 줄(산 것이 있을 때만) · 남은 개수 · 단축키 안내는 PC 에서만 */}
      {anyBought && (
        <div className="solo-items" data-solo-items>
          {SOLO_ITEMS.map((it) => (
            <button
              key={it.kind}
              type="button"
              className="ghost tiny solo-item"
              data-solo-item={it.kind}
              data-left={left[it.kind]}
              disabled={!canItem(it.kind)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fireItem(it.kind)}
            >
              <Icon icon={ITEM_ICON[it.kind]} />
              <span>{it.label}</span>
              <b className="mono">{left[it.kind]}</b>
              {!mobile && <kbd className="dim">Alt+{it.key}</kbd>}
            </button>
          ))}
        </div>
      )}
      {quitOpen && (
        <ConfirmModal
          kind="solo-quit"
          title="그만할까요?"
          note="지금까지 맞힌 개수로 끝나요."
          actions={[{ label: '그만하기', tone: 'warn', onClick: () => { setQuitOpen(false); quit(); } }]}
          onCancel={() => setQuitOpen(false)}
        />
      )}
    </div>
  );
}
