// C — g037-decisions.json: 문항당 결정 하나(Q 질문 127 · H 힌트 · V 변형 · F 사실 · C crossans 54 · K 분야는 별도)
import { rj, wj, withDb, ROWSQL } from './db.mjs';
const P = rj('g037-plan.json'); const G = rj('g037-raw/gen-edits.json'); const C54 = rj('g037-raw/c54-check.json');
const NOT = {
  variants: [
    [3184, '가스라이트', '다른 낱말 — 1944년 영화 제목(정답은 심리 조종을 이르는 말)'], [3838, 'The Beatles', '라틴 거부(G034 게이트)'], [223, 'Queen', '라틴 거부'],
    [7119, 'prequel', '라틴 거부'], [6888, 'meme', '라틴 거부'], [7161, 'Air Force One', '라틴 거부'], [3599, '@ · 앳 · 앳마크', '특수문자 · 질문이 "흔히 부르는" 별명을 묻는다'],
    [6985, '한 평', '단위 이름은 평'], [1761, '그믐날', '어느 달에나 있는 날 — 한 해의 마지막 날이 아님'], [7454, '게티즈버그 · 게티스버그', '땅 이름만 — 연설이 아님'],
    [3925, '똠얌', '국물 갈래 이름 — 질문은 새우(꿍)까지 든 이름을 묻는다'], [6909, '탄소발자국 지수', '다른 말'],
    [523, '매직 아이', '정규화로 이미 같음'], [895, '자동 심장 충격기', '정규화로 이미 같음'], [6915, '월 스트리트', '정규화로 이미 같음'], [1150, '성화봉송', '정규화로 이미 같음'],
    [6976, '교통 방송', '정규화로 이미 같음'], [7129, '북방 한계선', '정규화로 이미 같음'], [4231, '전기 뱀장어', '정규화로 이미 같음'], [7161, '에어포스원', '정규화로 이미 같음'],
    [6909, '탄소 발자국', '정규화로 이미 같음'], [6885, '블루 스크린', '정규화로 이미 같음'], [3045, '로마숫자', '정규화로 이미 같음'], [7261, '그린수소 · 녹색수소', '정규화로 이미 같음'],
    [7439, '오이스터소스', '정규화로 이미 같음'], [7009, '플라토닉러브', '정규화로 이미 같음'], [7271, '-', 'VERIFY 도 이상 없음'], [7115, '-', 'VERIFY 도 이상 없음'], [2162, '아연도금', '정규화로 이미 같음(아연 도금 있음)'],
    [673, '돌고 있는 차', '게이트 막힘 — 질문에 그대로 든 말(고르기 꼴 질문)'],
  ],
  unique: [[2215, '그대로 — 변형 입증 · 증명하기가 받음 · 증거는 다른 말'], [2162, '그대로 — 변형 아연 도금 · 용융 아연 도금'], [2219, '그대로 — 인용 분량이 문제 되는 권리는 저작권(복제권은 그 일부)'], [6987, '그대로 — 375그램 단서가 관과 가름'], [7280, '그대로 — 변형 색각 이상 · 적록색맹이 받음 · 색약은 다른 증상(돌턴은 2색각)']],
  flags: [[6917, 'hint_leak(경미) — 질문 쪽 비유 · 힌트 아님 · 그대로'], [7193, 'category — 그대로: 중분류 농구·배구·기타 구기 안에 맞는 소분류가 없고 배구 규칙에서 나옴'], [702, 'dup_answer 3960 — 둘 다 둔다(같은 판에 둘 막기는 코드 몫)'], [7058, 'explanation — 해설이 관행 이야기지만 틀리지 않음 · 그대로'], [6988, 'worth — 알가치 안 바꿈(브리프)'], [3838, 'h12 — 7066 힌트를 고침'], [6827, 'F true — 아르테미스 2호 2026-04-01 발사 · 04-10 귀환(승무원 4)'], [7280, 'F true — 프랑스어 daltonisme · 스페인어 daltonismo'], [7309, 'F 그대로 — 질문의 1900년 무렵 · 서양 옷 단서가 마고자와 가름'], [7104, 'F 그대로 — 해설(노견 비표준어)과 변형(노견 받음)은 어긋나지 않음'], [7431, 'F — 마커스 로는 fix 가 이미 뺌'], [7221, 'F — 거짓말 탐지기 문장은 fix 가 이미 뺌']],
};
const items = {}; const take = C54.filter((x) => x.take);
const ids = new Set([...P.Q.map((q) => q.id), ...Object.keys(G.q), ...Object.keys(G.h), ...Object.keys(G.e), ...Object.keys(G.a), ...Object.keys(G.v), ...take.map((x) => String(x.id))]);
await withDb(async (c) => {
  const rows = new Map((await c.query(ROWSQL, [[...ids].map(Number)])).rows.map((r) => [r.id, r]));
  const Q = new Map(P.Q.map((q) => [q.id, q]));
  for (const id of [...ids].sort((a, b) => a - b)) {
    const r = rows.get(id); const why = []; const cv = new Set();
    const d = { id: Number(id), before: { question_text: r.question_text, general_hint: r.general_hint, explanation: r.explanation, display_answer: r.display_answer, variants: r.variants } };
    let step = null;
    if (Q.has(id)) { step = 'Q'; cv.add('CV-161'); d.question_text = G.q[id]?.[0] ?? Q.get(id).fix_text; why.push(G.q[id] ? `V038 fix_text GEN 손질 — ${G.q[id][1]}` : 'V038 fix_text 그대로'); }
    else if (G.q[id]) { step = 'F'; cv.add('CV-161'); d.question_text = G.q[id][0]; why.push(G.q[id][1]); }
    if (G.h[id]) { step ??= 'H'; cv.add('CV-161'); d.general_hint = G.h[id][0]; why.push('힌트 ' + G.h[id][1]); }
    const t = take.find((x) => String(x.id) === id);
    if (t) { step ??= 'C'; cv.add('CV-162'); d.general_hint = t.proposal; why.push(`crossans ${t.cls === 'L' ? '누설' : '덧붙임'} ${t.cross} — V038 제안 그대로`); }
    if (G.e[id]) { step ??= 'F'; d.explanation = G.e[id][0]; why.push('해설 ' + G.e[id][1]); }
    if (G.a[id]) { step ??= 'V'; d.display_answer = G.a[id][0]; why.push('정답 ' + G.a[id][1]); }
    if (G.v[id]) { step ??= 'V'; cv.add('CV-161'); if (G.v[id].add) d.add = G.v[id].add; if (G.v[id].remove) d.remove = G.v[id].remove; why.push(`변형 +${(G.v[id].add ?? []).join('·')}${G.v[id].remove ? ' −' + G.v[id].remove.join('·') : ''}`); }
    if (!cv.size) cv.add('CV-161');
    d.step = step; d.cv = [...cv].join('·'); d.why = why.join(' · ');
    items[id] = d;
  }
  const cnt = {}; for (const d of Object.values(items)) cnt[d.step] = (cnt[d.step] ?? 0) + 1;
  wj('g037-decisions.json', { round: 'G037', at: new Date().toISOString(), source: 'g037-plan.json · g037-raw/gen-edits.json · g037-raw/c54-check.json', counts: cnt, category: G.k,
    notTaken: { crossans: C54.filter((x) => !x.take).map((x) => ({ id: x.id, cls: x.cls, cross: x.cross, why: `제안문이 새 crossans 를 들임 — ${x.newCross.join(' · ')}`, proposal: x.proposal })), ...NOT }, items });
  console.log(cnt, Object.keys(items).length);
});
