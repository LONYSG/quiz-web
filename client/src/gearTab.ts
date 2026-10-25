// =============================================================================
// ★★ R067 (D-300 · A91 "위 막대 모으기") — PC 방 위 막대의 ⚙ 창 탭(설정 · 안내 · 제보)
//
// ★ ⚙ 창은 Prefs(variant gear · tabs) 가 그린다 — 팝업 id 는 그대로 'prefs'(한 번에 하나 규칙 · 모바일 ☰ 의 "설정" 도 같은 창).
// ★ Alt+B(AppReport) 는 PC 방 안이면 ⚙ 의 제보 탭을 연다 · 방 밖 · 모바일은 옛 제보 창 그대로.
// =============================================================================

import { useSyncExternalStore } from 'react';
import { openPopup } from './popup.js';

export type GearTab = 'settings' | 'info' | 'report';

let tab: GearTab = 'settings';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getGearTab(): GearTab {
  return tab;
}
export function setGearTab(t: GearTab): void {
  if (tab === t) return;
  tab = t;
  emit();
}
export function useGearTab(): GearTab {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tab,
  );
}
/** ⚙ 창을 이 탭으로 연다 */
export function openGear(t: GearTab): void {
  setGearTab(t);
  openPopup('prefs');
}
/** PC 방 안 위 막대에 ⚙(탭 셋)가 있나 */
export function gearHasTabs(): boolean {
  return !document.documentElement.classList.contains('ui-mobile') && document.querySelector('.room-tools .prefs.gear.gear-tabbed') !== null;
}
