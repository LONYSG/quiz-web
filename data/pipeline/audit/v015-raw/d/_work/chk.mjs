// usage: node chk.mjs b01  — out.json 개수·key 순서·verdict 값 대조
import fs from 'node:fs';
const D = 'C:/work/quiz-web/data/pipeline/audit/v015-raw/d/_work/';
const name = process.argv[2];
const refs = JSON.parse(fs.readFileSync(D + name + '.refs.json', 'utf8'));
let out; try { out = JSON.parse(fs.readFileSync(D + name + '.out.json', 'utf8')); } catch (e) { console.log(name, 'NO/BAD out', e.message); process.exit(1); }
const ids = out.map((x) => String(x.id));
const okOrder = ids.length === refs.length && ids.every((v, i) => v === refs[i]);
const v = {}; for (const x of out) v[x.verdict] = (v[x.verdict] || 0) + 1;
const badFix = out.filter((x) => x.verdict !== 'ok' && !(x.proposal && Object.values(x.proposal).some(Boolean)) && x.verdict !== 'drop').length;
const urls = out.reduce((s, x) => s + (x.urls?.length || 0), 0);
const unv = out.filter((x) => /unverified/.test(JSON.stringify(x))).length;
console.log(JSON.stringify({ name, n: out.length, expect: refs.length, okOrder, verdicts: v, fixNoProposal: badFix, urls, unverified: unv }));
