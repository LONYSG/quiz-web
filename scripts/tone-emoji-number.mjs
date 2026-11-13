#!/usr/bin/env node
// G065 F — 이모지 숫자 손질(한 번만): 제목의 숫자를 숫자 이모지로 옮긴 줄 → 상징 장면 · 소품 줄로 / 못 모이면 비활성(emoji-number)
//   찬종 2026-11-13 · web-desk/emoji/지시서.md §2 ★v2.1 · 같은 분야 활성 줄과 겹침은 GEN 이 눈으로 대조(보고서 0절)
//   쓰는 파일 data/pipeline/tone/emoji-number-fix.json (before = 지금 DB · tone-build.mjs --round g065 가 적용 json 에 합친다)
//   사용 node scripts/tone-emoji-number.mjs   (DB 읽기만 · 파일이 이미 있으면 멈춤)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const OUT = path.join(ROOT, 'data/pipeline/tone/emoji-number-fix.json');
if (existsSync(OUT)) { console.log('emoji-number-fix.json 있음 — 건너뜀'); process.exit(0); }
// 새 줄(이모지 · 이모지 설명) — 질문 꼴 "<줄> — 이모지가 나타내는 …은?" 의 앞부분만 바꾼다
const NEW = {
  8065: ['🛡️🦶🕳️🏹🌑', '방패 · 발차기 · 깊은 구덩이 · 화살 · 해를 가린 어둠'],
  8002: ['🔺🪑👯🗳️', '피라미드 모양 계단 의자 · 연습생들 · 국민 투표'],
  7857: ['⛓️👨👧🎒🎈', '교도소 · 아빠 · 딸 · 세일러문 가방 · 담을 넘는 풍선'],
  7991: ['🎲🐟☕⛺🚐', '복불복 · 까나리카노(까나리 액젓 + 커피) · 야외 취침 · 여행 버스'],
  7786: ['🔐🗣️❤️😄💋', '비밀번호 · 사랑한다는 말 · 웃음 · 입맞춤(하루에 말하고 웃고 입 맞추는 횟수가 비밀번호)'],
  7765: ['🚬💨🌇🎸👋', '담배 연기 · 흩어짐 · 저무는 하루 · 기타 · 멀어져 감'],
  7778: ['⏱️💄😏👨💘', '초시계 · 립스틱 · 자신만만한 표정 · 남자 · 반함(정해진 시간 안에 사로잡기)'],
  7995: ['🏡🪵🔥🍚🐐', '시골집 · 장작 · 아궁이 불 · 밥 · 염소'],
  7744: ['👴⛰️🤕🔁😊', '할아버지 · 고개 · 넘어짐 · 자꾸 더 구름 · 기뻐함'],
  7687: ['👶👍👄🔁👴', '아기 · 엄지 · 입(손가락 빠는 버릇) · 계속 · 노인'],
  7663: ['🍼🐶😤🐅', '젖병 · 어린 강아지 · 겁 없이 덤빔 · 호랑이'],
};
const OFF = { 7782: '8282 — 제목이 숫자뿐 · 가사("빨리빨리 전화해")로는 이 노래 하나로 안 모임', 7783: '1,2,3,4 — 제목이 숫자뿐 · 가사로 만들 장면 없음', 7814: 'Eleven — 제목이 숫자뿐 · 가사로 만들 장면 없음' };
const KEEP = [7485, 7513, 7858, 7750, 7714];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const ids = [...Object.keys(NEW), ...Object.keys(OFF)].map(Number);
const rows = Object.fromEntries((await c.query('select id::int, is_active, inactive_reason, question_text, display_answer, explanation from questions where id = any($1)', [ids])).rows.map((r) => [r.id, r]));
await c.end();
const items = []; const deactivate = [];
for (const [id, [line, why]] of Object.entries(NEW)) {
  const d = rows[id]; if (!d?.is_active) throw new Error(`${id} 없음 · 비활성`);
  const m = d.question_text.match(/^(\S+) — (이모지가 나타내는 .+)$/); if (!m) throw new Error(`${id} 질문 꼴 다름: ${d.question_text}`);
  if (/[0-9]️?⃣|🔟/u.test(line)) throw new Error(`${id} 새 줄에 숫자 이모지`);
  items.push({ id: Number(id), answer: d.display_answer, src: 'emoji-number G065', question_text: { before: d.question_text, after: `${line} — ${m[2]}`, kind: 'emoji' }, explanation: { before: d.explanation, after: `이모지: ${why}`, kind: 'emoji' } });
}
for (const [id, why] of Object.entries(OFF)) {
  const d = rows[id]; if (!d?.is_active) throw new Error(`${id} 없음 · 비활성`);
  deactivate.push({ id: Number(id), answer: d.display_answer, name: d.question_text, why, deactivate: 'emoji-number', before: { is_active: d.is_active, inactive_reason: d.inactive_reason } });
}
writeFileSync(OUT, JSON.stringify({ round: 'G065', note: '찬종 2026-11-13 — 제목의 숫자를 숫자 이모지로 옮긴 줄 손질 · 그대로 두는 것(내용의 숫자): ' + KEEP.join(' '), items, deactivate, keep: KEEP }, null, 1) + '\n');
console.log('emoji-number-fix.json — 다시 쓴 줄', items.length, '· 비활성', deactivate.length);
