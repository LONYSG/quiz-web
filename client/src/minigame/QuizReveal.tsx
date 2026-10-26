// =============================================================================
// ★★★ 퀴즈류 정답 공개 (R052 · D-239) — 판 결과 화면의 윗부분 + 표 값 글
//
//   얼마게요: 가격 · note · 입력들은 가까운 순(아래 표) / 빅맥지수: 목표국 값 + **전체 순위 표(스크롤)** · 최저/최고 · 주요국 강조 · 유로 지역 한 줄 · 환율 기준일
//   사진: 원본 + 정답 + 설명 + 출처(작게) / 얼마나: 값(displayDecimals) · note(범위) · 설명 / 어느 쪽: 두 값 · 정답 표시 · margin
//   ★ R068 사진 연도: 사진(전체) + 정답 연도(대략이면 범위) · 제목 · 장소 · 내 오차 · 출처 / 표 값 = "1985년 (3년 차)"
// =============================================================================

import { WORLDPRICE_MAJOR, formatInt } from '@quiz/shared';
import { Check, X } from 'lucide-react';
import Icon from '../Icon.js';
import type { MinigameRoundRow, MinigameView } from '../useRoom.js';
import { QuizImage } from './QuizParts.js';

type Row = { cc: string; countryKo: string; localPrice: number; currency: string; krw: number };

