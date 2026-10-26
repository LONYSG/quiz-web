// =============================================================================
// ★★ 앱 제보 (R061 · D-255) — 찬종 "어떤 화면이라도 문제점을 제보할 수 있는 창 … 문제전용 피드백, 전반적인 피드백 2가지"
//
// ★ ⓑ 전반적 🐞 — ReportHost(App 에 하나): PC 오른쪽 아래 떠 있는 "🐞 제보" + Alt+B · 모바일 오른쪽 위 작은 🐞(미니게임 play 단계엔 숨김)
//   + 메뉴 "🐞 제보". 창: 종류 칩 4 · 글(≤500 · 여러 줄 · Ctrl+Enter 보내기) · 맥락 한 줄 · [보내기] [닫기].
//   보내지 못하면 글을 localStorage 에 한 건 보관 → 다음 열 때 복구.
// ★ ⓐ 문제 전용 📝 — QReportButton(문제 카드 머리 줄 · 결과 목록 · 로비 목록 · 미니게임 퀴즈 공개): 창 머리에 #번호 고정 · 사유 칩 7(R056 코드) · 글(선택).
// ★ 문항 번호 QNo — 누르면 "#2271" 복사(안 되면 글 선택) · 질문 글(복사 막기) 바깥.
// ★ 포커스: 열기 전엔 답 입력창 포커스를 빼앗지 않는다(누를 때 mousedown 막기) · 닫으면 열기 전 자리로 돌려준다.
// ★ 맥락: 클라는 screen · 문항 순번 · 미니게임 key 만 — 판 · 문항 · 미니게임 판 id 는 서버가 붙인다. 채팅 원문은 보내지 않는다.
// ★★ R065 (D-270 · D-271) — 찬종 "제보하기를 문제 컴포넌트 안에다 넣지 말고 제보 메뉴를 누르면 두 가지":
//   제보 메뉴(위 막대 · ☰ · Alt+B) → 작은 메뉴 창 ① 문제 · 미니게임 제보(최근 목록 reportRecent 에서 골라 문항 창) ② 일반 제보.
//   문제 카드 · 미니게임 머리의 📝 는 뺐다(결과 목록의 📝 는 그대로). 로그인 전 링크는 일반 제보로 바로.
//   창이 열려 있으면 게임이 키 · 포커스를 가져가지 않는다(reportGuard) · 맥락(화면 · 최근 이벤트 · 기기)은 **창을 연 때** 것으로 고정.
// =============================================================================

import { recentClientErrors } from './clientErrors.js';
import { recentTargets, subscribeRecent, type RecentTarget } from './reportRecent.js';
import { setReportOpen } from './reportGuard.js';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';
import { Bug, ListChecks, MessageSquareWarning, NotebookPen } from 'lucide-react';
import { FEEDBACK_REASONS, REPORT_KINDS, REPORT_TEXT_MAX, minigameInfo, type MinigameKey } from '@quiz/shared';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { getEmojiInsert } from './emojiCatalog.js';
import { getTheme } from './theme.js';
import { closePopup, useCurrentPopup, usePopup } from './popup.js';
import { useUiMode } from './uiMode.js';
import { gearHasTabs, getGearTab, openGear } from './gearTab.js';

declare const __BUILD__: string;

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

