// =============================================================================
// ★★ 전적 · 업적 (R054 · D-242 · D-243) — 프로필의 "전적 · 업적" 버튼 → 이 창
//
// ★ 전적은 이미 보존된 표에서 읽기만(GET /api/me/stats) — 퀴즈 · 미니게임 · 포인트(맞힌 + 보상 − 쓴 것 = 지금 — R048 식 그대로).
// ★ 업적은 표시만(포인트 보상 없음) — 얻은 것은 밝게 · 못 얻은 것은 흐리게 + 조건 글.
// ★ 창: 팝업 하나 · ✕ / Esc / 바깥 누르면 닫힘 · PC 는 한 화면 · 모바일은 세로 스크롤.
// =============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACHIEVEMENTS, achievementDef } from '@quiz/shared';
import { Award, BarChart3 } from 'lucide-react';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';

interface Stats {
  quiz: { games: number; correct: number; byTopic: { topic: string; label: string; n: number }[]; byTier: { tier: string; label: string; n: number }[]; avgResponseMs: number | null };
  minigames: { key: string; name: string; runs: number; wins: number; best: number | null; unit: string; better: 'low' | 'high'; accuracy: number | null }[];
  points: { correct: number; rewards: number; grants?: number; spent: number; balance: number; recent: { amount: number; reason: string; at: string }[] };
  achievements: { key: string; earnedAt: string }[];
}

/** 최고 기록 글 — 단위마다 */
function bestText(m: Stats['minigames'][number]): string {
  if (m.accuracy !== null) return `맞힘 ${Math.round(m.accuracy * 100)}%`;
  if (m.best === null) return '—';
  if (m.key === 'cake') return `${Math.round(m.best * 1000)}ms`;
  if (m.unit === 'ms') return `${Math.round(m.best)}ms`;
  if (m.key === 'oddone') return `${(m.best / 1000).toFixed(2)}초`;
  if (m.unit === '초') return `${m.best.toFixed(2)}초`;
  if (m.unit === '°') return `${m.best.toFixed(2)}°`;
  if (m.key === 'minority') return `${m.best}`;
  if (m.key === 'tap') return `${m.best}번`;
  return `${m.best.toFixed(m.best >= 100 ? 0 : 2)}%`;
}

export default function StatsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'stats' | 'ach'>('stats');
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch('/api/me/stats', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setS(j))
      .catch(() => setErr(true));
  }, []);
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
  const maxTopic = Math.max(1, ...(s?.quiz.byTopic.map((t) => t.n) ?? [1]));
  const earned = new Map(s?.achievements.map((a) => [a.key, a.earnedAt]) ?? []);
  const extraKeys = [...earned.keys()].filter((k) => !ACHIEVEMENTS.some((a) => a.key === k));
  return createPortal(
    <div
      className="modal-back popup-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal stats-modal" role="dialog" aria-label="전적 · 업적">
        <div className="pop-head">
          <p className="pop-title">전적 · 업적</p>
          <PopupClose onClose={onClose} />
        </div>
        <div className="stats-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'preset active' : 'preset'} data-tab="stats" onClick={() => setTab('stats')}>
            <Icon icon={BarChart3} /> 전적
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ach'} className={tab === 'ach' ? 'preset active' : 'preset'} data-tab="ach" onClick={() => setTab('ach')}>
            <Icon icon={Award} /> 업적 {s ? `${earned.size}/${ACHIEVEMENTS.length}` : ''}
          </button>
        </div>
        {err && <p className="form-error">전적을 불러오지 못했어요</p>}
        {!s && !err && <p className="dim">불러오는 중…</p>}
        {s && tab === 'stats' && (
          <div className="stats-body" data-loaded="1">
            <section className="stats-sec">
              <h3>퀴즈</h3>
              <p className="stats-line">
                <span>
                  참여 <strong className="mono" data-stat="games">{s.quiz.games}</strong>판
                </span>
                <span>
                  맞힘 <strong className="mono" data-stat="correct">{s.quiz.correct}</strong>
                </span>
                <span>
                  평균 반응 <strong className="mono">{s.quiz.avgResponseMs !== null ? `${(s.quiz.avgResponseMs / 1000).toFixed(1)}초` : '—'}</strong>
                </span>
              </p>
              <ul className="stats-bars" aria-label="분야별 맞힘">
                {s.quiz.byTopic.map((t) => (
                  <li key={t.topic}>
                    <span className="stats-bar-label">{t.label}</span>
                    <span className="stats-bar">
                      <span style={{ width: `${(t.n / maxTopic) * 100}%` }} />
                    </span>
                    <span className="mono">{t.n}</span>
                  </li>
                ))}
              </ul>
              <p className="stats-line dim">
                {/* ★ R069 — 등급(1~5)별 맞힌 수(옛 하·중·상) */}
                등급별 {s.quiz.byTier.map((t) => `${t.label}등급 ${t.n}`).join(' · ')}
              </p>
            </section>
            <section className="stats-sec">
              <h3>미니게임</h3>
              <table className="stats-mg">
                <thead>
                  <tr>
                    <th />
                    <th>판</th>
                    <th>1위</th>
                    <th>최고</th>
                  </tr>
                </thead>
                <tbody>
                  {s.minigames.map((m) => (
                    <tr key={m.key} className={m.runs ? '' : 'none'} data-mg={m.key}>
                      <td>{m.name}</td>
                      <td className="mono">{m.runs}</td>
                      <td className="mono" data-stat="wins">
                        {m.wins}
                      </td>
                      <td className="mono">{m.runs ? bestText(m) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="stats-sec">
              <h3>포인트</h3>
              <p className="stats-line">
                맞힘 {s.points.correct} + 미니게임 {s.points.rewards}
                {(s.points.grants ?? 0) > 0 && <> + 보너스 {s.points.grants}</>} − 쓴 것 {s.points.spent} = <strong className="mono" data-stat="balance">{s.points.balance}</strong>
              </p>
              {s.points.recent.length > 0 && (
                <ul className="stats-recent">
                  {s.points.recent.map((r, i) => (
                    <li key={i} className="dim">
                      {r.at.slice(0, 10)} · {r.reason} · −{r.amount}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        {s && tab === 'ach' && (
          <ul className="ach-list" data-loaded="1">
            {[...ACHIEVEMENTS.map((a) => a.key), ...extraKeys].map((k) => {
              const d = achievementDef(k);
              const at = earned.get(k);
              return (
                <li key={k} className={at ? 'ach on' : 'ach'} data-ach={k}>
                  <span className="ach-medal" aria-hidden="true">
                    🏅
                  </span>
                  <span className="ach-text">
                    <strong>{d.name}</strong>
                    <span className="dim ach-desc" title={d.desc} data-wrap-ok>{at ? `${at.slice(0, 10)} 달성` : d.desc}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
