// =============================================================================
// ★ 화면·소리 설정을 계정에 저장한다 (R034 / 건우 요청)
//
// ★ 로그인 전 — 지금처럼 브라우저(localStorage)에만 남는다.
// ★ 로그인하면 — 계정에 저장된 값을 불러와 적용한다.
//   ★ 계정에 아직 아무것도 없으면(처음) 이 브라우저의 값을 계정에 올린다.
// ★ 로그인한 동안 바꾸면 — 브라우저에 남기고(기존 그대로) 계정에도 저장한다 (0.6초 모아서 한 번).
// =============================================================================

import { fetchPrefs, savePrefs, type ServerPrefs } from './api.js';
import { BGMS, getSoundPrefs, setSoundPrefs, type BgmId } from './sound.js';
import { getTheme, setTheme, THEMES, type ThemeId } from './theme.js';
import { getStoredSlots, setStoredSlots } from './emojiCatalog.js';

let signedIn = false;
/** 계정 값을 적용하는 동안에는 다시 저장하지 않는다 (되먹임 방지) */
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function current(): ServerPrefs {
  const s = getSoundPrefs();
  return {
    theme: getTheme(),
    bgmOn: s.bgmOn,
    bgmTrack: s.bgm,
    bgmVolume: s.bgmVol,
    sfxOn: s.sfxOn,
    sfxVolume: s.sfxVol,
    chatOn: s.chatOn,
    chatVolume: s.chatVol,
    ...(getStoredSlots() ? { emojiSlots: getStoredSlots()! } : {}),
  };
}

function scheduleSave(): void {
  if (!signedIn || applying) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (signedIn) void savePrefs(current()).catch(() => undefined);
  }, 600);
}

function apply(p: ServerPrefs): void {
  applying = true;
  try {
    if (THEMES.some((t) => t.id === p.theme)) setTheme(p.theme as ThemeId);
    const patch: Parameters<typeof setSoundPrefs>[0] = {};
    if (typeof p.bgmOn === 'boolean') patch.bgmOn = p.bgmOn;
    if (BGMS.some((b) => b.id === p.bgmTrack)) patch.bgm = p.bgmTrack as BgmId;
    if (typeof p.bgmVolume === 'number') patch.bgmVol = p.bgmVolume;
    if (typeof p.sfxOn === 'boolean') patch.sfxOn = p.sfxOn;
    if (typeof p.sfxVolume === 'number') patch.sfxVol = p.sfxVolume;
    if (typeof p.chatOn === 'boolean') patch.chatOn = p.chatOn;
    if (typeof p.chatVolume === 'number') patch.chatVol = p.chatVolume;
    if (Array.isArray(p.emojiSlots)) setStoredSlots(p.emojiSlots);
    if (Object.keys(patch).length > 0) setSoundPrefs(patch);
  } finally {
    applying = false;
  }
}

/** main.tsx 에서 한 번. 테마·소리가 바뀔 때마다 (로그인 중이면) 계정에 저장한다 */
export function installPrefsSync(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('qw:theme', scheduleSave);
  window.addEventListener('qw:sound', scheduleSave);
  window.addEventListener('qw:emoji-slots', scheduleSave);
}

/** 로그인 확인 직후 부른다. 로그아웃하면 onSignedOut */
export async function onSignedIn(): Promise<void> {
  signedIn = true;
  try {
    const saved = await fetchPrefs();
    if (!signedIn) return;
    if (saved && Object.keys(saved).length > 0) apply(saved);
    else void savePrefs(current()).catch(() => undefined);
  } catch {
    /* 불러오지 못해도 브라우저 값으로 계속한다 */
  }
}

export function onSignedOut(): void {
  signedIn = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
