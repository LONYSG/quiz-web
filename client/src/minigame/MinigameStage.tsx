// =============================================================================
// ★★★ 미니게임 화면 (R050 · D-234) — 단계마다 한 장면. 미니게임별 화면은 play 단계에만 끼운다
//   R050 케이크 · 균형 / ★ R051 번개손 · 타자 · 완벽한 원 · 각도 (PLAY 표 — 새 게임은 한 줄 + 규칙 그림 · 판 결과 값 글 하나)
//
//   intro(깜짝 이벤트! 징글 · BGM 바뀜) → rules(그림 + 한 줄 + 조작법 PC/모바일 따로) → ready(n판) → play → roundResult(판 순위) → … →
//   final(최종 순위 · 받은 점수) → outro(퀴즈로 / 로비로 · BGM 원래대로)
// ★ 소수 표시: 서버가 판마다 정한 자리 수(decimals — 1위와 2위가 갈리는 자리)로 표 전체를 같게.
// ★ 시작 때 방에 없던 사람은 "구경 중" (입력이 없다).
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  BALANCE_BOTTOM_Y,
  BALANCE_TOP_Y,
  balanceItem,
  formatMinigameValue,
  meatDoneness,
  minigameInfo,
  type BalanceKind,
} from '@quiz/shared';
import { BookOpenCheck, Crosshair, Gamepad2, Hand, Globe2, ImageIcon, Keyboard, PartyPopper, Ruler, Scale, ScanSearch, Tag, Trophy, Users, Zap } from 'lucide-react';
import Icon from '../Icon.js';
import Avatar from '../Avatar.js';
import DeviceIcon from '../DeviceIcon.js';
import { setMusicMode, sfx } from '../sound.js';
import { useUiMode } from '../uiMode.js';
import type { MinigameRoundRow, MinigameView, PlayerView } from '../useRoom.js';
import BalanceArt, { pathOf } from './BalanceArt.js';
import BalanceGuard from './BalanceGuard.js';
import CakeWait, { CakeArt, MeatArt } from './CakeWait.js';
import AngleMatch, { ANGLE_VX, ANGLE_VY, rayEnd } from './AngleMatch.js';
import CircleDraw from './CircleDraw.js';
import ReactionTap, { fakeName } from './ReactionTap.js';
import TypingRace from './TypingRace.js';
import PhotoGuess from './PhotoGuess.js';
import QuizNumber from './QuizNumber.js';
import QuizReveal, { WhichSummary, quizValueText } from './QuizReveal.js';
import { preloadAll, preloadQuizImages } from './QuizParts.js';
import { QNo, QReportButton } from '../AppReport.js';
import WhichPick from './WhichPick.js';
import { GaugeStop, MinorityPick, OddOneGrid, twemoji } from './R053Games.js';
import { BalloonArt, BalloonBlow, TapRush } from './R054Games.js';

/** ★ 판 진행 화면 — 미니게임 키 → 컴포넌트 */
const PLAY = {
  cake: CakeWait,
  balance: BalanceGuard,
  reaction: ReactionTap,
  typing: TypingRace,
  circle: CircleDraw,
  angle: AngleMatch,
  // ★ R052 — 퀴즈류 다섯
  price: QuizNumber,
  worldprice: QuizNumber,
  photo: PhotoGuess,
  estimate: QuizNumber,
  which: WhichPick,
  // ★ R053 — 미니게임 3차
  minority: MinorityPick,
  oddone: OddOneGrid,
  gauge: GaugeStop,
  // ★ R054
  balloon: BalloonBlow,
  tap: TapRush,
} as const;
const R053_KEYS = new Set(['minority', 'oddone', 'gauge', 'balloon', 'tap']);
const QUIZ_KEYS = new Set(['price', 'worldprice', 'photo', 'estimate', 'which']);
/** 진행 중 "n / m명 …" 의 말 */
const SUBMIT_WORD: Record<keyof typeof PLAY, string> = { cake: '누름', balance: '확정', reaction: '누름', typing: '완성', circle: '그림', angle: '확정', price: '냄', worldprice: '냄', photo: '맞힘', estimate: '냄', which: '고름', minority: '고름', oddone: '찾음', gauge: '멈춤', balloon: '멈춤', tap: '끝' };

interface Props {
  socket: Socket;
  view: MinigameView;
  players: PlayerView[];
  myAccountId: string;
  isHost: boolean;
  serverNow: () => number;
}

