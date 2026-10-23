// =============================================================================
// ★★ R065 (D-271) — 제보 창이 열려 있으면 게임이 방해하지 않는다 (찬종: "제보 중에 미니게임 실행되면 제보 글 못 쓰게 막던데(커서가 이동) … 글 좀 쓰게 내비둬")
//
// ★ isReportOpen() — ReportHost 가 그릴 때 적는다(메뉴 · 목록 · 일반 · 문항 창 어느 것이든)
// ★ typingTarget(e) — 전역 keydown(미니게임 Space · 방향키 · 숫자 · 이모티콘 · Alt 단축키)이 키를 가져가면 안 되는 때:
//   제보 창이 열림 · 글칸(input · textarea · contenteditable)에 치는 중.
//   ★ 단 방 채팅칸(data-chat-input)은 뺀다 — "채팅 입력 중이어도 미니게임이 먼저"(CakeWait 등)는 그대로.
// =============================================================================

let open = false;

export function setReportOpen(v: boolean) {
  open = v;
}

export const isReportOpen = () => open;

export function typingTarget(e: KeyboardEvent): boolean {
  if (open) return true;
  const t = e.target as HTMLElement | null;
  if (!t || typeof t.closest !== 'function') return false;
  if (t.hasAttribute('data-chat-input')) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}
