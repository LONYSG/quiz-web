// =============================================================================
// ★★★ 타자 (R051 · D-237) — 제시 문장을 정확히 빨리
//
// ★ 화면: 제시 문장(글자마다 맞음 초록 · 틀림 빨강 · 조합 중 회색 밑줄 · 아직 흐림) + 입력칸 하나 + 남은 시간 막대.
// ★ 제시 문장은 `.no-copy`(복사 · 끌기 · 선택 막기 — noCopy.ts) · 입력칸은 **붙여넣기 · 끌어 놓기 막기**(paste · drop · beforeinput).
// ★ 완성 = 입력이 제시와 정확히 같은 순간(NFC). 틀린 글자는 빨갛게 — 지워야 진행(같아질 수 없으니).
// ★ 시간 = 판 시작 신호를 받은 순간(문장이 보인 때)부터 — 기기 시간. 치는 동안 0.4초마다 진행 글(임시)을 보낸다(못 끝내면 진행률 순위).
// ★★ R067 (D-297) — 준비(ready) 단계에는 **연습 입력칸**: 문장 · 시간 막대 없이 입력칸만(자동 포커스 · "여기서 미리 쳐 보세요") · 점수 없음 ·
//   틀린 언어면 R066 빨간 안내 그대로. play 로 넘어가는 순간 칸을 비우고 포커스는 그대로(같은 input — MinigameStage 가 같은 자리에 둔다).
// ★ 모바일: autocapitalize · autocorrect · spellcheck 끔 · 키보드가 올라오면 입력칸을 화면 가운데로(문장은 입력칸 바로 위).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { typingComplete, typingMarks, typingProgress } from '@quiz/shared';
import { sfx } from '../sound.js';
import type { MinigameView } from '../useRoom.js';
import { useFrameNow, usePlayT0 } from './playClock.js';
import { isReportOpen } from '../reportGuard.js';

interface Props {
  socket: Socket;
  view: MinigameView;
  serverNow: () => number;
  mobile: boolean;
}