export default function MinigameStage({ socket, view, players, myAccountId, isHost, serverNow }: Props) {
  const info = minigameInfo(view.key);
  const mobile = useUiMode() === 'mobile';
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);
  const leftSec = Math.max(0, Math.ceil((view.phaseEndsAt - serverNow()) / 1000));

  // ── 소리 · 음악 (단계가 바뀔 때 한 번)
  const phaseKey = `${view.token}:${view.phase}:${view.roundIndex}`;
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (lastPhase.current === phaseKey) return;
    lastPhase.current = phaseKey;
    switch (view.phase) {
      case 'intro':
        setMusicMode('minigame');
        sfx('mg-jingle');
        // ★ R063 — 판 그림을 규칙 화면 동안 미리 받아 decode(다른 하나 찾기)
        if (view.preload) void preloadAll(view.preload);
        break;
      case 'ready':
        // ★ R052 — 퀴즈류는 다음 문항 그림을 미리 받는다
        if (QUIZ_KEYS.has(view.key)) preloadQuizImages(view);
        if (view.preload) void preloadAll(view.preload);
        // ★ 케이크는 리듬을 들어야 한다 — 판 동안 배경음악을 끈다
        if (view.key === 'cake' || view.key === 'reaction' || view.key === 'gauge') setMusicMode('quiet');
        sfx('mg-ready');
        break;
      case 'play':
        // ★ 번개손은 "시작" 소리를 내지 않는다(신호 소리와 헷갈린다) · 타자는 자기 입력칸에 포커스를 둔다
        if (view.key !== 'reaction') sfx('mg-go');
        // 모바일 키보드 내림 · PC 채팅 입력에서 손 떼기 (Space · 방향키가 미니게임으로)
        if (view.key !== 'typing') (document.activeElement as HTMLElement | null)?.blur?.();
        break;
      case 'roundResult':
        setMusicMode('minigame');
        if (view.key === 'balance') sfx('mg-cut');
        else if (view.key !== 'which') sfx('mg-round');
        break;
      case 'final':
        sfx('mg-final');
        break;
      case 'outro':
        sfx('mg-return');
        setMusicMode('normal');
        break;
    }
  }, [phaseKey, view.phase, view.key]);
  useEffect(() => () => setMusicMode('normal'), []);

  const nameOf = (id: string) => view.participants.find((p) => p.accountId === id) ?? players.find((p) => p.accountId === id);
  const roundNo = view.roundIndex + 1;
  const lastResult = view.roundResults[view.roundResults.length - 1];

  return (
    <section className={`card mg-card mg-${view.key} mg-phase-${view.phase}`} data-phase={view.phase} aria-live="polite">
      <header className="mg-head">
        <span className="mg-badge">
          <Icon icon={Gamepad2} /> 미니게임
        </span>
        <strong className="mg-name">{info.name}</strong>
        {/* ★★★ R057 — 미니게임만: 몇 번째 미니게임인지 */}
        {view.series && (
          <span className="badge mg-series mono" data-series={`${view.series.index}/${view.series.total}`}>
            미니게임 {view.series.index}/{view.series.total}
          </span>
        )}
        {view.roundIndex >= 0 && view.phase !== 'final' && view.phase !== 'outro' && (
          <span className="mg-round mono">
            {roundNo} / {view.roundCount}판
          </span>
        )}
        {view.practice && <span className="badge mg-practice">연습</span>}
        {view.spectating && <span className="badge off">구경 중</span>}
        <span className="mg-spacer" />
        {(view.phase === 'intro' || view.phase === 'rules' || view.phase === 'ready' || view.phase === 'roundResult' || view.phase === 'final') && (
          <span className="mg-left mono">{leftSec}초</span>
        )}
        {view.practice && isHost && (
          <button type="button" className="ghost tiny" onClick={() => socket.emit('host.forceEnd', {})}>
            그만하기
          </button>
        )}
      </header>

      {view.phase === 'intro' && (
        <div className="mg-intro">
          <p className="mg-intro-pop">
            <Icon icon={PartyPopper} /> 깜짝 이벤트!
          </p>
          <p className="mg-intro-name">{info.name}</p>
          <p className="dim">
            {view.practice
              ? '연습 판 — 점수 · 포인트 없음'
              : view.series
                ? `미니게임만 — ${view.series.total}개 이어서!`
                : `${view.afterQuestionIndex ?? ''}번째 문제를 지나 잠깐 미니게임!`}
          </p>
        </div>
      )}

      {view.phase === 'rules' && (
        <div className="mg-rules">
          <div className="mg-rules-art">
            <RulesArt k={view.key} />
          </div>
          {/* ★ R064 — 규칙은 설명문(줄바꿈 감사에서 의도한 줄바꿈) */}
          <div className="mg-rules-text" data-wrap-ok>
            <p className="mg-rules-line">{info.oneLine}</p>
            <p className="mg-rules-ctrl">
              <span className="hint-label">{mobile ? '모바일' : 'PC'}</span> {mobile ? info.controlsMobile : info.controlsPc}
            </p>
            {view.key === 'cake' && <p className="dim mg-rules-note">블루투스 이어폰은 소리가 늦게 들려요 — 화면 숫자를 믿으세요</p>}
            {view.key === 'reaction' && <p className="dim mg-rules-note">진짜 신호는 초록 화면 — 소리를 꺼도 초록만 보면 돼요 · 노란 화면 · 글자 · 소리만은 가짜</p>}
            {view.key === 'typing' && <p className="dim mg-rules-note">한글 짧은 문장 · 영어 · 한글 긴 문장 — 30초 안에 못 치면 친 만큼(%)으로</p>}
            {/* ★ R063 (D-259) — 내부 규칙 · 계산 설명은 적지 않는다(찬종 #17) — 판 수와 보상만 */}
            <p className="dim mg-rules-note">
              {view.roundCount}판 · {view.practice ? '연습' : `${bonusRanks(view.participants.length)}는 포인트도!`}
            </p>
          </div>
        </div>
      )}

      {view.phase === 'ready' && (
        <div className="mg-ready">
          <p className="mg-ready-n mono">{roundNo}판</p>
          <p className="mg-ready-desc">{readyDesc(view)}</p>
          <p className="mg-ready-go">준비…</p>
        </div>
      )}

      {view.phase === 'play' && <PlayView socket={socket} view={view} serverNow={serverNow} mobile={mobile} />}

      {view.phase === 'play' && !view.spectating && (
        <p className="mg-submitted dim">
          {view.submittedCount} / {view.participants.length}명 {SUBMIT_WORD[view.key]}
        </p>
      )}

      {view.phase === 'roundResult' && lastResult && (
        <RoundResult view={view} result={lastResult} myAccountId={myAccountId} nameOf={nameOf} />
      )}

      {view.phase === 'final' && view.final && (
        <div className="mg-final">
          <p className="mg-final-title">
            <Icon icon={Trophy} /> 최종 결과
          </p>
          {/* ★ R060 (D-253) — 한 미니게임 안 동점은 공동 순위 · "공동 1위" 로 적는다 */}
          <ol className={view.final.some((f, i) => view.final!.findIndex((x) => x.rank === f.rank) !== i) ? 'mg-table has-co' : 'mg-table'}>
            {view.final.map((f) => {
              const p = nameOf(f.accountId);
              // ★ R057 — 미니게임만은 게임 점수에 순위 점수(인원 − 순위 + 1)가 들어간다(보너스는 포인트로만)
              const add = view.series ? view.participants.length - f.rank + 1 : f.reward;
              return (
                <li key={f.accountId} className={f.accountId === myAccountId ? 'me' : undefined} data-rank={f.rank}>
                  <span className="mg-rank mono">{view.final!.filter((x) => x.rank === f.rank).length > 1 ? `공동 ${f.rank}위` : `${f.rank}위`}</span>
                  {p && <Avatar xs nickname={p.nickname} colorIndex={p.colorIndex} accountId={p.accountId} avatarV={players.find((x) => x.accountId === p.accountId)?.avatarV ?? null} />}
                  <span className="nick mg-nick" style={{ color: `var(--p${p?.colorIndex ?? 0})` }}>
                    {p?.nickname ?? '나간 사람'}
                  </span>
                  <DeviceIcon device={(p as { device?: 'pc' | 'mobile' | null } | undefined)?.device} />
                  <span className="mg-total mono">{f.total}점</span>
                  <span className={add > 0 ? 'mg-reward on mono' : 'mg-reward mono'}>{view.practice ? '연습' : add > 0 ? `+${add}` : '—'}</span>
                </li>
              );
            })}
          </ol>
          {view.key === 'which' && <WhichSummary view={view} nameOf={nameOf} />}
          <p className="dim mg-final-note">
            {view.practice ? '연습' : `${bonusRanks(view.participants.length)}는 포인트도!`}
          </p>
        </div>
      )}

      {view.phase === 'outro' && (
        <div className="mg-outro">
          <p className="mg-outro-line">
            {/* ★ R060 — 미니게임만이면 퀴즈로 가지 않는다(찬종 2026-10-21) */}
            {view.practice
              ? '로비로 돌아갑니다'
              : view.series
                ? view.series.index >= view.series.total
                  ? '결과로!'
                  : '다음 미니게임으로!'
                : '퀴즈로 돌아갑니다!'}
          </p>
        </div>
      )}
    </section>
  );
}

