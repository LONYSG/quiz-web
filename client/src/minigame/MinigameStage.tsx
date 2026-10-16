// =============================================================================
// ★★★ 미니게임 화면 (R050 · D-234) — 단계마다 한 장면. 미니게임별 화면(케이크 · 균형)은 play 단계에만 끼운다
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
  minigameInfo,
  type BalanceKind,
} from '@quiz/shared';
import { Gamepad2, PartyPopper, Trophy } from 'lucide-react';
import Icon from '../Icon.js';
import Avatar from '../Avatar.js';
import DeviceIcon from '../DeviceIcon.js';
import { setMusicMode, sfx } from '../sound.js';
import { useUiMode } from '../uiMode.js';
import type { MinigameRoundRow, MinigameView, PlayerView } from '../useRoom.js';
import BalanceArt, { pathOf } from './BalanceArt.js';
import BalanceGuard from './BalanceGuard.js';
import CakeWait, { CakeArt } from './CakeWait.js';

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
        break;
      case 'ready':
        // ★ 케이크는 리듬을 들어야 한다 — 판 동안 배경음악을 끈다
        if (view.key === 'cake') setMusicMode('quiet');
        sfx('mg-ready');
        break;
      case 'play':
        sfx('mg-go');
        // 모바일 키보드 내림 · PC 채팅 입력에서 손 떼기 (Space · 방향키가 미니게임으로)
        (document.activeElement as HTMLElement | null)?.blur?.();
        break;
      case 'roundResult':
        setMusicMode('minigame');
        if (view.key === 'balance') sfx('mg-cut');
        else sfx('mg-round');
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
          <p className="dim">{view.practice ? '연습 판 — 점수 · 포인트 없음' : `${view.afterQuestionIndex ?? ''}번째 문제를 지나 잠깐 미니게임!`}</p>
        </div>
      )}

      {view.phase === 'rules' && (
        <div className="mg-rules">
          <div className="mg-rules-art">{view.key === 'cake' ? <CakeArt open={false} small /> : <RulesBalanceArt />}</div>
          <div className="mg-rules-text">
            <p className="mg-rules-line">{info.oneLine}</p>
            <p className="mg-rules-ctrl">
              <span className="hint-label">{mobile ? '모바일' : 'PC'}</span> {mobile ? info.controlsMobile : info.controlsPc}
            </p>
            {view.key === 'cake' && <p className="dim mg-rules-note">블루투스 이어폰은 소리가 늦게 들려요 — 화면 숫자를 믿으세요</p>}
            <p className="dim mg-rules-note">
              {view.roundCount}판 · 판마다 순위 점수 · {view.practice ? '연습이라 보상 없음' : '최종 1~3위에게 보너스 점수(포인트도)'}
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

      {view.phase === 'play' &&
        (view.key === 'cake' ? (
          <CakeWait socket={socket} view={view} serverNow={serverNow} mobile={mobile} />
        ) : (
          <BalanceGuard socket={socket} view={view} serverNow={serverNow} mobile={mobile} />
        ))}

      {view.phase === 'play' && !view.spectating && (
        <p className="mg-submitted dim">
          {view.submittedCount} / {view.participants.length}명 {view.key === 'cake' ? '누름' : '확정'}
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
          <ol className="mg-table">
            {view.final.map((f) => {
              const p = nameOf(f.accountId);
              return (
                <li key={f.accountId} className={f.accountId === myAccountId ? 'me' : undefined} data-rank={f.rank}>
                  <span className="mg-rank mono">{f.rank}위</span>
                  {p && <Avatar xs nickname={p.nickname} colorIndex={p.colorIndex} accountId={p.accountId} avatarV={players.find((x) => x.accountId === p.accountId)?.avatarV ?? null} />}
                  <span className="nick mg-nick" style={{ color: `var(--p${p?.colorIndex ?? 0})` }}>
                    {p?.nickname ?? '나간 사람'}
                  </span>
                  <DeviceIcon device={(p as { device?: 'pc' | 'mobile' | null } | undefined)?.device} />
                  <span className="mg-total mono">{f.total}점</span>
                  <span className={f.reward > 0 ? 'mg-reward on mono' : 'mg-reward mono'}>{view.practice ? '연습' : f.reward > 0 ? `+${f.reward}` : '—'}</span>
                </li>
              );
            })}
          </ol>
          <p className="dim mg-final-note">{view.practice ? '연습 판이라 점수 · 포인트에 들어가지 않아요' : '보너스는 퀴즈 점수와 포인트에 함께 들어가요'}</p>
        </div>
      )}

      {view.phase === 'outro' && (
        <div className="mg-outro">
          <p className="mg-outro-line">{view.practice ? '로비로 돌아갑니다' : '퀴즈로 돌아갑니다!'}</p>
        </div>
      )}
    </section>
  );
}

function readyDesc(view: MinigameView): string {
  const p = view.round?.params ?? {};
  if (view.key === 'cake') {
    const sp = Number(p.speed ?? 1);
    return `${p.durationSec}초${sp !== 1 ? ` · ${sp}배속` : ''} · ${p.hideAfterSec}초 뒤 가려져요`;
  }
  return `${String(p.label ?? '')} — 정확히 반으로!`;
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
    if (!r.submitted || r.value === null) return view.key === 'cake' ? '안 누름' : '—';
    if (view.key === 'cake') {
      const e = r.error ?? 0;
      return `${formatMinigameValue(e, d, true)}초`;
    }
    const a = Number(r.extra?.aPct ?? r.value);
    const b = 100 - a;
    return `${formatMinigameValue(Math.min(a, b), d)} : ${formatMinigameValue(Math.max(a, b), d)}`;
  };
  return (
    <div className="mg-result">
      {view.key === 'balance' ? (
        <BalanceCutShow view={view} row={mine ?? result.rows[0]} decimals={d} />
      ) : (
        <div className="mg-cake-result">
          <CakeArt open small />
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
              <span className="mg-value mono">{valueText(r)}</span>
              <span className="mg-points mono">+{r.points}</span>
            </li>
          );
        })}
      </ol>
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