export default function TypingRace({ socket, view, serverNow, mobile }: Props) {
  const p = view.round?.params ?? {};
  const target = String(p.text ?? '');
  const lang = p.lang === 'en' ? 'en' : 'ko';
  const playMs = view.round?.playMs ?? 30000;
  const playing = view.phase === 'play';
  const canPlay = playing && !view.spectating;
  const practice = view.phase === 'ready' && !view.spectating; // ★ R067 연습 입력칸
  const { key, t0 } = usePlayT0(view, serverNow);
  const now = useFrameNow(playing);
  const [text, setText] = useState(view.lab?.typed ?? '');
  const [composing, setComposing] = useState(view.lab?.composing ?? false);
  const [done, setDone] = useState<{ key: string; ms: number } | null>(null);
  const [blocked, setBlocked] = useState(0);
  const mine = done?.key === key ? done : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const composingRef = useRef(composing);
  composingRef.current = composing;
  const dirty = useRef(false);

  // 판이 바뀌면 비운다
  useEffect(() => {
    setText(view.lab?.typed ?? '');
    setComposing(view.lab?.composing ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const elapsed = t0 !== null ? Math.max(0, now - t0) : 0;
  const over = !mine && elapsed >= playMs;
  const leftRatio = Math.max(0, 1 - elapsed / playMs);

  // ★ R063 (D-261 · 바운디 #14 "문장 나오면 바로 키보드 올라오는게 좋을듯") — 모바일도 문장이 뜨는 순간 입력칸에.
  //   브라우저가 손짓 없는 포커스를 막으면(키보드 안 뜸) 입력칸 아래 "입력칸을 누르세요" 한 줄.
  const targetRef = useRef<HTMLParagraphElement>(null);
  const [needTap, setNeedTap] = useState(false);
  const keepSentenceVisible = () => {
    // 키보드가 올라와 화면이 줄면 문장 머리부터 보이게(문장 · 입력칸이 함께 키보드 위)
    targetRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };
  useEffect(() => {
    if (!canPlay) return undefined;
    setNeedTap(false);
    const id = window.setTimeout(() => {
      // ★ R065 — 제보 창이 열려 있으면 포커스를 가져오지 않는다
      if (isReportOpen()) return;
      inputRef.current?.focus({ preventScroll: true });
      if (mobile) {
        keepSentenceVisible();
        window.setTimeout(() => setNeedTap(document.activeElement !== inputRef.current), 250);
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [canPlay, mobile, key]);
  // ★ R067 — 연습 입력칸: 준비 화면이 뜨면 포커스(제보 창이 열려 있으면 건너뜀)
  useEffect(() => {
    if (!practice) return undefined;
    const id = window.setTimeout(() => {
      if (isReportOpen()) return;
      inputRef.current?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(id);
  }, [practice, key]);
  // ★ R067 — 판 시작: 연습한 글을 비운다(포커스는 그대로 · 조합 중이면 먼저 끊는다)
  const wasPractice = useRef(false);
  useEffect(() => {
    if (practice) {
      wasPractice.current = true;
      return;
    }
    if (!playing || !wasPractice.current) return;
    wasPractice.current = false;
    const el = inputRef.current;
    if (composingRef.current && el && document.activeElement === el) {
      el.blur();
      el.focus({ preventScroll: true });
    }
    setComposing(false);
    setText('');
    dirty.current = false;
  }, [practice, playing]);
  useEffect(() => {
    if (!mobile || !canPlay || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const on = () => {
      if (document.activeElement === inputRef.current) keepSentenceVisible();
    };
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, [mobile, canPlay]);

  // 진행 글(임시) — 0.4초마다 바뀌었으면
  useEffect(() => {
    if (!canPlay) return undefined;
    const iv = window.setInterval(() => {
      if (!dirty.current || mine) return;
      dirty.current = false;
      socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text: textRef.current, final: false } });
    }, 400);
    return () => window.clearInterval(iv);
  }, [canPlay, mine, socket, view.token, view.roundIndex]);

  const doneKey = useRef<string | null>(null);
  const onValue = (v: string) => {
    if (practice) {
      setText(v); // 연습 — 점수 없음 · 보내지 않는다
      return;
    }
    if (!canPlay || mine || over || t0 === null || doneKey.current === key) return;
    setText(v);
    dirty.current = true;
    if (typingComplete(target, v)) {
      doneKey.current = key; // ★ 조합 끝(compositionend)과 onChange 가 같은 값으로 두 번 와도 한 번만 보낸다
      const ms = performance.now() - t0;
      setDone({ key, ms });
      sfx('mg-done');
      socket.emit('minigame.submit', { token: view.token, roundIndex: view.roundIndex, input: { text: v, elapsedMs: ms, final: true } });
      inputRef.current?.blur();
    }
  };

  const block = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBlocked((n) => n + 1);
  };

  // ★ 붙여넣기 · 끌어 놓기의 beforeinput(insertFromPaste …) — React 의 onBeforeInput 은 진짜 beforeinput 이 아니라 직접 건다
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const on = (e: InputEvent) => {
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertFromPasteAsQuotation') {
        e.preventDefault();
        setBlocked((n) => n + 1);
      }
    };
    el.addEventListener('beforeinput', on);
    return () => el.removeEventListener('beforeinput', on);
  }, []);

  const marks = typingMarks(target, text, composing ? 1 : 0);
  const chars = [...target.normalize('NFC')];
  const pct = Math.round(typingProgress(target, text) * 100);
  const hasBad = marks.includes('bad');
  // ★★ R066 (D-285 · 찬종 #49) — 웹은 한/영(IME)을 바꿀 수 없다 → 틀린 언어로 치기 시작하면 입력칸 위에 바로 한 줄
  //   마지막으로 친 글자와 그 자리의 글자가 한글/영문으로 갈리면(한글 자리에 영문 · 영문 자리에 한글/조합 중)
  const typed = [...text.normalize('NFC')];
  const lastT = typed[typed.length - 1] ?? '';
  const want = chars[typed.length - 1] ?? '';
  const isKo = (c: string) => /[ᄀ-ᇿㄱ-ㆎ가-힣]/.test(c);
  const isEn = (c: string) => /[A-Za-z]/.test(c);
  const wrongLang = practice
    ? lastT !== '' && ((lang === 'ko' && isEn(lastT)) || (lang === 'en' && isKo(lastT)))
    : canPlay && !mine && !over && lastT !== '' && ((isKo(want) && isEn(lastT)) || (isEn(want) && isKo(lastT)));

  return (
    <div className={`typing-stage${mobile ? ' m' : ''}${mine ? ' done' : ''}${practice ? ' practice' : ''}`} data-done={mine ? '1' : '0'} data-typing-practice={practice ? '1' : '0'}>
      {!practice && (
        <>
          <div className="typing-bar" aria-hidden="true">
            <span style={{ width: `${(mine ? 0 : leftRatio) * 100}%` }} />
          </div>
          <p ref={targetRef} className={`typing-target no-copy lang-${lang}`} lang={lang} aria-label="따라 칠 문장">
            {chars.map((ch, i) => (
              <span key={i} className={`tc ${marks[i]}${ch === ' ' ? ' sp' : ''}`}>
                {ch}
              </span>
            ))}
          </p>
        </>
      )}
      {wrongLang && (
        <p className="typing-lang-warn" data-typing-lang-warn role="alert">
          한/영 키를 누르세요
        </p>
      )}
      <input
        ref={inputRef}
        className={`typing-input${hasBad && !practice ? ' bad' : ''}`}
        type="text"
        lang={lang}
        value={text}
        disabled={!practice && (!canPlay || Boolean(mine) || over)}
        placeholder={view.spectating ? '구경 중' : practice ? '여기서 미리 쳐 보세요' : mobile ? '여기를 눌러 입력' : '여기에 입력'}
        data-typing-input
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="입력"
        onChange={(e) => onValue(e.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false);
          onValue((e.target as HTMLInputElement).value);
        }}
        onPaste={block}
        onDrop={block}
        onDragOver={(e) => e.preventDefault()}
        onFocus={() => {
          setNeedTap(false);
          if (mobile) window.setTimeout(keepSentenceVisible, 300);
        }}
        onKeyDown={(e) => {
          // Enter 는 아무것도 하지 않는다(채팅으로 새지 않게)
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      />
      <p className="typing-help">
        {view.spectating ? (
          '구경 중이에요'
        ) : practice ? (
          '연습 — 점수 없음 · 시작하면 비워져요'
        ) : mine ? (
          <>
            <strong className="mono">{(mine.ms / 1000).toFixed(2)}초</strong> — 다 쳤어요! 다른 사람을 기다리는 중…
          </>
        ) : over ? (
          `시간이 끝났어요 — ${pct}%`
        ) : needTap && mobile ? (
          <span className="typing-warn">입력칸을 누르세요</span>
        ) : hasBad ? (
          <span className="typing-warn">빨간 글자를 지우고 다시 치세요</span>
        ) : blocked > 0 ? (
          <span className="typing-warn">붙여넣기는 안 돼요 — 직접 치세요</span>
        ) : (
          `${pct}% · 띄어쓰기 · 마침표까지 똑같이`
        )}
      </p>
    </div>
  );
}
