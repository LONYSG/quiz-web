// =============================================================================
// ★★★ 질문 · 힌트 복사 막기 (R050 · D-232 — 찬종: "부정행위 방지를 위해 문제 부분 긁어서 복사하는거 방지하자 …
//   모바일에서도 질문 부분을 꾹 눌러서 복사하지 못하게 하고 웹에서도 마찬가지야. 다른 부분은 복사 붙여넣기 해도 상관없어." → "힌트까지 막자.")
//
// ★ 대상: `.no-copy` 를 붙인 영역만 — 문제 지문(QuestionText) · 힌트 두 칸(일반 · 초성). 채팅 · 해설 · 정답 공개 · 다른 곳은 그대로.
// ★ 방법 (겹쳐서):
//   1. CSS — user-select:none · -webkit-user-select:none · -webkit-touch-callout:none (모바일 꾹 누름 메뉴 · 선택 핸들)
//   2. 그 영역 안의 copy · cut · contextmenu · dragstart · selectstart 를 막는다
//   3. ★ 문서 전체 복사(Ctrl+A → Ctrl+C 처럼 선택이 그 영역을 **가로지를 때**) — 복사되는 글에서 그 영역만 뺀다(나머지는 그대로 복사)
// ★ 한계(01 9장): 화면 캡처 · 사진 · OCR · 개발자 도구는 막을 수 없다. "긁어서 붙여 넣기" 를 막는 것이 목적이다.
// =============================================================================

const BLOCKED = ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'] as const;

function inNoCopy(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(el?.closest('.no-copy'));
}

/** 선택 범위가 .no-copy 를 하나라도 품는가 */
function selectionTouchesNoCopy(sel: Selection): boolean {
  if (sel.rangeCount === 0 || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i += 1) {
    const r = sel.getRangeAt(i);
    if (inNoCopy(r.startContainer) || inNoCopy(r.endContainer)) return true;
    for (const el of document.querySelectorAll('.no-copy')) if (r.intersectsNode(el)) return true;
  }
  return false;
}

/** 선택을 글로 — .no-copy 는 뺀다 */
function textWithout(sel: Selection): string {
  const parts: string[] = [];
  for (let i = 0; i < sel.rangeCount; i += 1) {
    const frag = sel.getRangeAt(i).cloneContents();
    for (const el of frag.querySelectorAll('.no-copy')) el.remove();
    const box = document.createElement('div');
    box.appendChild(frag);
    parts.push(box.innerText ?? box.textContent ?? '');
  }
  return parts.join('\n').trim();
}

export function installNoCopy(): void {
  for (const type of BLOCKED) {
    document.addEventListener(
      type,
      (e) => {
        if (inNoCopy(e.target)) {
          e.preventDefault();
          return;
        }
        if (type !== 'copy' && type !== 'cut') return;
        const sel = document.getSelection();
        if (!sel || !selectionTouchesNoCopy(sel)) return;
        // ★ 가로지르는 선택 — 그 영역만 빼고 복사한다
        const ce = e as ClipboardEvent;
        if (!ce.clipboardData) {
          e.preventDefault();
          return;
        }
        ce.clipboardData.setData('text/plain', textWithout(sel));
        e.preventDefault();
      },
      true,
    );
  }
}