/** ★ R060 — 보너스를 받는 순위(minigameReward — 둘 1위 · 3~4명 1 · 2위 · 5명 이상 1~3위). 둘이서 "1~3위" 로 적던 것 */
function bonusRanks(n: number): string {
  return n <= 2 ? '1위' : n <= 4 ? '1 · 2위' : '1~3위';
}

function PlayView(props: { socket: Socket; view: MinigameView; serverNow: () => number; mobile: boolean }) {
  const C = PLAY[props.view.key];
  return <C {...props} />;
}

function readyDesc(view: MinigameView): string {
  const p = view.round?.params ?? {};
  switch (view.key) {
    case 'cake': {
      const sp = Number(p.speed ?? 1);
      return `${p.durationSec}초${sp !== 1 ? ` · ${sp}배속` : ''} · ${p.hideAfterSec}초 뒤 가려져요`;
    }
    case 'balance':
      return `${String(p.label ?? '')} — 정확히 반으로!`;
    case 'reaction':
      return p.quickdraw ? '퀵드로우 — 가짜 신호를 조심하세요!' : '초록이 되면 바로!';
    case 'typing':
      return p.lang === 'en' ? '영어 문장' : p.size === 'long' ? '한글 긴 문장' : '한글 짧은 문장';
    case 'circle':
      return '한 번에 · 동그랗게 · 크게';
    case 'angle':
      return '눈금 없이 — 감으로!';
    case 'price':
      return '얼마일까?';
    case 'worldprice':
      return `${String((p.target as { countryKo?: string } | undefined)?.countryKo ?? '')}에서는?`;
    case 'photo':
      return p.revealMode === 'zoom' ? '확대 → 점점 멀어져요' : p.revealMode === 'mosaic' ? '모자이크가 점점 풀려요' : '사진을 보고!';
    case 'estimate':
      return '어림해 보세요';
    case 'which':
      return '';
    case 'minority':
      return '남들이 안 고를 숫자는?';
    case 'oddone':
      return `${String(p.size ?? '')} × ${String(p.size ?? '')} 격자`;
    case 'gauge':
      return p.hidden ? '가운데가 가려져요 — 감으로!' : `왕복 ${(Number(p.periodMs ?? 0) / 1000).toFixed(1)}초`;
    case 'balloon':
      return '딱 100 — 넘으면 펑!';
    case 'tap':
      return '10초 — 최대한 많이!';
  }
}

