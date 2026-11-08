// =============================================================================
// ★★★ 팀전 1차 화면 조각 (R079 · D-329 · D-335)
//   · TeamTag — 칸 · 👥 창 · 결과 행의 작은 "B" / "R" 태그(색 + 글자 — 사무실 테마 흑백에서도 읽힌다 · D-324)
//   · TeamBar — 판 중 center-main 맨 위 한 줄 "B 블루 12 : 9 레드 R" + 비율 막대 (점수 바뀔 때만 다시 그림)
//   · TeamResultLine — 결과 순위 위 "블루 승 17 : 12 · 보너스 +3P" / "무승부 · 보너스 없음"
//   · useSeatDrag — 방장 PC: 자리 카드를 반대쪽 칸으로 끌어 놓기(포인터 — 이모티콘 끌기(D-317)와 같은 꼴 · HTML5 DnD 아님)
// =============================================================================

import { memo, useEffect, useRef, useState } from 'react';
import { teamLabel, teamScores, type Team, type TeamResult } from '@quiz/shared';
import type { PlayerView } from './useRoom.js';

export function TeamTag({ team, small }: { team: Team; small?: boolean }) {
  return (
    <span className={`team-tag team-${team}${small ? ' small' : ''}`} data-team-tag={team} title={`${teamLabel(team)} 팀`} aria-label={`${teamLabel(team)} 팀`}>
      {team === 'blue' ? 'B' : 'R'}
    </span>
  );
}

const Bar = memo(function Bar({ blue, red }: { blue: number; red: number }) {
  const total = blue + red;
  const pct = total > 0 ? Math.round((blue / total) * 1000) / 10 : 50;
  const lead: Team | null = blue === red ? null : blue > red ? 'blue' : 'red';
  return (
    <div className="team-bar" data-team-bar data-blue={blue} data-red={red} role="status" aria-label={`블루 ${blue} 대 레드 ${red}`}>
      <span className={lead === 'blue' ? 'team-bar-side blue lead' : 'team-bar-side blue'}>
        <TeamTag team="blue" small /> 블루 <strong className="mono">{blue}</strong>
      </span>
      <span className="team-bar-track" aria-hidden="true">
        <span className="team-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className={lead === 'red' ? 'team-bar-side red lead' : 'team-bar-side red'}>
        <strong className="mono">{red}</strong> 레드 <TeamTag team="red" small />
      </span>
    </div>
  );
});

/** 판 중 막대 — 점수 합이 같으면 다시 그리지 않는다(memo) */
export function TeamBar({ players }: { players: readonly PlayerView[] }) {
  const s = teamScores(players.map((p) => ({ team: p.team ?? null, score: p.score })));
  return <Bar blue={s.blue} red={s.red} />;
}

export function TeamResultLine({ teams, mine }: { teams: TeamResult; mine: Team | null }) {
  const w = teams.winner;
  return (
    <p className={w ? `team-result win-${w}` : 'team-result draw'} data-team-result data-winner={w ?? 'draw'} data-bonus={teams.bonus}>
      {w ? (
        <>
          <TeamTag team={w} /> <strong>{teamLabel(w)} 승</strong>{' '}
        </>
      ) : (
        <strong>무승부</strong>
      )}{' '}
      <span className="mono team-result-score">
        <span className="tr-blue">{teams.blue.score}</span> : <span className="tr-red">{teams.red.score}</span>
      </span>
      {w && teams.bonus > 0 ? (
        <span className={mine === w ? 'team-result-bonus mine' : 'team-result-bonus'}> · 보너스 +{teams.bonus}P</span>
      ) : (
        <span className="dim"> · 보너스 없음</span>
      )}
    </p>
  );
}

export interface SeatDrag {
  id: string;
  nick: string;
  from: Team;
  x: number;
  y: number;
  over: Team | null;
}

function teamAt(x: number, y: number): Team | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-team-side]');
  const t = el?.getAttribute('data-team-side');
  return t === 'blue' || t === 'red' ? t : null;
}

/**
 * ★ 방장 PC 끌기 — 누른 채 6px 넘게 움직이면 끌기 시작 · 반대쪽 칸(data-team-side) 위에서 떼면 onDrop.
 *   끌기 뒤 300ms 는 클릭(사람 카드 열기)을 무시한다(suppressed).
 */
export function useSeatDrag(enabled: boolean, onDrop: (accountId: string, team: Team) => void) {
  const [drag, setDrag] = useState<SeatDrag | null>(null);
  const press = useRef<{ id: string; nick: string; from: Team; x0: number; y0: number; active: boolean } | null>(null);
  const suppressUntil = useRef(0);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (!enabled) {
      press.current = null;
      setDrag(null);
      return undefined;
    }
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.active && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
      p.active = true;
      e.preventDefault();
      setDrag({ id: p.id, nick: p.nick, from: p.from, x: e.clientX, y: e.clientY, over: teamAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p || !p.active) return;
      suppressUntil.current = performance.now() + 300;
      setDrag(null);
      const over = teamAt(e.clientX, e.clientY);
      if (over && over !== p.from) dropRef.current(p.id, over);
    };
    const cancel = () => {
      press.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [enabled]);

  const start = (e: React.PointerEvent, p: { accountId: string; nickname: string; team: Team }) => {
    if (!enabled || e.button !== 0 || e.pointerType === 'touch') return;
    press.current = { id: p.accountId, nick: p.nickname, from: p.team, x0: e.clientX, y0: e.clientY, active: false };
  };
  const suppressed = () => performance.now() < suppressUntil.current;
  return { drag, start, suppressed };
}
