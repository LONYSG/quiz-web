// =============================================================================
// ★★★ R084 — 노래 미니게임 소리 (D-341 · docs/18 §10)
//
// ★ 각 화면이 Apple 미리듣기(previewUrl · 30초 m4a)를 **하나의 <audio> 요소**로 스트리밍한다(저장 · 캐시 안 함 · 서버는 판 시작 시각만).
// ★ 자동 재생(iOS · 모바일): 사용자 조작 안에서 이 요소를 한 번 재생해야 그 뒤 곡을 코드로 틀 수 있다 →
//   (1) 아무 조작(누르기 · 키)이 있을 때 요소가 비어 있으면 무음을 한 번 재생해 연다(효과음 잠금 해제와 같은 꼴 — sound.ts installAudioUnlock)
//   (2) 그래도 막히면(NotAllowedError) 화면이 [▶ 듣기] 버튼을 보인다 — 누르면 그 자리에서 다시 튼다(같은 요소 → 그 뒤 곡은 자동)
// ★ 볼륨은 효과음 · 배경음악 설정과 **별개**(노래는 게임 내용 — 끄면 게임이 안 된다) · 기본 70% · 이 기기에 남는다.
// ★ 실패: 'error' 이벤트 · 재생 거절(막힘 말고) · 8초 안에 소리가 안 나면 'failed' → 화면이 서버에 한 번 보고한다(과반이면 그 곡 건너뜀).
// =============================================================================

import { useSyncExternalStore } from 'react';
import { SONG_VOLUME_DEFAULT } from '@quiz/shared';

export type SongStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'failed';

const VOL_KEY = 'quiz.songVolume';
const STALL_MS = 8_000;

let el: HTMLAudioElement | null = null;
let unlocked = false;
let installed = false;
/** ★ R098 — issue: 마지막 실패 까닭('error:2' · 'stall' · 'reject:NotSupportedError' …) — 재현 기록용(ui-check 가 읽는다) */
let state: { url: string | null; status: SongStatus; volume: number; unlocked: boolean; issue: string | null } = { url: null, status: 'idle', volume: readVolume(), unlocked: false, issue: null };
let stallTimer = 0;
let wantOffsetSec = 0;
/** ★ R098 — 재생 시도 번호. 앞 시도의 play() 결과(늦게 오는 AbortError 등)가 새 시도의 막힘 타이머 · 상태를 건드리지 않게 */
let playSeq = 0;
const subs = new Set<() => void>();

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    if (localStorage.getItem(VOL_KEY) !== null && Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  } catch {
    // 저장소가 막힌 창 — 기본값
  }
  return SONG_VOLUME_DEFAULT;
}

function set(patch: Partial<typeof state>): void {
  state = { ...state, ...patch };
  for (const f of subs) f();
}

/** 무음 WAV(0.05초) — 조작 안에서 요소를 열 때만 쓴다 */
let silentUrl = '';
function silent(): string {
  if (silentUrl) return silentUrl;
  const n = 400;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  w(36, 'data');
  dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  silentUrl = `data:audio/wav;base64,${btoa(bin)}`;
  return silentUrl;
}

/** 하나뿐인 요소(문서에 붙여 둔다 — ui-check 가 src 를 본다) */
export function songEl(): HTMLAudioElement {
  if (el) return el;
  el = document.createElement('audio');
  el.preload = 'auto';
  el.setAttribute('data-song-audio', '');
  el.setAttribute('playsinline', '');
  el.style.display = 'none';
  el.volume = state.volume;
  el.addEventListener('playing', () => {
    if (state.url && el?.src === state.url) {
      clearTimeout(stallTimer);
      set({ status: 'playing' });
    }
  });
  el.addEventListener('error', () => {
    if (state.url && el?.getAttribute('src') === state.url) fail(`error:${el?.error?.code ?? '?'}`);
  });
  el.addEventListener('loadedmetadata', () => {
    if (!el || !state.url || el.getAttribute('src') !== state.url) return;
    if (wantOffsetSec > 0.5 && Number.isFinite(el.duration) && wantOffsetSec < el.duration) {
      try {
        el.currentTime = wantOffsetSec;
      } catch {
        // 못 옮기면 처음부터
      }
    }
  });
  document.body.appendChild(el);
  return el;
}

function fail(issue: string): void {
  clearTimeout(stallTimer);
  set({ status: 'failed', issue });
}

