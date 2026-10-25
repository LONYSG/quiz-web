import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const M = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/merged.json', 'utf8')).res;
const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
const rows = [];
for (const [id, r] of Object.entries(M)) { const t = T[id]; const s = t.human.ser; if (!s.n) continue; const ms = s.msList; rows.push({ id, v2: r.v2, cur: t.curDif, tags: r.tags || [], n: s.n, solved: s.solved, pre: ms.filter((x) => x < 10000).length, h1: ms.filter((x) => x >= 10000 && x < 25000).length, ch: ms.filter((x) => x >= 25000).length, rooms: s.rooms, gt: t.gameTopic, cat: t.category, conf: r.conf, read: r.read.grade }); }
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const tbl = (key, vals, label) => { console.log(`\n== ${label}`); console.log('grp | items | exp | 누군가맞힘 | 힌트전 | 일반힌트뒤 | 초성뒤 | 못맞힘 | 평균방'); for (const v of vals) { const g = rows.filter((r) => key(r) === v); const e = sum(g, (r) => r.n); if (!e) continue; const f = (x) => (100 * x / e).toFixed(0) + '%'; console.log([v, g.length, e, f(sum(g, (r) => r.solved)), f(sum(g, (r) => r.pre)), f(sum(g, (r) => r.h1)), f(sum(g, (r) => r.ch)), f(e - sum(g, (r) => r.solved)), (sum(g, (r) => sum(r.rooms, (x) => x)) / e).toFixed(1)].join(' | ')); } };
tbl((r) => r.v2, [1, 2, 3, 4, 5], 'v2 등급(판정자) × 사람');
tbl((r) => r.cur, [1, 2, 3, 4, 5], '지금 등급 × 사람');
const tags = ['학교용어', '세대', '이걸어떻게알아', '숫자정답', '단서가답', '이름떠올리기', '단서학교용어'];
for (const tg of tags) { console.log('\n-- tag', tg); for (const g of [1,2,3,4,5]) { const x = rows.filter((r) => r.v2 === g && r.tags.includes(tg)); const e = sum(x, (r) => r.n); if (e) console.log(' v2', g, 'items', x.length, 'exp', e, 'solved', (100*sum(x,r=>r.solved)/e).toFixed(0)+'%', 'pre', (100*sum(x,r=>r.pre)/e).toFixed(0)+'%'); } }
tbl((r) => r.gt, [...new Set(rows.map((r) => r.gt))], '게임 분야');
tbl((r) => r.read, ['a', 'b', 'c'], '읽기 등급 × 사람');
console.log('rows', rows.length, 'exposures', sum(rows, (r) => r.n));
