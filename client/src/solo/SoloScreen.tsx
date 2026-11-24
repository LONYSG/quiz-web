// =============================================================================
// ★★★ R118 (docs/24 4절 · 5-4 · R114 시안 "솔로 진행 안 A" · 솔로 시작 · 끝 · 띠 받는 순간) — 혼자 하기 화면
//
//   시작: 내 띠 · 최고 · 다음 단계까지 N개 · 규칙 세 줄 · [시작]
//   진행(안 A): 목숨 ♥ · 맞힌 개수 / 문제 카드(지금 문제 카드 꼴 — question-card · q-head · QuestionText · q-timebar) / 입력칸 하나
//              — 휴대폰 키보드가 올라온 채로 다 보이게(카드 바로 아래 입력칸 · 화면 아래에 붙이지 않는다)
//   끝: 기록 크게 · 최고 · 띠 · 틀린 세 문제의 정답 · 해설 · [로비] [다시]
//   띠 받는 순간: 끝 화면 위 짧은 그림 + 소리 하나 + "+40P"
//   ★ 앱 CSS · 지금 부품만(R115 0 절) — 새 값은 R118 블록의 배치뿐.
//   ★ 화면을 벗어나면(visibilitychange · blur) 그 문제는 실패(4-5) — 시작 화면에 미리 알린다.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ChevronLeft, Eye, Heart, Home, RotateCcw, Send, TrendingUp } from 'lucide-react';
import { SOLO, beltColorOf, beltLabel, type SoloEndView, type SoloMeView } from '@quiz/shared';
import ConfirmModal from '../ConfirmModal.js';
import Icon from '../Icon.js';
import QuestionText from '../QuestionText.js';
import { sfx } from '../sound.js';
import { siteInfo } from '../site.js';
import { BeltOf } from '../gongbang/Belt.js';
import { fetchSoloMe, useSolo } from './useSolo.js';

interface Props {
  socket: Socket;
  serverNow: () => number;
  /** 도는 판을 이어받으며 열었다(새로 고침 · 새 탭) */
  resume: boolean;
  onClose: () => void;
}

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

/** 띠 한 줄(크게) — 시작 · 끝 화면 */
function BeltLine({ step, sub }: { step: number | null; sub: string }) {
  return (
    <div className="solo-belt" data-solo-belt={step ?? 'none'}>
      <BeltOf step={step} width={64} />
      <div>
        <b>{beltLabel(step)}</b>
        <small className="dim">{sub}</small>
      </div>
    </div>
  );
}

function nextText(next: { step: number; need: number } | null | undefined): string {
  if (!next) return '가장 높은 단계예요';
  if (next.step === 0) return '한 판이면 화이트벨트';
  const color = beltColorOf(next.step) !== beltColorOf(next.step - 1);
  return `${color ? '다음 띠' : '다음 단계'}까지 ${next.need}개`;
}