// ── 작은 저장소 (지금 화면 · 📝 대상 · 알림) ───────────────────────────────────
export interface ReportScreen {
  screen: string;
  questionIndex: number | null;
  minigameKey: string | null;
  /** ★ R066 — 연 때 미니게임 문항(사진 · 퀴즈류) */
  minigameItem?: string | null;
  /** 맥락 줄 — "미니게임 각도 맞추기 · 문항 7" */
  label: string;
}
interface QTarget {
  questionId: string | null;
  minigameItem: string | null;
  questionIndex: number | null;
  /** ★ R065 — 최근 목록에서 고른 미니게임(문항 없는 게임도) · 그 대상의 시각(서버가 그 판을 찾는다) */
  minigameKey?: string | null;
  at?: number | null;
  /** 창 머리 이름(미니게임 이름 등) */
  name?: string;
  /** 연 때 맥락 */
  frozen: Frozen;
}
/** ★ R065 (D-271) — 창을 연 때의 맥락(그 뒤 화면이 바뀌어도 "제보 당시 화면") */
interface Frozen {
  /** ★ R066 (D-280) — 연 시각 — 서버가 "연 때의 미니게임 판" 을 찾는다(참가한 판만) */
  at: number;
  ctx: ReportScreen;
  recent: { e: string; t: number }[];
  device: ReturnType<typeof device>;
}
const freeze = (mobile: boolean): Frozen => ({ at: Date.now(), ctx: screenNow, recent: recentEvents.slice(), device: device(mobile) });
let screenNow: ReportScreen = { screen: 'unknown', questionIndex: null, minigameKey: null, label: '' };
let qTarget: QTarget | null = null;
let flashMsg: { text: string; until: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 알림 한 줄 (제보 접수 · 복사됨) */
function flash(text: string, ms: number) {
  flashMsg = { text, until: Date.now() + ms };
  emit();
  setTimeout(() => {
    if (flashMsg && Date.now() >= flashMsg.until) {
      flashMsg = null;
      emit();
    }
  }, ms + 20);
}

// ── 최근 소켓 이벤트 이름 20개(글 내용 없이 이름 · 시각만) ───────────────────────
const recentEvents: { e: string; t: number }[] = [];
export function trackReportEvents(socket: Socket): () => void {
  const on = (name: string) => {
    if (name === 'time.pong') return;
    recentEvents.push({ e: name, t: Date.now() });
    if (recentEvents.length > 20) recentEvents.shift();
  };
  socket.onAny(on);
  return () => socket.offAny(on);
}

function device(mobile: boolean) {
  return {
    mobile,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ua: navigator.userAgent.slice(0, 120),
    build: typeof __BUILD__ === 'string' ? __BUILD__ : '',
    emojiInsert: getEmojiInsert(),
    // ★ R063 — 같은 화면이 어떤 기기에선 깨지는 것을 가리려고: 모니터 해상도(CSS px) · 배율 · 테마 · UI 모드
    screen: `${window.screen.width}x${window.screen.height}`,
    dpr: window.devicePixelRatio,
    theme: getTheme(),
    ui: mobile ? 'mobile' : 'pc',
    // ★ R064 (D-264) — 최근 예외 · 가운데 화면에 무엇이 어디 있었나("안 보여요" 제보를 그 자리에서 읽으려고)
    errors: recentClientErrors(),
    layout: layoutHint(),
  };
}

/** 가운데 칸의 카드들 — "result-card 58-422 · chat-card 430-1300" 꼴(짧게) */
function layoutHint(): string {
  const main = document.querySelector('.center-main');
  if (!main) return '';
  return [...main.children]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter((c) => c !== 'card')[0] ?? el.tagName.toLowerCase();
      return `${cls} ${Math.round(r.top)}-${Math.round(r.bottom)}`;
    })
    .join(' · ')
    .slice(0, 200);
}

async function postReport(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; message?: string };
  if (!res.ok || !json.ok || !json.id) throw new Error(json.message ?? '보내지 못했어요');
  return { id: json.id };
}

const DRAFT_KEY = 'quiz.reportDraft';
const readDraft = (): { kind: string; text: string } | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as { kind: string; text: string }) : null;
  } catch {
    return null;
  }
};
const writeDraft = (d: { kind: string; text: string } | null) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 저장 못 해도 창은 그대로 */
  }
};

/** 열기 전 포커스 자리를 기억했다가 닫을 때 돌려준다
 *  ★ 창 안 글칸의 autoFocus 가 effect 보다 먼저 돈다 → "창 바깥에서 마지막으로 포커스된 것" 을 늘 기억해 둔다 */
let lastOutside: HTMLElement | null = null;
function useReturnFocus(open: boolean) {
  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest?.('.report-modal')) lastOutside = t;
    };
    document.addEventListener('focusin', onIn);
    return () => document.removeEventListener('focusin', onIn);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const back = prev && !prev.closest?.('.report-modal') ? prev : lastOutside;
    return () => {
      if (back && document.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
    };
  }, [open]);
}

function useEscClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);
}

