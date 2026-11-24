// 조각 만들기 — 설계 창이 돌린다(node web-desk/vstory/_make.mjs). 후보 = vstock 결과에서 실마리를 가져온다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const D = 'C:/work/quiz-web/web-desk/';
const stock = new Map();
for (const f of readdirSync(D + 'vstock/받은것')) { try { for (const it of JSON.parse(readFileSync(D + 'vstock/받은것/' + f, 'utf8')).items) stock.set(it.answer, it); } catch {} }
const CH = [
  ['청바지', '벨크로', '코브라 효과', '창백한 푸른 점'],
  ['감자칩', '실루엣', '고별 교향곡', '3점식 안전벨트'],
  ['젠가', '모노폴리', '울트라마린', '줄리메컵'],
  ['QR코드', '캡차', '택시 수', '웜뱃'],
  ['셜록 홈스', '스페이스 펜', '전기수', '픽토그램'],
  ['청진기', '메트로놈', '다모클레스의 검', '환상지통'],
  ['호돌이', '정화', '페트리코', '크라바트'],
];
const miss = [];
CH.forEach((c, i) => {
  const no = String(i + 1).padStart(2, '0');
  let t = `조각 ${no} — 정답 넷의 해설 소재를 찾는다(지시서대로 · chunk = "${no}")\n\n`;
  c.forEach((a, k) => { const s = stock.get(a); if (!s) miss.push(a);
    t += `[${'abcd'[k]}] 정답: ${a}\n주제: ${s?.topic ?? ''} · 난이도 ${s?.difficulty ?? ''}\n질문(참고): ${s?.question ?? ''}\n실마리(전에 찾아 둔 짧은 이야기 — 출발점일 뿐이다 · 문서로 다시 확인할 것):\n${s?.explanation ?? '(없음)'}\n\n`; });
  writeFileSync(D + `vstory/보낼것/조각-${no}.txt`, t);
  const r = D + `vstory/받은것/결과-${no}.json`; if (!existsSync(r)) writeFileSync(r, '');
});
console.log('조각', CH.length, '· 실마리 없는 정답:', miss.join(' · ') || '없음');