/** 규칙 안내 그림 */
function RulesArt({ k }: { k: MinigameView['key'] }) {
  switch (k) {
    case 'cake':
      return <CakeArt open={false} small />;
    case 'balance':
      return <RulesBalanceArt />;
    case 'reaction':
      return (
        <div className="mg-rules-icon rx-demo" aria-hidden="true">
          <span className="rx-demo-red">준비…</span>
          <span className="rx-demo-green">
            <Icon icon={Zap} /> 지금!
          </span>
        </div>
      );
    case 'typing':
      return (
        <div className="mg-rules-icon" aria-hidden="true">
          <Icon icon={Keyboard} className="mg-rules-big" />
          <span className="typing-demo">
            <span className="tc ok">가는 말</span>
            <span className="tc bad">이</span>
            <span className="tc todo"> 고와야</span>
          </span>
        </div>
      );
    case 'circle':
      return (
        <svg viewBox="0 0 100 100" className="mg-rules-svg" aria-hidden="true">
          <circle cx="50" cy="50" r="34" className="circle-fit" />
          <path d="M50 14 C72 13 86 30 85 51 C84 72 70 86 49 85 C28 84 15 70 15 50 C15 31 30 17 46 15" className="circle-ink" />
        </svg>
      );
    case 'price':
    case 'worldprice':
    case 'photo':
    case 'estimate':
    case 'which': {
      const I = { price: Tag, worldprice: Globe2, photo: ImageIcon, estimate: Ruler, which: Scale }[k];
      return (
        <div className="mg-rules-icon" aria-hidden="true">
          <Icon icon={I} className="mg-rules-big" />
          <span className="quiz-rules-tag">
            <Icon icon={BookOpenCheck} /> 퀴즈류
          </span>
        </div>
      );
    }
    case 'minority':
    case 'oddone':
    case 'balloon':
      return <BalloonArt pct={180} />;
    case 'tap':
    case 'gauge': {
      const I = { minority: Users, oddone: ScanSearch, gauge: Crosshair, tap: Hand }[k];
      return (
        <div className="mg-rules-icon" aria-hidden="true">
          <Icon icon={I} className="mg-rules-big" />
        </div>
      );
    }
    case 'angle': {
      const e = rayEnd(37);
      const b = rayEnd(0);
      return (
        <svg viewBox="0 0 200 120" className="mg-rules-svg angle-rules" aria-hidden="true">
          <line x1={ANGLE_VX} y1={ANGLE_VY} x2={b.x} y2={b.y} className="angle-ray base" />
          <line x1={ANGLE_VX} y1={ANGLE_VY} x2={e.x} y2={e.y} className="angle-ray mine" />
          <circle cx={e.x} cy={e.y} r={4.2} className="angle-handle-dot" />
          <text x="40" y="40" className="angle-rules-num">
            37°
          </text>
        </svg>
      );
    }
  }
}