/** ★ 조작 안에서 부른다 — 요소를 연다(비어 있을 때만 무음 · 곡이 걸려 있으면 그 곡을 다시 튼다) */
export function unlockSongAudio(): void {
  const a = songEl();
  if (state.url) {
    void startPlay(a);
    return;
  }
  if (unlocked) return;
  a.src = silent();
  const p = a.play();
  void p?.then(
    () => {
      unlocked = true;
      set({ unlocked: true });
      if (!state.url) a.pause();
    },
    () => undefined,
  );
}

/** 아무 조작에서나 연다(한 번 열리면 그만) — 노래 미니게임 화면이 처음 붙을 때 설치 */
export function installSongUnlock(): void {
  if (installed) return;
  installed = true;
  // ★ 막힌 곡(blocked)도 — 입력칸에 치거나 어디를 누르면 그 조작 안에서 다시 튼다(버튼을 못 본 사람도 소리가 난다)
  const wake = () => {
    if ((!unlocked && !state.url) || state.status === 'blocked') unlockSongAudio();
  };
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown'] as const) window.addEventListener(ev, wake, { capture: true, passive: true });
}

function startPlay(a: HTMLAudioElement): Promise<void> {
  clearTimeout(stallTimer);
  const seq = ++playSeq;
  set({ status: 'loading' });
  stallTimer = window.setTimeout(() => {
    if (seq === playSeq && state.status === 'loading') fail('stall');
  }, STALL_MS);
  const p = a.play();
  if (!p) return Promise.resolve();
  return p.then(
    () => {
      unlocked = true;
      if (!state.unlocked) set({ unlocked: true });
    },
    (err: unknown) => {
      // ★ R098 — 앞 시도의 늦은 거절은 무시한다(옛 코드는 여기서 새 시도의 막힘 타이머까지 지웠다 → 'loading' 에 영영 머묾 · 보고도 없음)
      if (seq !== playSeq) return;
      clearTimeout(stallTimer);
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') set({ status: 'blocked', issue: 'reject:NotAllowedError' });
      else if (name !== 'AbortError') fail(`reject:${name ?? '?'}`);
    },
  );
}

/**
 * ★★ R098 — [▶ 듣기] 버튼(조작 안에서 부른다). 옛 버튼은 unlockSongAudio() 만 불러
 *   ① 곡이 안 걸려 있으면(idle — url 없음) 무음만 틀고 끝났고 ② 실패한 요소(error)에 play() 만 다시 걸어 곧장 또 거절됐고
 *   → 둘 다 "눌러도 안 남". 이제: 이 곡을 걸고(없으면) · 실패했으면 다시 불러오고(load) · 판에서 흐른 초로 옮겨 본 뒤 튼다.
 *   ★ 남은 것: 막혔다 늦게 누르면 여전히 곡 처음(0초)부터 나온다(R098 실측 — 옮기기가 안 먹음 · 원인 미확인 · 13-PENDING).
 */
export function retrySong(url: string, offsetSec = 0): void {
  const a = songEl();
  wantOffsetSec = offsetSec;
  if (a.getAttribute('src') !== url) {
    a.src = url;
    set({ url, issue: null });
  } else {
    if (state.url !== url) set({ url });
    if (a.error || state.status === 'failed') {
      a.load();
      set({ issue: null });
    } else if (a.readyState >= 1 && Number.isFinite(a.duration) && offsetSec < a.duration && Math.abs(a.currentTime - offsetSec) > 1.5) {
      try {
        a.currentTime = offsetSec;
      } catch {
        // 못 옮기면 그 자리에서
      }
    }
  }
  void startPlay(a);
}

/** 곡 틀기 — offsetSec = 판 시작부터 흐른 초(늦게 들어온 사람은 그 자리부터) */
export function playSong(url: string, offsetSec = 0): void {
  const a = songEl();
  if (state.url === url && (state.status === 'playing' || state.status === 'loading' || state.status === 'failed')) return;
  wantOffsetSec = offsetSec;
  if (a.getAttribute('src') !== url) {
    a.src = url;
    set({ url, issue: null });
  } else if (state.url !== url) set({ url });
  void startPlay(a);
}

/** 멈춤(준비 · 최종 · 나감) */
export function stopSong(): void {
  clearTimeout(stallTimer);
  playSeq += 1;
  if (el) {
    el.pause();
    if (state.url) {
      el.removeAttribute('src');
      el.load();
    }
  }
  if (state.url || state.status !== 'idle') set({ url: null, status: 'idle' });
}

export function setSongVolume(v: number): void {
  const x = Math.max(0, Math.min(1, v));
  if (el) el.volume = x;
  try {
    localStorage.setItem(VOL_KEY, String(x));
  } catch {
    // 저장 못 해도 지금 판은 바뀐다
  }
  set({ volume: x });
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
export function useSongAudio() {
  return useSyncExternalStore(subscribe, () => state);
}