const fmtNum = (v: number, d: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 판 결과 표의 값 글 */
/** ★ R060 — 숫자 · 단위가 한 덩어리로("12.5광년" 이 "12.5광" / "년" 으로 갈리지 않게 — 글자 사이에 WORD JOINER) */
const glue = (s: string) => [...s].join('⁠');

export function quizValueText(view: MinigameView, r: MinigameRoundRow): string {
  const e = r.extra ?? {};
  const unit = view.key === 'estimate' ? String(view.round?.reveal?.unit ?? view.round?.params?.unit ?? '') : '원';
  if (view.key === 'photo') return r.value !== null && r.submitted ? `${(r.value / 1000).toFixed(1)}초` : e.tries ? `못 맞힘 (${String(e.tries)}번)` : '—';
  if (view.key === 'photoyear') {
    if (!r.submitted || e.guess === undefined) return '안 냄';
    const off = Number(e.off ?? 0);
    return `${String(e.guess)}년 (${off === 0 ? '딱 맞음' : `${off}년 차`})`;
  }
  if (view.key === 'which') {
    if (!r.submitted) return '안 고름';
    return e.correct ? `맞음 ${((r.value ?? 0) / 1000).toFixed(2)}초` : '틀림';
  }
  if (!r.submitted || e.guess === undefined) return '안 냄';
  const g = Number(e.guess);
  const pct = Number(e.pct ?? 0);
  const d = view.key === 'estimate' ? Number(view.round?.reveal?.displayDecimals ?? 0) : 0;
  return `${glue(`${fmtNum(g, d)}${unit}`)} (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)`;
}

export default function QuizReveal({ view, mine }: { view: MinigameView; mine: MinigameRoundRow | undefined }) {
  const rv = view.round?.reveal ?? {};
  const p = view.round?.params ?? {};
  const attribution = rv.attribution ? <p className="quiz-attr">출처: {String(rv.attribution)}</p> : null;
  if (view.key === 'price') {
    return (
      <div className="quiz-reveal">
        <QuizImage imageId={p.imageId as string | null} alt={String(p.name ?? '')} className="quiz-pic small" />
        <div>
          <p className="quiz-name">{String(p.name ?? '')}</p>
          <p className="quiz-answer mono">{formatInt(Number(rv.priceKrw ?? 0))}원</p>
          {rv.note ? <p className="quiz-note">{String(rv.note)}</p> : null}
          {mine?.extra?.guess !== undefined && <p className="dim">나: {quizValueText(view, mine)}</p>}
          {attribution}
        </div>
      </div>
    );
  }
  if (view.key === 'worldprice') {
    const rows = (rv.rows as Row[] | undefined) ?? [];
    const target = (p.target as { cc: string; countryKo: string } | undefined)?.cc;
    const shown = new Set(((p.shown as Row[] | undefined) ?? []).map((r) => r.cc));
    const min = rows[0];
    const max = rows[rows.length - 1];
    return (
      <div className="quiz-reveal wp-reveal">
        <div>
          <p className="quiz-name">
            {String(p.nameKo ?? '')} — {String((p.target as { countryKo?: string } | undefined)?.countryKo ?? '')}
          </p>
          <p className="quiz-answer mono">{formatInt(Number(rv.targetKrw ?? 0))}원</p>
          <p className="dim">
            현지 {String(rv.targetLocal ?? '')} {String(rv.currency ?? '')} · 환율 기준 {String(rv.fxAsOf ?? '')}
          </p>
          {min && max && (
            <p className="wp-minmax">
              <span>가장 싼 곳 {min.countryKo} {formatInt(min.krw)}원</span> · <span>가장 비싼 곳 {max.countryKo} {formatInt(max.krw)}원</span>
            </p>
          )}
          {mine?.extra?.guess !== undefined && <p className="dim">나: {quizValueText(view, mine)}</p>}
        </div>
        <ol className="wp-table" aria-label="전체 순위">
          {rows.map((r, i) => (
            <li
              key={r.cc}
              className={[r.cc === target ? 'target' : '', r.cc === 'KR' ? 'kr' : '', shown.has(r.cc) ? 'shown' : '', WORLDPRICE_MAJOR.includes(r.cc) ? 'major' : '', r.cc === 'EU' ? 'eu' : '']
                .filter(Boolean)
                .join(' ')}
              data-cc={r.cc}
            >
              <span className="mono wp-rank">{i + 1}</span>
              <span className="wp-country">{r.countryKo}</span>
              <span className="mono wp-krw">{formatInt(r.krw)}원</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (view.key === 'photo') {
    return (
      <div className="quiz-reveal">
        <QuizImage imageId={p.imageId as string | null} alt={String(rv.answer ?? '')} dummy={String(p.dummyShape ?? 'box')} className="quiz-pic" />
        <div>
          <p className="quiz-answer">{String(rv.answer ?? '')}</p>
          {rv.explanation ? <p className="quiz-note">{String(rv.explanation)}</p> : null}
          {mine && <p className="dim">나: {quizValueText(view, mine)}</p>}
          {attribution}
        </div>
      </div>
    );
  }
  if (view.key === 'photoyear') {
    const range = Array.isArray(rv.yearRange) ? (rv.yearRange as number[]) : null;
    return (
      <div className="quiz-reveal photoyear-reveal">
        <QuizImage imageId={p.imageId as string | null} alt={String(rv.title ?? '')} dummy={String(p.dummyShape ?? 'box')} className="quiz-pic" />
        <div>
          <p className="quiz-answer mono" data-photoyear-answer>
            <span className="nowrap">{String(rv.year ?? '')}년</span>
            {range && <span className="dim photoyear-range nowrap"> (대략 {range[0]}~{range[1]}년 — 안이면 0)</span>}
          </p>
          {rv.title ? <p className="quiz-note" data-wrap-ok>{String(rv.title)}</p> : null}
          {rv.place ? <p className="quiz-note dim">{String(rv.place)}</p> : null}
          {mine && <p className="dim">나: {quizValueText(view, mine)}</p>}
          {attribution}
        </div>
      </div>
    );
  }
  if (view.key === 'estimate') {
    const d = Number(rv.displayDecimals ?? 0);
    return (
      <div className="quiz-reveal">
        {Boolean(p.imageId || p.dummy) && <QuizImage imageId={p.imageId as string | null} alt="" className="quiz-pic small" />}
        <div>
          <p className="quiz-name" data-wrap-ok>{String(p.question ?? '')}</p>
          <p className="quiz-answer mono">
            <span className="nowrap">
              {fmtNum(Number(rv.value ?? 0), d)} {String(rv.unit ?? '')}
            </span>
          </p>
          {rv.note ? <p className="quiz-note">범위: {String(rv.note)}</p> : null}
          {rv.explanation ? <p className="quiz-note">{String(rv.explanation)}</p> : null}
          {mine?.extra?.guess !== undefined && <p className="dim">나: {quizValueText(view, mine)}</p>}
          {attribution}
        </div>
      </div>
    );
  }
  // which
  const ans = rv.answer;
  const side = (k: 'a' | 'b') => {
    const s = (p[k] as { label?: string; imageId?: string | null } | undefined) ?? {};
    const v = Number(rv[k] ?? 0);
    return (
      <div className={`which-card reveal${ans === k ? ' answer' : ''}${mine?.extra?.choice === k ? ' picked' : ''}`} data-side={k}>
        {Boolean(s.imageId || p.dummy) && <QuizImage imageId={s.imageId ?? null} alt={s.label ?? ''} className="which-img" />}
        <span className="which-label">{s.label}</span>
        <span className="mono which-value">
          <span className="nowrap">
            {v.toLocaleString('ko-KR')}
            {String(rv.unit ?? '')}
          </span>
        </span>
        {ans === k && <Icon icon={Check} className="which-check" />}
      </div>
    );
  };
  return (
    <div className="quiz-reveal which-reveal">
      <div className="which-pair">
        {side('a')}
        <span className="which-vs">VS</span>
        {side('b')}
      </div>
      <p className="dim">
        {mine ? (mine.extra?.correct ? '맞혔어요!' : mine.submitted ? '아쉬워요' : '고르지 못했어요') : ''}
        {rv.margin ? ` · 차이 ${String(rv.margin)}${p.kind === 'earlier' ? '년' : '배'}` : ''}
      </p>
    </div>
  );
}

/** 어느 쪽? 최종 — 문항별 맞음/틀림 정리 표 */
export function WhichSummary({ view, nameOf }: { view: MinigameView; nameOf: (id: string) => { nickname: string; colorIndex: number } | undefined }) {
  const ids = view.participants.map((p) => p.accountId);
  return (
    <div className="which-summary" aria-label="문항별 정리">
      <table>
        <thead>
          <tr>
            <th />
            {view.roundResults.map((r) => (
              <th key={r.roundIndex} className="mono">
                {r.roundIndex + 1}
              </th>
            ))}
            <th>맞힘</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const n = nameOf(id);
            let c = 0;
            return (
              <tr key={id}>
                <td className="nick" style={{ color: `var(--p${n?.colorIndex ?? 0})` }}>
                  {n?.nickname ?? '?'}
                </td>
                {view.roundResults.map((r) => {
                  const row = r.rows.find((x) => x.accountId === id);
                  const ok = row?.extra?.correct === true;
                  if (ok && row?.points) c += 1;
                  return <td key={r.roundIndex}>{ok ? <Icon icon={Check} className="ok" /> : row?.submitted ? <Icon icon={X} className="bad" /> : '·'}</td>;
                })}
                <td className="mono">{c}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
