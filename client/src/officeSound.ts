// ★ R074 (D-322 ②) — 사무실 모드 소리: 판단만(창 · 소리 모듈 없음 — 단위 테스트가 이 파일을 본다)
interface SoundBits {
  bgmOn: boolean;
  sfxOn: boolean;
  chatOn: boolean;
}
const SOUND_KEY = 'qw.office.sound.v1';
type SavedSound = SoundBits;

/** 사무실로 들어갈 때 — 소리 셋을 기억해 두고 끈다(이미 기억이 있으면 그대로 · 다시 들어와도 사용자가 켠 값을 덮지 않는다) */
export function enterOfficeSound(store: Pick<Storage, 'getItem' | 'setItem'>, get: () => SavedSound, set: (p: Partial<SoundBits>) => unknown): boolean {
  if (store.getItem(SOUND_KEY)) return false;
  const s = get();
  store.setItem(SOUND_KEY, JSON.stringify({ bgmOn: s.bgmOn, sfxOn: s.sfxOn, chatOn: s.chatOn }));
  set({ bgmOn: false, sfxOn: false, chatOn: false });
  return s.bgmOn || s.sfxOn || s.chatOn;
}
/** 사무실에서 나갈 때 — 기억한 값으로 되돌린다 */
export function leaveOfficeSound(store: Pick<Storage, 'getItem' | 'removeItem'>, set: (p: Partial<SoundBits>) => unknown): boolean {
  const raw = store.getItem(SOUND_KEY);
  store.removeItem(SOUND_KEY);
  if (!raw) return false;
  try {
    const v = JSON.parse(raw) as Partial<SavedSound>;
    const patch: Partial<SoundBits> = {};
    if (typeof v.bgmOn === 'boolean') patch.bgmOn = v.bgmOn;
    if (typeof v.sfxOn === 'boolean') patch.sfxOn = v.sfxOn;
    if (typeof v.chatOn === 'boolean') patch.chatOn = v.chatOn;
    set(patch);
    return true;
  } catch {
    return false;
  }
}

