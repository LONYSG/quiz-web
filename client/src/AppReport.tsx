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
// =============================================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';
import { Bug, NotebookPen } from 'lucide-react';
import { FEEDBACK_REASONS, REPORT_KINDS, REPORT_TEXT_MAX } from '@quiz/shared';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import { getEmojiInsert } from './emojiCatalog.js';
import { closePopup, useCurrentPopup, usePopup } from './popup.js';
import { useUiMode } from './uiMode.js';

declare const __BUILD__: string;

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

// ── 작은 저장소 (지금 화면 · 📝 대상 · 알림) ───────────────────────────────────
export interface ReportScreen {
  screen: string;
  questionIndex: number | null;
  minigameKey: string | null;
  /** 맥락 줄 — "미니게임 각도 맞추기 · 문항 7" */
  label: string;
}
interface QTarget {
  questionId: string | null;
  minigameItem: string | null;
  questionIndex: number | null;
}
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
  };
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

/** 열기 전 포커스 자리를 기억했다가 닫을 때 돌려준다 */
function useReturnFocus(open: boolean) {
  const prev = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    prev.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = prev.current;
      if (el && document.contains(el) && typeof el.focus === 'function') el.focus({ preventScroll: true });
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
      onClick={() => openQReport({ questionId, minigameItem, questionIndex }, current)}
    >
      <Icon icon={NotebookPen} />
      {!mobile && <span className="qreport-lbl">피드백</span>}
    </button>
  );
}

function QReportWindow({ target, onClose }: { target: QTarget; onClose: () => void }) {
  const mobile = useUiMode() === 'mobile';
  const [reasons, setReasons] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = target.questionId ? `#${target.questionId}` : (target.minigameItem ?? '');
  const send = () => {
    if (busy || (!text.trim() && reasons.length === 0)) return;
    setBusy(true);
    setErr(null);
    postReport({
      kind: 'question',
      text: text.trim(),
      reasons,
      screen: screenNow.screen,
      questionIndex: target.questionIndex ?? screenNow.questionIndex,
      minigameKey: screenNow.minigameKey,
      questionId: target.questionId,
      minigameItem: target.minigameItem,
      device: device(mobile),
      recent: recentEvents.slice(),
    })
      .then(() => {
        flash(`문항 ${label} 피드백 접수`, 1500);
        onClose();
      })
      .catch((e: Error) => {
        setErr(e.message);
        setBusy(false);
      });
  };
  return (
    <div className="modal report-modal qreport-modal" role="dialog" aria-label={`문항 ${label} 피드백`}>
      <div className="pop-head">
        <p className="pop-title">
          <Icon icon={NotebookPen} /> 문항 <span className="mono">{label}</span> 피드백
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
        <button type="button" disabled={busy || (!text.trim() && reasons.length === 0)} onClick={send}>
          보내기
        </button>
      </div>
    </div>
  );
}

// ── ⓑ 전반적 🐞 ────────────────────────────────────────────────────────────────
const BUG_KINDS = REPORT_KINDS.filter((k) => k.code !== 'question');

function ReportWindow({ onClose }: { onClose: () => void }) {
  const mobile = useUiMode() === 'mobile';
  const draft = useRef(readDraft()).current;
  const [kind, setKind] = useState<string>(draft?.kind && BUG_KINDS.some((k) => k.code === draft.kind) ? draft.kind : 'bug');
  const [text, setText] = useState(draft?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(draft ? '보내지 못한 글을 되살렸어요.' : null);
  const ctx = screenNow;
  const send = () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr(null);
    postReport({
      kind,
      text: text.trim(),
      screen: ctx.screen,
      questionIndex: ctx.questionIndex,
      minigameKey: ctx.minigameKey,
      device: device(mobile),
      recent: recentEvents.slice(),
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
        placeholder="무엇이 이상했나요? 문항이면 #번호를 같이 적어 주세요 (Ctrl+Enter 보내기)"
        aria-label="제보 내용"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <p className="report-ctx dim" data-report-ctx>
        지금: {ctx.label || ctx.screen}
      </p>
      {err && <p className="fb-err">{err}</p>}
      <div className="report-actions">
        <button type="button" className="ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" disabled={busy || !text.trim()} onClick={send}>
          보내기
        </button>
      </div>
    </div>
  );
}

/** 메뉴 · 단축키에서 연다 */
export function useOpenBugReport(): () => void {
  const [, setOpen] = usePopup('report');
  return useCallback(() => setOpen(true), [setOpen]);
}

// ── App 에 하나 ─────────────────────────────────────────────────────────────────
export default function ReportHost({ ctx, hideFloat }: { ctx: ReportScreen; hideFloat: boolean }) {
  const mobile = useUiMode() === 'mobile';
  screenNow = ctx;
  const [open, setOpen] = usePopup('report');
  const target = useSyncExternalStore(subscribe, () => qTarget);
  const qOpen = target !== null;
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
      setOpen((x) => !x);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
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
      {!(mobile && hideFloat) && (
        <button
          type="button"
          className={mobile ? 'report-float m' : 'report-float'}
          title="제보 (Alt+B)"
          aria-label="제보"
          data-report-float
          onMouseDown={keepFocus}
          onClick={() => setOpen(true)}
        >
          <Icon icon={Bug} />
          {!mobile && <span>제보</span>}
        </button>
      )}
      {open && back(<ReportWindow onClose={close} />, close)}
      {target && back(<QReportWindow key={target.questionId ?? target.minigameItem ?? ''} target={target} onClose={qClose} />, qClose)}
      {msg && (
        <div className="report-toast" role="status" data-report-toast>
          {msg.text}
        </div>
      )}
    </>
  );
}
