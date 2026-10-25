import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit';
const M = JSON.parse(fs.readFileSync(A + '/v027-raw/_work/merged.json', 'utf8')).res;
const T = JSON.parse(fs.readFileSync(A + '/v027-targets.json', 'utf8')).items;
const imp = (t) => { const s = t.human.ser; if (!s.n) return null; const m = s.fastestMs; if (m == null) return 5; if (m < 5000) return 1; if (m < 10000) return 2; if (m < 25000) return 3; return 4; };
const mv = {}; const rows = [];
for (const [id, r] of Object.entries(M)) { const t = T[id]; const k = t.curDif + '>' + r.v2; mv[k] = (mv[k] || 0) + 1; const i = imp(t); rows.push({ id, v2: r.v2, cur: t.curDif, imp: i, conf: r.conf, tags: r.tags, major: t.category.split(' > ')[0], mid: t.category.split(' > ')[1], q: t.question.slice(0, 50), a: t.answer, ms: t.human.ser.fastestMs, rooms: t.human.ser.rooms }); }
console.log('이동표 (지금>v2):'); for (const c of [1,2,3,4]) console.log(' 지금', c, [1,2,3,4,5].map((v) => v + ':' + (mv[c + '>' + v] || 0)).join(' '), 'n', [1,2,3,4,5].reduce((s, v) => s + (mv[c + '>' + v] || 0), 0));
const tot = Object.values(mv).reduce((a, b) => a + b, 0); const up = rows.filter((r) => r.v2 > r.cur).length, dn = rows.filter((r) => r.v2 < r.cur).length; console.log('up', up, 'down', dn, 'same', tot - up - dn, 'of', tot);
const hr = rows.filter((r) => r.imp != null);
const d = hr.map((r) => r.v2 - r.imp); const by = {}; for (const x of d) by[x] = (by[x] || 0) + 1; console.log('v2 - imp 분포', JSON.stringify(by));
const far = hr.filter((r) => Math.abs(r.v2 - r.imp) >= 2); console.log('2단계 이상 어긋남', far.length, '판정이 사람보다 어렵게(v2>imp)', far.filter((r) => r.v2 > r.imp).length, '쉽게', far.filter((r) => r.v2 < r.imp).length);
const majors = [...new Set(rows.map((r) => r.major))]; console.log('\n대분류별 평균(v2 - imp)'); for (const m of majors) { const g = hr.filter((r) => r.major === m); if (g.length >= 8) console.log(m, g.length, (g.reduce((s, r) => s + r.v2 - r.imp, 0) / g.length).toFixed(2), 'v2평균', (g.reduce((s, r) => s + r.v2, 0) / g.length).toFixed(2), 'imp평균', (g.reduce((s, r) => s + r.imp, 0) / g.length).toFixed(2)); }
console.log('\n중분류(≥10) (v2-imp)'); const mids = [...new Set(rows.map((r) => r.mid))]; const ml = mids.map((m) => { const g = hr.filter((r) => r.mid === m); return [m, g.length, g.reduce((s, r) => s + r.v2 - r.imp, 0) / (g.length || 1)]; }).filter((x) => x[1] >= 10).sort((a, b) => b[2] - a[2]); for (const x of ml) console.log(x[0], x[1], x[2].toFixed(2));
console.log('\nconf별'); for (const c of ['high','mid','low']) { const g = hr.filter((r) => r.conf === c); console.log(c, g.length, (g.reduce((s, r) => s + r.v2 - r.imp, 0) / (g.length||1)).toFixed(2), 'far', g.filter((r)=>Math.abs(r.v2-r.imp)>=2).length); }
console.log('\n태그별 (v2-imp)'); const tg = new Set(rows.flatMap((r) => r.tags)); for (const t of tg) { const g = hr.filter((r) => r.tags.includes(t)); console.log(t, g.length, (g.reduce((s, r) => s + r.v2 - r.imp, 0) / g.length).toFixed(2)); }
fs.writeFileSync('far.json', JSON.stringify(far));