function RulesBalanceArt() {
  const item = useMemo(() => balanceItem('steak', 4242), []);
  return (
    <svg viewBox="0 0 100 100" className="mg-rules-svg" aria-hidden="true">
      <BalanceArt item={item} small />
      <line x1={0} y1={BALANCE_TOP_Y} x2={100} y2={BALANCE_TOP_Y} className="balance-rail" />
      <line x1={0} y1={BALANCE_BOTTOM_Y} x2={100} y2={BALANCE_BOTTOM_Y} className="balance-rail" />
      <line x1={44} y1={BALANCE_TOP_Y} x2={56} y2={BALANCE_BOTTOM_Y} className="balance-cut" />
      <circle cx={44} cy={BALANCE_TOP_Y} r={2.6} className="balance-handle-dot" />
      <circle cx={56} cy={BALANCE_BOTTOM_Y} r={2.6} className="balance-handle-dot" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 판 결과
// ─────────────────────────────────────────────────────────────────────────────
function RoundResult({
  view,
  result,
  myAccountId,
  nameOf,
}: {
  view: MinigameView;
  result: MinigameView['roundResults'][number];
  myAccountId: string;
  nameOf: (id: string) => { nickname: string; colorIndex: number; accountId: string } | undefined;
}) {
  const d = result.decimals;
  const mine = result.rows.find((r) => r.accountId === myAccountId);
  const valueText = (r: MinigameRoundRow) => {
    // ★ R052 — 퀴즈류는 입력 값 · % · 시간 · 맞음/틀림
    if (QUIZ_KEYS.has(view.key)) return quizValueText(view, r);
    // ★ R053
    if (view.key === 'minority') return r.extra?.pick ? `${String(r.extra.pick)} ${r.extra.win ? '· 소수파!' : ''}` : '안 고름';
    if (view.key === 'oddone') return r.value !== null && r.submitted ? `${(r.value / 1000).toFixed(2)}초${r.extra?.wrong ? ` (+${Number(r.extra.wrong) * 2})` : ''}` : r.extra?.wrong ? `못 찾음 (${String(r.extra.wrong)}번 틀림)` : '못 찾음';
    if (view.key === 'gauge') return r.value !== null ? `${formatMinigameValue(r.value, d)}%` : '안 누름';
    if (view.key === 'balloon') return r.extra?.popped ? `펑! (${Number(r.extra.size ?? 0)})` : r.value !== null && r.submitted ? `${r.value}${r.value === 100 ? ' 만점' : ''}` : '안 붊';
    if (view.key === 'tap') return r.value !== null ? `${r.value}번` : '안 누름';
    // ★ R051 — 번개손 실격 · 타자 미완은 값 대신 이유 (submitted 가 false 여도 진행률은 보인다)
    if (view.key === 'reaction' && r.extra?.foul) return r.extra.foul === 'fake' ? `속음(${fakeName(String(r.extra.fakeKind))})` : '성급!';
    if (view.key === 'typing' && r.extra?.unfinished) return `미완 ${formatMinigameValue(Number(r.extra.pct ?? 0), 0)}%`;
    if (!r.submitted || r.value === null) return view.key === 'cake' || view.key === 'reaction' ? '안 누름' : view.key === 'typing' ? '못 침' : '—';
    switch (view.key) {
      case 'cake':
        return `${formatMinigameValue(r.error ?? 0, d, true)}초`;
      case 'balance': {
        const a = Number(r.extra?.aPct ?? r.value);
        const b = 100 - a;
        return `${formatMinigameValue(Math.min(a, b), d)} : ${formatMinigameValue(Math.max(a, b), d)}`;
      }
      case 'reaction':
        return `${formatMinigameValue(r.value, d)}ms`;
      case 'typing':
        return `${formatMinigameValue(r.value, d)}초`;
      case 'circle':
        return `${formatMinigameValue(r.value, d)}%`;
      case 'angle':
        return `${formatMinigameValue(r.value, d)}° 차이`;
    }
  };
  return (
    <div className={`mg-result${QUIZ_KEYS.has(view.key) || R053_KEYS.has(view.key) ? ' wide' : ''}`}>
      {QUIZ_KEYS.has(view.key) ? (
        <>
          <QuizReveal view={view} mine={view.spectating ? undefined : mine} />
          {/* ★ R061 — 미니게임 문항 번호(minigame_items.item_id · 누르면 복사) · 📝 */}
          {view.round?.itemId && (
            <p className="mg-item-id">
              <QNo id={view.round.itemId} raw />
              <QReportButton minigameItem={view.round.itemId} />
            </p>
          )}
        </>
      ) : R053_KEYS.has(view.key) ? (
        <R053Result view={view} mine={view.spectating ? undefined : mine} decimals={d} />
      ) : view.key === 'reaction' || view.key === 'typing' || view.key === 'circle' || view.key === 'angle' ? (
        <R051Result view={view} mine={view.spectating ? undefined : mine} first={result.rows[0]} decimals={d} />
      ) : view.key === 'balance' ? (
        <BalanceCutShow view={view} row={mine ?? result.rows[0]} decimals={d} />
      ) : (
        <div className="mg-cake-result">
          {/* ★ R063 — 내 굽기(±0.3초 딱 좋게 · 일찍 덜 익음 · 늦게 탐) */}
          <MeatArt d={meatDoneness(mine && !view.spectating ? (mine.submitted ? (mine.error ?? null) : null) : 0).d} small />
          {mine && !view.spectating && <p className={`meat-label ${meatDoneness(mine.submitted ? (mine.error ?? null) : null).level}`}>{meatDoneness(mine.submitted ? (mine.error ?? null) : null).label}</p>}
          {mine && !view.spectating && (
            // ★ 내 줄은 셋째 자리까지(브리핑 예: "−0.123초(일찍) / +0.045초(늦게)") — 표는 1·2위가 갈리는 자리(규칙 6)
            <p className={`mg-cake-mine mono${mine.submitted && Math.abs(mine.error ?? 9) < 0.05 ? ' perfect' : ''}`}>
              {mine.submitted ? (
                <>
                  {formatMinigameValue(mine.error ?? 0, 3, true)}초
                  {Number(formatMinigameValue(mine.error ?? 0, 3)) > 0 && <span className="mg-early"> ({(mine.error ?? 0) < 0 ? '일찍' : '늦게'})</span>}
                </>
              ) : (
                '안 눌렀어요'
              )}
              {mine.submitted && Math.abs(mine.error ?? 9) < 0.05 && <span className="mg-perfect">완벽!</span>}
            </p>
          )}
        </div>
      )}
      <ol className="mg-table">
        {result.rows.map((r) => {
          const p = nameOf(r.accountId);
          return (
            <li key={r.accountId} className={r.accountId === myAccountId ? 'me' : undefined} data-rank={r.rank}>
              <span className="mg-rank mono">{r.rank}위</span>
              <span className="nick mg-nick" style={{ color: `var(--p${p?.colorIndex ?? 0})` }}>
                {p?.nickname ?? '나간 사람'}
              </span>
              <span className="mg-value mono">
                {valueText(r)}
                {r.extra?.experienced ? <span className="quiz-seen-tag"> · 이미 본 문항</span> : null}
              </span>
              <span className="mg-points mono">+{r.points}</span>
            </li>
          );
        })}
      </ol>
      {(view.key === 'circle' || view.key === 'angle') && (
        <div className="mg-thumbs" aria-label="모두의 결과">
          {result.rows.map((r) => (
            <R051Thumb key={r.accountId} view={view} row={r} name={nameOf(r.accountId)} decimals={d} />
          ))}
        </div>
      )}
      {view.key === 'balance' && (
        <div className="mg-thumbs" aria-label="누가 어떻게 잘랐나">
          {result.rows.map((r) => (
            <CutThumb key={r.accountId} view={view} row={r} name={nameOf(r.accountId)} decimals={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function cutPieces(top: number, bottom: number) {
  // 자를 선의 양쪽 반평면(넉넉한 사각형)
  const dx = bottom - top;
  const dy = BALANCE_BOTTOM_Y - BALANCE_TOP_Y;
  const len = Math.hypot(dx, dy);
  const nx = (dy / len) * 300;
  const ny = (-dx / len) * 300;
  const a = { x: top - dx * 3, y: BALANCE_TOP_Y - dy * 3 };
  const b = { x: bottom + dx * 3, y: BALANCE_BOTTOM_Y + dy * 3 };
  const left = [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }];
  const right = [a, b, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
  return { left: pathOf(left), right: pathOf(right), nx: nx / 300, ny: ny / 300 };
}

/** 내 자른 선 — 칼이 지나가고 두 조각이 벌어진다 · "49.87 : 50.13" */
function BalanceCutShow({ view, row, decimals }: { view: MinigameView; row: MinigameRoundRow | undefined; decimals: number }) {
  const resultParams = view.round?.params ?? {};
  const item = useMemo(() => balanceItem(String(resultParams.kind ?? 'steak') as BalanceKind, Number(resultParams.itemSeed ?? 1)), [resultParams.kind, resultParams.itemSeed]);
  const top = Number(row?.extra?.top ?? 50);
  const bottom = Number(row?.extra?.bottom ?? 50);
  const pieces = cutPieces(top, bottom);
  const a = Number(row?.extra?.aPct ?? 50);
  return (
    <div className="balance-cutshow">
      <svg viewBox="-10 -4 120 108" className="balance-svg result" aria-hidden="true">
        <defs>
          <clipPath id="cut-left">
            <path d={pieces.left} />
          </clipPath>
          <clipPath id="cut-right">
            <path d={pieces.right} />
          </clipPath>
        </defs>
        <g className="cut-piece left" style={{ ['--px' as string]: `${pieces.nx * 4}px`, ['--py' as string]: `${pieces.ny * 4}px` }} clipPath="url(#cut-left)">
          <BalanceArt item={item} />
        </g>
        <g className="cut-piece right" style={{ ['--px' as string]: `${-pieces.nx * 4}px`, ['--py' as string]: `${-pieces.ny * 4}px` }} clipPath="url(#cut-right)">
          <BalanceArt item={item} />
        </g>
        {row?.submitted && <line x1={top} y1={BALANCE_TOP_Y} x2={bottom} y2={BALANCE_BOTTOM_Y} className="balance-knife" pathLength={100} />}
      </svg>
      <p className="balance-split mono">
        {row?.submitted ? (
          <>
            <span>{formatMinigameValue(a, decimals)}</span>
            <span className="dim"> : </span>
            <span>{formatMinigameValue(100 - a, decimals)}</span>
          </>
        ) : (
          '자르지 못했어요'
        )}
      </p>
    </div>
  );
}

function CutThumb({ view, row, name, decimals }: { view: MinigameView; row: MinigameRoundRow; name: { nickname: string; colorIndex: number } | undefined; decimals: number }) {
  const p = view.round?.params ?? {};
  const item = useMemo(() => balanceItem(String(p.kind ?? 'steak') as BalanceKind, Number(p.itemSeed ?? 1)), [p.kind, p.itemSeed]);
  const top = Number(row.extra?.top ?? NaN);
  const bottom = Number(row.extra?.bottom ?? NaN);
  return (
    <figure className="mg-thumb">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <BalanceArt item={item} small />
        {Number.isFinite(top) && <line x1={top} y1={BALANCE_TOP_Y} x2={bottom} y2={BALANCE_BOTTOM_Y} className="balance-cut thumb" />}
      </svg>
      <figcaption>
        <span className="nick" style={{ color: `var(--p${name?.colorIndex ?? 0})` }}>
          {name?.nickname ?? '?'}
        </span>
        <span className="mono">{row.value !== null ? `${formatMinigameValue(row.value, decimals)}%` : '—'}</span>
      </figcaption>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R051 — 판 결과 (번개손 · 타자 · 완벽한 원 · 각도) — 내 결과 크게(구경이면 1위) + 그림
// ─────────────────────────────────────────────────────────────────────────────
function R051Result({ view, mine, first, decimals }: { view: MinigameView; mine: MinigameRoundRow | undefined; first: MinigameRoundRow | undefined; decimals: number }) {
  const row = mine ?? first;
  const p = view.round?.params ?? {};
  const who = mine ? '나' : '1위';
  if (view.key === 'reaction') {
    const foul = row?.extra?.foul;
    return (
      <div className={`mg-r051-result rx-result${foul ? ' foul' : ''}`}>
        <p className="mg-r051-big mono">
          {!row || (!row.submitted && !foul) ? '안 누름' : foul ? (foul === 'fake' ? '속았다!' : '성급!') : `${row.value}ms`}
        </p>
        <p className="dim">
          {who} · {p.quickdraw ? `퀵드로우 — 가짜 신호 ${(p.fakes as unknown[] | undefined)?.length ?? 0}번` : '순수 반응'}
        </p>
      </div>
    );
  }
  if (view.key === 'typing') {
    const unfinished = row?.extra?.unfinished === true;
    return (
      <div className="mg-r051-result typing-result">
        <p className="typing-target small no-copy" data-wrap-ok lang={p.lang === 'en' ? 'en' : 'ko'}>
          {String(p.text ?? '')}
        </p>
        <p className="mg-r051-big mono">
          {!row || row.value === null ? '못 침' : unfinished ? `미완 ${Math.round(Number(row.extra?.pct ?? 0))}%` : `${formatMinigameValue(row.value, Math.max(2, decimals))}초`}
        </p>
        <p className="dim">{who}</p>
      </div>
    );
  }
  if (view.key === 'circle') {
    const stroke = (row?.extra?.stroke as [number, number][] | undefined) ?? [];
    const cx = Number(row?.extra?.cx ?? 0.5);
    const cy = Number(row?.extra?.cy ?? 0.5);
    const r = Number(row?.extra?.r ?? 0);
    const flaw = row?.extra?.flaw;
    return (
      <div className="mg-r051-result circle-result">
        <svg viewBox="0 0 100 100" className="circle-pad result" aria-hidden="true">
          {r > 0 && r < 1.5 && <circle cx={cx * 100} cy={cy * 100} r={r * 100} className="circle-fit" />}
          {stroke.length > 1 && <path d={stroke.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x * 100} ${y * 100}`).join(' ')} className="circle-ink" />}
        </svg>
        <div>
          <p className="mg-r051-big mono">{row?.value !== null && row?.value !== undefined ? `${formatMinigameValue(row.value, decimals)}%` : '안 그림'}</p>
          <p className="dim">
            {who}
            {flaw === 'open' ? ' · 덜 닫힘' : flaw === 'small' ? ' · 너무 작음' : flaw === 'line' ? ' · 원이 아님' : ''}
          </p>
        </div>
      </div>
    );
  }
  // angle
  const target = Number(p.target ?? row?.extra?.target ?? 45);
  const deg = Number(row?.extra?.deg ?? NaN);
  const t = rayEnd(target);
  const b = rayEnd(0);
  const m = Number.isFinite(deg) ? rayEnd(deg) : null;
  return (
    <div className="mg-r051-result angle-result">
      <svg viewBox="0 0 200 120" className="angle-pad result" aria-hidden="true">
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={b.x} y2={b.y} className="angle-ray base" />
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={t.x} y2={t.y} className="angle-ray target" />
        {m && <line x1={ANGLE_VX} y1={ANGLE_VY} x2={m.x} y2={m.y} className="angle-ray mine" />}
        <circle cx={ANGLE_VX} cy={ANGLE_VY} r={2.6} className="angle-vertex" />
      </svg>
      <div>
        <p className="mg-r051-big mono">{m ? `${formatMinigameValue(deg, Math.max(1, decimals))}°` : '—'}</p>
        <p className="dim">
          {who} · 목표 {target}° {row?.value !== null && row?.value !== undefined ? `· ${formatMinigameValue(row.value, decimals)}° 차이` : ''}
        </p>
      </div>
    </div>
  );
}

function R051Thumb({ view, row, name, decimals }: { view: MinigameView; row: MinigameRoundRow; name: { nickname: string; colorIndex: number } | undefined; decimals: number }) {
  let art: React.ReactNode = null;
  if (view.key === 'circle') {
    const stroke = (row.extra?.stroke as [number, number][] | undefined) ?? [];
    art = (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {stroke.length > 1 && <path d={stroke.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x * 100} ${y * 100}`).join(' ')} className="circle-ink thumb" />}
      </svg>
    );
  } else {
    const target = Number(view.round?.params?.target ?? 45);
    const deg = Number(row.extra?.deg ?? NaN);
    const t = rayEnd(target);
    const b = rayEnd(0);
    const m = Number.isFinite(deg) ? rayEnd(deg) : null;
    art = (
      <svg viewBox="0 0 200 120" aria-hidden="true">
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={b.x} y2={b.y} className="angle-ray base" />
        <line x1={ANGLE_VX} y1={ANGLE_VY} x2={t.x} y2={t.y} className="angle-ray target" />
        {m && <line x1={ANGLE_VX} y1={ANGLE_VY} x2={m.x} y2={m.y} className="angle-ray mine thumb" />}
      </svg>
    );
  }
  return (
    <figure className={`mg-thumb mg-thumb-${view.key}`}>
      {art}
      <figcaption>
        <span className="nick" style={{ color: `var(--p${name?.colorIndex ?? 0})` }}>
          {name?.nickname ?? '?'}
        </span>
        <span className="mono">{row.value !== null ? `${formatMinigameValue(row.value, decimals)}${view.key === 'circle' ? '%' : '°'}` : '—'}</span>
      </figcaption>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ R053 — 판 결과 (소수파 막대 · 2/3 평균/목표 · 다른 하나 정답 칸 · 게이지 내 위치)
// ─────────────────────────────────────────────────────────────────────────────
function R053Result({ view, mine, decimals }: { view: MinigameView; mine: MinigameRoundRow | undefined; decimals: number }) {
  const rv = view.round?.reveal ?? {};
  const p = view.round?.params ?? {};
  if (view.key === 'minority') {
    const counts = (rv.counts as Record<string, number> | undefined) ?? {};
    const minority = (rv.minority as number[] | undefined) ?? [];
    const max = Math.max(1, ...Object.values(counts));
    return (
      <div className="mg-r051-result minority-result">
        <div className="minority-bars" aria-label="숫자마다 고른 사람 수">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={`minority-bar${minority.includes(n) ? ' win' : ''}${mine?.extra?.pick === n ? ' mine' : ''}`} data-n={n}>
              <span className="minority-count mono">{counts[n] ?? 0}</span>
              <span className="minority-fill" style={{ height: `${((counts[n] ?? 0) / max) * 100}%` }} />
              <span className="minority-n mono">{n}</span>
            </div>
          ))}
        </div>
        <p className="dim">{minority.length ? `소수파: ${minority.join(' · ')}` : '모두 같은 숫자 — 이번 판은 모두 0점'}</p>
      </div>
    );
  }
  if (view.key === 'oddone') {
    const size = Number(p.size ?? 4);
    const oddIndex = Number(p.oddIndex ?? 0);
    return (
      <div className="mg-r051-result oddone-result">
        <div className="oddone-grid small" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} aria-hidden="true">
          {Array.from({ length: size * size }, (_, i) => (
            <span key={i} className={`oddone-cell${i === oddIndex ? ' found' : ''}`}>
              <img src={twemoji(i === oddIndex ? String(p.odd) : String(p.base))} alt="" />
            </span>
          ))}
        </div>
        <p className="mg-r051-big mono">{mine?.value !== null && mine?.value !== undefined && mine.submitted ? `${(mine.value / 1000).toFixed(2)}초` : '—'}</p>
      </div>
    );
  }
  if (view.key === 'balloon') {
    const popped = mine?.extra?.popped === true;
    return (
      <div className="mg-r051-result balloon-result">
        <div className="balloon-box small">
          <BalloonArt pct={100 + Number(mine?.extra?.size ?? 0) * 1.6} popped={popped} />
        </div>
        <p className="mg-r051-big mono">{mine && mine.submitted ? (popped ? `펑! (${Number(mine.extra?.size ?? 0)})` : `${mine.value ?? 0}${mine.value === 100 ? ' 만점!' : ''}`) : '—'}</p>
      </div>
    );
  }
  if (view.key === 'tap') {
    return (
      <div className="mg-r051-result">
        <p className="mg-r051-big mono">{mine?.value !== null && mine?.value !== undefined ? `${mine.value}번` : '—'}</p>
        <p className="dim">10초 동안 누른 횟수</p>
      </div>
    );
  }
  // gauge
  const pos = Number(mine?.extra?.pos ?? NaN);
  return (
    <div className="mg-r051-result gauge-result">
      <div className="gauge-track">
        <span className="gauge-center" aria-hidden="true" />
        {Number.isFinite(pos) && <span className="gauge-marker" style={{ left: `${pos * 100}%` }} aria-hidden="true" />}
      </div>
      <p className="mg-r051-big mono">{mine?.value !== null && mine?.value !== undefined ? `${formatMinigameValue(mine.value, decimals)}%` : '안 누름'}</p>
      <p className="dim">가운데에서 떨어진 거리</p>
    </div>
  );
}
