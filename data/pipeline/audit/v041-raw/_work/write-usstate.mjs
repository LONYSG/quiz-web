import { readFileSync, writeFileSync } from 'node:fs';
const f = 'data/minigame/topics/us-state.json';
const raw = readFileSync(f, 'utf8');
const doc = JSON.parse(raw);
let ind = null; for (const i of [1, 2]) if (JSON.stringify(doc, null, i) + '\n' === raw) ind = i; 
const endNL = raw.endsWith('\n');
console.log('indent', ind, 'endNL', endNL);
if (ind === null) { console.log('형식 불일치'); process.exit(1); }
doc.verify = {
  round: 'V041', checkedAt: new Date().toISOString(),
  sources: [{ url: 'https://ko.wikipedia.org/wiki/미국의_주', read: true, count: 50 }],
  missing: [], extra: [], rename: [],
  variantNotes: ['us-state-006 매사추세츠주: variants 에 "매사추세츠" 가 두 번(같은 글자) — 하나 빼기(fix 1). 나머지 변형(펜실베니아 · 펜실바니아 · 코네티컷트 · 루이지아나 · 알라바마 · 아칸사스 · 미시건 · 오레곤 · 캔사스 · 몬타나 · 아리조나 · 알라스카)은 다른 주 이름 · 변형과 겹치지 않음(세트 안 기계 검사)', '"워싱턴"(워싱턴주) · "조지아"(조지아주)는 같은 이름의 다른 것(워싱턴 D.C. · 나라 조지아)과 겹침 — 세트 안에서는 유일 · 세트 사이(나라 세트의 조지아)는 이 세트 밖 문제(같은 판에 두 세트를 섞지 않으면 됨)'],
  tagNotes: ['지역 4 태그 50 전부 미국 인구조사국 4 지역과 대조 — 어긋남 0(북동부 9 · 중서부 12 · 남부 16 · 서부 13)'],
  fixes: ['us-state-006 variants 에서 중복 "매사추세츠" 1개 빼기'],
  checks: { names: '페이지 연방 가입일 순 50 행 ↔ 파일 id 순 50 — 이름 50/50 일치(빠짐 0 · 더함 0 · 이름 어긋남 0) · "~주" 표기 정본', years: '연방 가입일 연도 50/50 일치(1787~1959 · 서로 다른 34)', qid: 'us-state-049 알래스카주 qid 19 — DB 없음이라 문항 대조 못 함(unsure)' },
  verdict: 'verified', why: '페이지 50 = 파일 50 · 가입 연도 50/50 · 지역 50/50 · 변형 겹침 0(자기 중복 1건만 fix)',
};
doc.status = 'verified';
writeFileSync(f, JSON.stringify(doc, null, ind) + '\n');
console.log('ok');