export default function SoloScreen({ socket, serverNow, resume, onClose }: Props) {
  const { s, start, answer, away, quit } = useSolo(socket, resume);
  const belt = siteInfo().belt;
  const [me, setMe] = useState<SoloMeView | null>(null);
  const [draft, setDraft] = useState('');
  const [tried, setTried] = useState<string[]>([]);
  const [quitOpen, setQuitOpen] = useState(false);
  const [promo, setPromo] = useState<SoloEndView['belt'] | null>(null);
  const [now, setNow] = useState(() => serverNow());
  const inputRef = useRef<HTMLInputElement>(null);

  // 시작 · 끝 화면에서 내 기록을 다시 읽는다
  useEffect(() => {
    if (s.phase !== 'start' && s.phase !== 'end') return;
    let live = true;
    void fetchSoloMe().then((m) => {
      if (live) setMe(m);
    });
    return () => {
      live = false;
    };
  }, [s.phase]);

  // 남은 시간 — 100ms 마다(보여 주기만 · 마감은 서버)
  useEffect(() => {
    if (s.phase !== 'play') return;
    const id = window.setInterval(() => setNow(serverNow()), 100);
    return () => window.clearInterval(id);
  }, [s.phase, serverNow]);

  // 새 문제 — 입력칸 비우고 포커스 유지(휴대폰 키보드가 내려가지 않게)
  const qn = s.q?.n ?? 0;
  useEffect(() => {
    if (!qn) return;
    setDraft('');
    setTried([]);
    sfx('question');
    inputRef.current?.focus({ preventScroll: true });
  }, [qn]);
  // 결과 소리
  const lastKey = s.last ? `${s.last.n}:${s.last.end}` : '';
  useEffect(() => {
    if (!s.last) return;
    sfx(s.last.ok ? 'correct' : 'timeout');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);
  // 끝 — 띠가 올랐으면 그 순간
  useEffect(() => {
    if (s.phase !== 'end' || !s.end?.belt?.change) return;
    setPromo(s.end.belt);
    sfx('mg-final');
    const id = window.setTimeout(() => setPromo(null), 2600);
    return () => window.clearTimeout(id);
  }, [s.phase, s.end]);

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

  const send = () => {
    const t = draft.trim();
    if (!t || !active || !s.q) return;
    answer(s.q.n, t);
    setTried((x) => [...x.slice(-2), t]);
    setDraft('');
  };

  const remain = s.q ? Math.max(0, s.q.endsAt - now) : 0;
  const ratio = s.q ? Math.max(0, Math.min(1, remain / s.q.limitMs)) : 0;
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
  if (s.phase === 'start' || (s.phase === 'starting' && !resume)) {
    return (
      <div className="solo-screen solo-start" data-solo="start">
        {head('혼자 하기', onClose)}
        <section className="card solo-me">
          {belt && me && <BeltLine step={me.belt ?? null} sub={me.runs > 0 ? `최고 ${me.best} · ${nextText(me.next)}` : nextText(me.next)} />}
          {!belt && <p className="solo-best">최고 기록 <b className="mono">{me?.best ?? 0}</b></p>}
        </section>
        <section className="card solo-rules" aria-label="규칙">
          <p>
            <span className="solo-rule-ic heart"><Icon icon={Heart} fill="currentColor" /></span>
            목숨 셋 — 시간 안에 못 맞히면 하나씩
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
        {s.error && <p className="form-error" role="alert">{s.error}</p>}
        <button type="button" className="primary big-btn solo-go" data-solo-start onClick={start} disabled={s.phase === 'starting'}>
          시작
        </button>
      </div>
    );
  }

  // ── 끝
  if (s.phase === 'end' && s.end) {
    const e = s.end;
    return (
      <div className="solo-screen solo-end" data-solo="end">
        {head('혼자 하기 끝', null)}
        <section className="card solo-result" data-solo-score={e.correct}>
          <small className="dim">이번 기록</small>
          <b className="solo-huge mono">{e.correct}</b>
          <small>
            최고 <b className="mono">{e.best}</b>
            {e.newBest && e.correct > 0 && <b className="solo-newbest"> · 새 기록!</b>}
          </small>
          {e.belt && <BeltLine step={e.belt.step} sub={nextText(e.belt.next)} />}
        </section>
        {e.wrongs.length > 0 && (
          <section className="card solo-wrongs" aria-label="틀린 문제">
            <h2>틀린 {e.wrongs.length === 3 ? '세' : e.wrongs.length === 2 ? '두' : '한'} 문제</h2>
            {e.wrongs.map((w) => (
              <div key={w.n} className="solo-wq" data-wq={w.n}>
                <small className="dim">{w.n}번째 · {w.end === 'away' ? '화면을 벗어남' : '시간 끝'}</small>
                <p>{w.text}</p>
                <b>{w.answer}</b>
                {w.explanation && <small className="dim">{w.explanation}</small>}
              </div>
            ))}
          </section>
        )}
        <div className="solo-actions">
          <button type="button" data-solo-lobby onClick={onClose}>
            <Icon icon={Home} /> 로비
          </button>
          <button type="button" className="primary" data-solo-again onClick={start}>
            <Icon icon={RotateCcw} /> 다시
          </button>
        </div>
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

  // ── 진행(안 A)
  const q = s.q;
  const last = s.last;
  return (
    <div className="solo-screen solo-play" data-solo="play">
      <div className="solo-bar">
        <Lives n={s.lives} />
        <span className="solo-sp" />
        <span className="solo-count">
          <small>맞힌 개수</small>
          <b className="mono" data-solo-correct>{s.correct}</b>
        </span>
        <button type="button" className="ghost tiny solo-quit" onClick={() => setQuitOpen(true)}>
          그만하기
        </button>
      </div>
      <section className={`card question-card solo-q${urgent ? ' urgent' : ''}${last && !last.ok ? ' miss' : ''}`} data-solo-q={q?.n ?? 0}>
        {q ? (
          <>
            <div className="q-head">
              <span className="q-progress mono">{q.n}번째</span>
              <span className="badge cat">{q.category}</span>
              <span className="badge diff">등급 {q.grade}</span>
              {active ? (
                <span className={`q-timer mono${urgent ? ' urgent' : ''}`}>{sec}초</span>
              ) : last ? (
                <span className={`q-timer${last.ok ? ' solo-ok' : ' solo-bad'}`}>{last.ok ? '정답!' : last.end === 'away' ? '화면을 벗어남' : '시간 끝'}</span>
              ) : null}
            </div>
            <QuestionText text={q.text} />
            {active ? (
              <div className="q-timebar" aria-hidden="true">
                <div className={`q-timebar-fill${urgent ? ' urgent' : ''}`} style={{ transform: `scaleX(${ratio})` }} />
              </div>
            ) : last ? (
              <div className={`solo-reveal${last.ok ? ' ok' : ' bad'}`} data-solo-reveal={last.ok ? 'ok' : last.end}>
                정답 <b>{last.answer}</b>
                {last.ok && last.ms !== null && <span className="mono dim"> · {(last.ms / 1000).toFixed(1)}초</span>}
              </div>
            ) : null}
          </>
        ) : (
          <p className="dim solo-wait">문제를 고르는 중…</p>
        )}
      </section>
      <div className="field-row chat-input-row solo-input">
        <input
          ref={inputRef}
          value={draft}
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
            send();
          }}
        />
        <button type="button" className="primary send-btn" aria-label="보내기" onMouseDown={(e) => e.preventDefault()} onClick={send} disabled={!active}>
          <Icon icon={Send} />
        </button>
      </div>
      {tried.length > 0 && active && (
        <p className="solo-tried dim" aria-live="polite">
          친 답 {tried.map((t, i) => <span key={i} className="badge">{t}</span>)}
        </p>
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

/** 로비 [혼자 하기] 아래 글 · 프로필 띠 줄에 쓰는 내 기록(한 번 읽음) */
export function useSoloMe(on: boolean): SoloMeView | null {
  const [me, setMe] = useState<SoloMeView | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    void fetchSoloMe().then((m) => {
      if (live) setMe(m);
    });
    return () => {
      live = false;
    };
  }, [on]);
  return useMemo(() => me, [me]);
}
