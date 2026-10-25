import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const M = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/merged.json', 'utf8')).res;
const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
// yuja
const y = Object.values(T).filter((t) => t.human.yuja); console.log('yuja items', y.length);
const hardY = y.filter((t) => t.human.yuja.fastestMs == null || t.human.yuja.fastestMs >= 20000);
const dist = (arr) => { const c = {}; for (const t of arr) { const v = M[t.id]?.v2; c[v] = (c[v] || 0) + 1; } return JSON.stringify(c); };
console.log('yuja all v2', dist(y), 'cur', JSON.stringify(y.reduce((c, t) => (c[t.curDif] = (c[t.curDif] || 0) + 1, c), {})));
console.log('yuja 못맞힘/20초↑', hardY.length, 'v2', dist(hardY));
const easyY = y.filter((t) => t.human.yuja.fastestMs != null && t.human.yuja.fastestMs < 20000); console.log('yuja <20s', easyY.length, 'v2', dist(easyY));
const nosolve = y.filter((t) => t.human.yuja.solved === 0); console.log('아무도 못맞힘', nosolve.length, dist(nosolve));
for (const t of hardY) console.log(t.id, t.answer, 'cur', t.curDif, 'v2', M[t.id].v2, 'read', M[t.id].read.grade, t.human.yuja.fastestMs, M[t.id].tags.join(','));
console.log('\n하 69 중 v2 ≥3 비율', y.filter((t) => M[t.id].v2 >= 3).length, '/', y.length);
// 읽기 b/c 와 아무도 못맞힘 겹침
const rb = y.filter((t) => M[t.id].read.grade !== 'a'); console.log('yuja 읽기 b/c', rb.length, '이 중 어려웠던', rb.filter((t) => hardY.includes(t)).length);
// ≥3 판정 항목에서 대분류 편향
const imp = (t) => { const s = t.human.ser; if (!s.n) return null; const m = s.fastestMs; if (m == null) return 5; if (m < 5000) return 1; if (m < 10000) return 2; if (m < 25000) return 3; return 4; };
const rows = Object.entries(M).map(([id, r]) => ({ id, r, t: T[id], imp: imp(T[id]) })).filter((x) => x.imp != null);
console.log('\n≥3 판정 한정 대분류 (v2-imp)'); for (const g of ['자연과학','인문·사회','문화·예술','스포츠·게임','한국','생활·상식','기술·의학']) { const x = rows.filter((z) => z.r.v2 >= 3 && z.t.category.startsWith(g)); if (x.length) console.log(g, x.length, (x.reduce((s, z) => s + z.r.v2 - z.imp, 0) / x.length).toFixed(2), '맞힘', (100*x.filter(z=>z.t.human.ser.solved>0).length/x.length).toFixed(0)+'%'); }
console.log('≤2 판정 한정'); for (const g of ['자연과학','인문·사회','문화·예술','스포츠·게임','한국','생활·상식','기술·의학']) { const x = rows.filter((z) => z.r.v2 <= 2 && z.t.category.startsWith(g)); if (x.length) console.log(g, x.length, (x.reduce((s, z) => s + z.r.v2 - z.imp, 0) / x.length).toFixed(2), '힌트전', (100*x.filter(z=>z.t.human.ser.fastestMs!=null&&z.t.human.ser.fastestMs<10000).length/x.length).toFixed(0)+'%'); }