// ── 문항 번호 (누르면 복사) ─────────────────────────────────────────────────────
export function QNo({ id, raw }: { id: string; raw?: boolean }) {
  // ★ 퀴즈 문항은 "#2271" · 미니게임 문항은 "photo-0303" 그대로
  const text = raw ? id : `#${id}`;
  return (
    <button
      type="button"
      className="qno mono"
      title="누르면 번호 복사 — 제보 글에 붙이면 그 문항에 붙어요"
      data-qno={id}
      onMouseDown={keepFocus}
      onClick={(e) => {
        const el = e.currentTarget;
        const done = () => flash(`${text} 복사됨`, 1000);
        const fallback = () => {
          // 클립보드를 못 쓰면 글자를 선택해 둔다(길게 눌러 복사)
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          flash(`${text} — 선택됨(복사해 주세요)`, 1500);
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
      }}
    >
      {text}
    </button>
  );
}

// ── ⓐ 문제 전용 📝 ──────────────────────────────────────────────────────────────
/** 📝 창 열기 — ★ "지난 판 문제 평가" 창 위에는 겹쳐 연다(목록을 닫지 않게) · 그 밖의 창은 닫는다(팝업 하나 규칙) */
function openQReport(t: QTarget, current: string | null) {
  if (current !== 'feedback-last') closePopup();
  qTarget = t;
  emit();
}
function closeQReport() {
  qTarget = null;
  emit();
}

/** ★ 결과 목록 · 로비 목록의 📝 (R065 — 문제 카드 · 미니게임 머리에서는 뺐다) */
export function QReportButton({ questionId = null, minigameItem = null, questionIndex = null }: { questionId?: string | null; minigameItem?: string | null; questionIndex?: number | null }) {
  const mobile = useUiMode() === 'mobile';
  const current = useCurrentPopup();
  return (
    <button
      type="button"
      className="qreport-btn"
      title="이 문제 피드백"
      aria-label="이 문제 피드백"
      data-qreport={questionId ?? minigameItem ?? ''}
      onMouseDown={keepFocus}
      onClick={() => openQReport({ questionId, minigameItem, questionIndex, frozen: freeze(mobile) }, current)}
    >
      <Icon icon={NotebookPen} />
      {!mobile && <span className="qreport-lbl">피드백</span>}
    </button>
  );
}

function QReportWindow({ target, onClose }: { target: QTarget; onClose: () => void }) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = target.questionId ? `#${target.questionId}` : (target.minigameItem ?? '');
  const { ctx, recent, device: dev } = target.frozen;
  const send = () => {
    if (busy || (!text.trim() && reasons.length === 0)) return;
    setBusy(true);
    setErr(null);
    postReport({
      kind: 'question',
      text: text.trim(),
      reasons,
      screen: ctx.screen,
      questionIndex: target.questionIndex ?? (target.at ? null : ctx.questionIndex),
      minigameKey: target.minigameKey ?? (target.at ? null : ctx.minigameKey),
      questionId: target.questionId,
      minigameItem: target.minigameItem,
      at: target.at ? new Date(target.at).toISOString() : null,
      device: dev,
      recent,
    })
      .then(() => {
        flash(`${target.name ?? `문항 ${label}`} 피드백 접수`, 1500);
        onClose();
      })
      .catch((e: Error) => {
        setErr(e.message);
        setBusy(false);
      });
  };
  return (
    <div className="modal report-modal qreport-modal" role="dialog" aria-label={`${target.name ?? `문항 ${label}`} 피드백`}>
      <div className="pop-head">
        <p className="pop-title">
          <Icon icon={NotebookPen} />{' '}
          {target.name ? (
            <>
              {target.name}
              {label && <span className="mono"> · {label}</span>}
            </>
          ) : (
            <>
              문항 <span className="mono">{label}</span>
            </>
          )}{' '}
          피드백
        </p>
        <PopupClose onClose={onClose} />
      </div>
      <div className="report-chips" role="group" aria-label="무엇이 문제인가요">
        {FEEDBACK_REASONS.map((r) => (
          <button
            key={r.code}
            type="button"
            className={reasons.includes(r.code) ? 'fb-chip on' : 'fb-chip'}
            aria-pressed={reasons.includes(r.code)}
            data-reason={r.code}
            onMouseDown={keepFocus}
            onClick={() => setReasons((x) => (x.includes(r.code) ? x.filter((c) => c !== r.code) : [...x, r.code]))}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        className="report-text"
        rows={2}
        maxLength={REPORT_TEXT_MAX}
        value={text}
        placeholder="덧붙일 말(선택)"
        aria-label="덧붙일 말"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      {err && <p className="fb-err">{err}</p>}
      <div className="report-actions">
        <button type="button" className="ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="primary" disabled={busy || (!text.trim() && reasons.length === 0)} onClick={send}>
          보내기
        </button>
      </div>
    </div>
  );
}

// ── ⓑ 전반적 🐞 ────────────────────────────────────────────────────────────────
const BUG_KINDS = REPORT_KINDS.filter((k) => k.code !== 'question');

function ReportWindow({ frozen, onClose }: { frozen: Frozen; onClose: () => void }) {
  const mobile = useUiMode() === 'mobile';
  const draft = useRef(readDraft()).current;
  const [kind, setKind] = useState<string>(draft?.kind && BUG_KINDS.some((k) => k.code === draft.kind) ? draft.kind : 'bug');
  const [text, setText] = useState(draft?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(draft ? '보내지 못한 글을 되살렸어요.' : null);
  // ★ R065 — 연 때 맥락(열고 나서 화면이 바뀌어도 그대로)
  const { ctx, recent, device: dev, at } = frozen;
  const send = () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr(null);
    postReport({
      kind,
      text: text.trim(),
      // ★ 로그인 전 — 아이디 칸만 읽는다(비밀번호 칸은 읽지 않는다)
      loginHint: ctx.screen === 'auth' ? ((document.querySelector('input[autocomplete="username"]') as HTMLInputElement | null)?.value ?? null) : null,
      screen: ctx.screen,
      questionIndex: ctx.questionIndex,
      minigameKey: ctx.minigameKey,
      minigameItem: ctx.minigameItem ?? null,
      // ★ R066 (D-280) — 미니게임 판 · 문항은 연 때 것(보낼 때 방이 다음 게임이어도) — 로그인 전은 서버가 안 본다
      at: new Date(at).toISOString(),
      device: dev,
      recent,
    })
      .then(({ id }) => {
        writeDraft(null);
        flash(`제보 접수 #${id} — 고마워요`, 1500);
        onClose();
      })
      .catch((e: Error) => {
        writeDraft({ kind, text });
        setErr(`${e.message} — 글은 보관했어요(다음에 열면 되살아나요)`);
        setBusy(false);
      });
  };
  return (
    <div className="modal report-modal" role="dialog" aria-label="제보">
      <div className="pop-head">
        <p className="pop-title">
          <Icon icon={Bug} /> 제보
        </p>
        <PopupClose onClose={onClose} />
      </div>
      <div className="report-chips" role="radiogroup" aria-label="종류">
        {BUG_KINDS.map((k) => (
          <button key={k.code} type="button" role="radio" aria-checked={kind === k.code} className={kind === k.code ? 'fb-chip on' : 'fb-chip'} data-kind={k.code} onClick={() => setKind(k.code)}>
            {k.label}
          </button>
        ))}
      </div>
      <textarea
        className="report-text"
        rows={mobile ? 3 : 4}
        maxLength={REPORT_TEXT_MAX}
        value={text}
        autoFocus
        placeholder="무엇이 이상했나요?"
        aria-label="제보 내용"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      {/* ★ R063 — 사람 말로 · 번호가 없는 화면(로비 · 대기실 · 로그인)은 줄을 숨긴다 */}
      {ctx.label && (
        <p className="report-ctx dim" data-report-ctx>
          {ctx.label}
        </p>
      )}
      {err && <p className="fb-err">{err}</p>}
      <div className="report-actions">
        <button type="button" className="ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="primary" disabled={busy || !text.trim()} onClick={send}>
          보내기
        </button>
      </div>
    </div>
  );
}

// ── ★ R065 (D-270) 제보 메뉴 — 두 갈래 ──────────────────────────────────────────
const LIST_MAX = 20;
const hhmm = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const mgName = (key: string | null) => (key ? (minigameInfo(key as MinigameKey)?.name ?? key) : '');

/** 목록 한 줄 — "문제 3 · #2411 · 질문 앞 24자…" / "각도 맞히기 · photo-0012 · 00:40" */
function RecentRow({ t, onPick }: { t: RecentTarget; onPick: () => void }) {
  return (
    <button type="button" className="report-recent-row" data-recent={t.questionId ?? t.minigameItem ?? t.minigameKey ?? ''} onClick={onPick}>
      {t.questionId ? (
        <>
          <span className="rr-head">문제 {t.questionIndex}</span>
          <span className="mono rr-id">#{t.questionId}</span>
          <span className="rr-text dim" title={t.text ?? ''}>
            {t.text}
            {t.text && t.text.length >= 24 ? '…' : ''}
          </span>
        </>
      ) : (
        <>
          <span className="rr-head">{mgName(t.minigameKey)}</span>
          {t.minigameItem && <span className="mono rr-id">{t.minigameItem}</span>}
          <span className="rr-text dim mono">{hhmm(t.at)}</span>
        </>
      )}
    </button>
  );
}

type Step = 'menu' | 'list' | 'general';
let nextStep: Step = 'menu';

function ReportFlow({ onClose }: { onClose: () => void }) {
  const mobile = useUiMode() === 'mobile';
  // ★ 연 때 맥락 — 메뉴를 연 순간(목록 · 일반 창으로 넘어가도 같은 것)
  const frozen = useRef<Frozen | null>(null);
  frozen.current ??= freeze(mobile);
  const [step, setStep] = useState<Step>(() => {
    const st = nextStep;
    nextStep = 'menu';
    return st;
  });
  const items = useSyncExternalStore(subscribeRecent, recentTargets);
  if (step === 'general') return <ReportWindow frozen={frozen.current} onClose={onClose} />;
  const head = (
    <div className="pop-head">
      <p className="pop-title">
        <Icon icon={Bug} /> 제보
      </p>
      <PopupClose onClose={onClose} />
    </div>
  );
  if (step === 'list') {
    const shown = items.slice(0, LIST_MAX);
    const fz = frozen.current;
    return (
      <div className="modal report-modal report-menu" role="dialog" aria-label="문제 · 미니게임 제보" data-report-list>
        {head}
        <p className="report-menu-sub dim">어느 것을 제보할까요? (최근 것이 위)</p>
        {shown.length === 0 ? (
          <p className="report-recent-empty dim" data-recent-empty>
            아직 본 문제가 없어요
          </p>
        ) : (
          <div className="report-recent">
            {shown.map((t) => (
              <RecentRow
                key={t.key}
                t={t}
                onPick={() =>
                  openQReport(
                    {
                      questionId: t.questionId,
                      minigameItem: t.minigameItem,
                      questionIndex: t.questionIndex,
                      minigameKey: t.minigameKey,
                      at: t.at,
                      name: t.questionId ? undefined : mgName(t.minigameKey),
                      frozen: fz,
                    },
                    null,
                  )
                }
              />
            ))}
          </div>
        )}
        <div className="report-actions">
          <button type="button" className="ghost" data-report-back onClick={() => setStep('menu')}>
            뒤로
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="modal report-modal report-menu" role="dialog" aria-label="제보" data-report-menu>
      {head}
      <div className="report-menu-pick">
        <button type="button" className="report-menu-item" data-report-pick="recent" autoFocus onClick={() => setStep('list')}>
          <Icon icon={ListChecks} />
          <span className="rm-title">문제 · 미니게임 제보</span>
          <span className="rm-sub dim">최근에 본 것에서 골라요</span>
        </button>
        <button type="button" className="report-menu-item" data-report-pick="general" onClick={() => setStep('general')}>
          <Icon icon={MessageSquareWarning} />
          <span className="rm-title">일반 제보</span>
          <span className="rm-sub dim">버그 · 어색함 · 제안 · 기타</span>
        </button>
      </div>
    </div>
  );
}

/** ★ R063 (D-256) — 위 막대의 정식 메뉴 버튼(떠 있는 🐞 는 없앴다 — 찬종 "정식 메뉴처럼") */
export function ReportButton({ className = 'ghost tiny report-btn' }: { className?: string }) {
  const [, setOpen] = usePopup('report');
  return (
    <button type="button" className={className} title="제보 (Alt+B)" aria-label="제보" data-report-btn onMouseDown={keepFocus} onClick={() => setOpen(true)}>
      <Icon icon={Bug} />
      <span className="lbl">제보</span>
    </button>
  );
}

/**
 * ★★ R067 (D-300) — ⚙ 창의 "제보" 탭: 제보 메뉴의 두 갈래를 그대로(누르면 제보 창이 그 단계로 열린다 — ⚙ 창은 닫힌다)
 */
export function ReportPick() {
  const [, setOpen] = usePopup('report');
  const go = (step: Step) => {
    nextStep = step;
    setOpen(true);
  };
  return (
    <div className="report-menu-pick gear-report" data-gear-report>
      <button type="button" className="report-menu-item" data-report-pick="recent" onClick={() => go('list')}>
        <Icon icon={ListChecks} />
        <span className="rm-title">문제 · 미니게임 제보</span>
        <span className="rm-sub dim">최근에 본 것에서 골라요</span>
      </button>
      <button type="button" className="report-menu-item" data-report-pick="general" onClick={() => go('general')}>
        <Icon icon={MessageSquareWarning} />
        <span className="rm-title">일반 제보</span>
        <span className="rm-sub dim">버그 · 어색함 · 제안 · 기타</span>
      </button>
      <p className="dim gear-report-key">단축키 Alt+B</p>
    </div>
  );
}

/** 로그인 전 화면 — 카드 아래 작은 글 링크 */
export function ReportLink() {
  const [, setOpen] = usePopup('report');
  return (
    <p className="report-link">
      <button
        type="button"
        className="link-btn"
        data-report-link
        onClick={() => {
          nextStep = 'general';
          setOpen(true);
        }}
      >
        문제가 있나요? 제보
      </button>
    </p>
  );
}

/** 메뉴 · 단축키에서 연다 */
export function useOpenBugReport(): () => void {
  const [, setOpen] = usePopup('report');
  return useCallback(() => setOpen(true), [setOpen]);
}

/** ★ R068 — 문제 평가 목록의 "제보에 적어 주세요" 링크 — 제보 메뉴(최근 문제 · 일반)를 연다 */
export function useOpenReportAt(): (step: 'menu' | 'list' | 'general') => void {
  const [, setOpen] = usePopup('report');
  return useCallback(
    (step) => {
      nextStep = step;
      setOpen(true);
    },
    [setOpen],
  );
}

// ── App 에 하나 ─────────────────────────────────────────────────────────────────
export default function ReportHost({ ctx }: { ctx: ReportScreen }) {
  screenNow = ctx;
  const [open, setOpen] = usePopup('report');
  const target = useSyncExternalStore(subscribe, () => qTarget);
  const qOpen = target !== null;
  // ★ R065 (D-271) — 게임(키 · 자동 포커스)이 읽는다
  setReportOpen(open || qOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const qClose = closeQReport;
  // 다른 창(🐞 · 메뉴 …)이 열리면 📝 는 닫는다 — "지난 판 평가" 위에 겹친 것만 남긴다
  const current = useCurrentPopup();
  useEffect(() => {
    if (current && current !== 'feedback-last' && qTarget) closeQReport();
  }, [current]);
  useReturnFocus(open || qOpen);
  useEscClose(open, close);
  useEscClose(qOpen, qClose);
  const msg = useSyncExternalStore(subscribe, () => flashMsg);
  // Alt+B — 어느 화면에서든 (shortcuts.ts 헤더: Alt 조합은 IME 에서 문자를 만들지 않는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyB') return;
      e.preventDefault();
      // ★ R067 (D-300) — PC 방 안은 ⚙ 의 제보 탭(다시 누르면 닫힘) · 방 밖 · 모바일은 옛 제보 창
      if (gearHasTabs()) {
        if (current === 'prefs' && getGearTab() === 'report') closePopup('prefs');
        else openGear('report');
        return;
      }
      setOpen((x) => !x);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, current]);
  const back = (child: React.ReactNode, onClose: () => void) =>
    createPortal(
      <div
        className="modal-back popup-back report-back"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {child}
      </div>,
      document.body,
    );
  return (
    <>
      {open && back(<ReportFlow onClose={close} />, close)}
      {target && back(<QReportWindow key={target.questionId ?? target.minigameItem ?? ''} target={target} onClose={qClose} />, qClose)}
      {msg && (
        <div className="report-toast" role="status" data-report-toast>
          {msg.text}
        </div>
      )}
    </>
  );
}
