// 조각 만들기 v2 — 설계 창이 돌린다(node web-desk/vstory/_make2.mjs). 2026-11-25 · 지시서 v2(세 꼴) · 조각 13 부터.
// 후보 = vstock 결과 가운데 아직 조사 안 한 것 + 다시 볼 것(신호등 · 셜록 홈스 · 감칠맛 미원). 실마리 = vstock 해설.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const D = 'C:/work/quiz-web/web-desk/';
const stock = new Map();
for (const f of readdirSync(D + 'vstock/받은것')) { try { for (const it of JSON.parse(readFileSync(D + 'vstock/받은것/' + f, 'utf8')).items) stock.set(it.answer, it); } catch {} }
// [정답, 이번에 볼 쪽(없으면 '')]
const CH = [
  [['신호등', '★ 다시 봄: 폭발 사건이 아니라 "오늘날의 신호등이 어떻게 생겨나 어떻게 정착했나"(인과 — 왜 필요해졌고 · 누가 무엇을 바꿨고 · 어떻게 지금 꼴이 됐나)'], ['셜록 홈스', '★ 다시 봄: 연재 복귀가 아니라 "코난 도일이 셜록 홈스를 어떻게 쓰게 됐나"(탄생 배경 — 코난 도일이 누구였고 · 무엇에서 홈스를 떠올렸나)'], ['감칠맛', '★ 한 가지만: 아지노모토가 한국의 미원으로 이어졌다는 이야기(미원이 누가 언제 왜 만든 것인지 · 아지노모토와의 관계)를 받칠 문서. 다른 조사는 하지 않는다'], ['러버덕 디버깅', '']],
  [['상표의 보통명사화', ''], ['노시보 효과', ''], ['바넘 효과', ''], ['플라시보 효과', '']],
  [['마그누스 효과', ''], ['데우스 엑스 마키나', ''], ['세이버메트릭스', ''], ['도플러 효과', '']],
  [['조건 반사', ''], ['도로표지병', ''], ['해트트릭', ''], ['앙파상', '']],
  [['스윙바이', ''], ['피보나치 수열', ''], ['현수선', ''], ['플로지스톤', '']],
  [['바코드', ''], ['이모지', ''], ['앰퍼샌드', ''], ['에펠탑', '']],
  [['카메라 옵스큐라', ''], ['엘리제를 위하여', ''], ['트로이 목마', ''], ['판도라의 상자', '']],
  [['더플코트', ''], ['사이영상', ''], ['완보동물', ''], ['노시보', '']].slice(0, 3).concat([['미모사', '']]),
];
const miss = [];
CH.forEach((c, i) => {
  const no = String(i + 13).padStart(2, '0');
  let t = `조각 ${no} — 정답 넷의 해설 소재를 찾는다(지시서 v2 대로 · 1-1 의 세 꼴부터 · chunk = "${no}")\n\n`;
  c.forEach(([a, look], k) => {
    const s = stock.get(a); if (!s && !look) miss.push(a);
    t += `[${'abcd'[k]}] 정답: ${a}\n주제: ${s?.topic ?? ''} · 난이도 ${s?.difficulty ?? ''}\n질문(참고): ${s?.question ?? ''}\n`;
    if (look) t += `이번에 볼 쪽: ${look}\n`;
    t += `실마리(전에 찾아 둔 짧은 이야기 — 출발점일 뿐이다 · 문서로 다시 확인할 것):\n${s?.explanation ?? '(없음)'}\n\n`;
  });
  writeFileSync(D + `vstory/보낼것/조각-${no}.txt`, t);
  const r = D + `vstory/받은것/결과-${no}.json`; if (!existsSync(r)) writeFileSync(r, '');
});
console.log('조각 13 ~', 12 + CH.length, '· 실마리 없는 정답:', miss.join(' · ') || '없음');
