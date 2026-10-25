// G022 본 판정 조각(p01~p72 · 40 + 눈금자 10) + 친숙도 조각(f01~ · 지금 ≤2 898 + 친숙도 출처 없는 것 · 보정 10) 생성 — V027 mkmain/mkfam 꼴
import fs from 'node:fs';
const R = 'C:/work/quiz-web', A = R + '/data/pipeline/audit', W = A + '/g022-raw/_work';
const INST = A + '/v028-raw/INSTRUCTIONS.md', MEMO = A + '/v028-raw/INSTRUCTIONS.gen-memo.md';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const T = J(A + '/g022-raw/targets.json');
const items = Object.values(T.items).filter((x) => x.active).sort((a, b) => a.id - b.id);
const anchors = J(W + '/anchors52.json');
const EX = new Set([51, 2914, 722, 3041, 766, 160, 2367, 887, 251, 803, 2800, 781, 3230, 86, 488, 2731, 3589, 569, 1779, 4096]);
const testAnchors = anchors.filter((a) => !EX.has(a.id));
let seed = 20261029; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sh = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
const blk = (key, x) => `### ${key}\n분야: ${x.category || ''}\n질문: ${one(x.question)}\n정답: ${x.answer}${x.variants?.length ? '  (변형: ' + x.variants.join(' / ') + ')' : ''}\n해설: ${one(x.explanation) || '(없음)'}\n힌트: ${one(x.hint) || '(없음)'}\n`;
const memoLine = fs.existsSync(MEMO) ? `그다음 ${MEMO} (GEN 보정 메모)도 Read 로 읽고 따른다.\n` : '';
const PER = 40, NP = Math.ceil(items.length / PER);
const base = sh(items);
const map = {}; const pieces = [];
for (let i = 0; i < NP; i++) {
  const name = 'p' + String(i + 1).padStart(2, '0');
  const part = base.slice(i * PER, (i + 1) * PER); const inPart = new Set(part.map((x) => x.id));
  const cal = sh(testAnchors.filter((a) => !inPart.has(a.id))).slice(0, 10);
  const mix = sh([...part.map((x) => ({ x })), ...cal.map((a) => ({ x: { ...a, answer: a.dbAnswer }, cal: a.id, gold: a.lvl }))]);
  const keys = [];
  const txt = mix.map((m, j) => { const key = name + '-' + String(j + 1).padStart(2, '0'); keys.push(key); map[key] = m.cal ? { cal: m.cal, gold: m.gold } : { id: m.x.id }; return blk(key, m.x); }).join('\n');
  fs.writeFileSync(`${W}/${name}.txt`, `## 난이도 v2 조각 ${name} (${mix.length}건)\n\n` + txt);
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(keys));
  fs.writeFileSync(`${W}/${name}.prompt.txt`, `G022 난이도 v2 판정자. 먼저 ${INST} 를 Read 로 전부 읽고 그 지시대로 한다.\n${memoLine}입력: ${W}/${name}.txt (블록 ${mix.length}개). 결과: ${W}/${name}.out.json (JSON 배열 · Write 로 직접). 입력 파일과 지시서 외 다른 파일은 열지 않는다. 웹 검색 금지.\n`);
  pieces.push({ name, n: mix.length });
}
fs.writeFileSync(W + '/main.map.json', JSON.stringify(map));
// 친숙도 — V027 mkfam 그대로(보정 10 = cal1.json · 프롬프트 = v027 f01 꼴)
const CAL = J(W + '/cal1.json');
const firstSent = (e) => { const t = one(e); const m = t.match(/^.*?[.。!?](\s|$)/); return (m ? m[0] : t).slice(0, 140) || '(해설 없음)'; };
const famItems = items.filter((x) => x.curDif <= 2 || !x.famSource || x.famSource.missing);
const fb = sh(famItems.map((x, i) => ({ id: 1000 + i + 1, qid: x.id, answer: x.answer, topicKo: x.category.split(' > ')[0] || '', mid: x.category.split(' > ')[1] || '', first: firstSent(x.explanation) })));
const NF = Math.ceil(fb.length / 180), fper = Math.ceil(fb.length / NF); const fmap = {};
const tmpl = fs.readFileSync(A + '/v027-raw/_work/f01.prompt.txt', 'utf8');
for (let i = 0; i < NF; i++) {
  const part = fb.slice(i * fper, (i + 1) * fper); const name = 'f' + String(i + 1).padStart(2, '0');
  const mix = sh([...part, ...CAL.map((c) => ({ id: c.id, answer: c.answer, topicKo: c.topicKo, mid: c.mid, first: c.first, cal: true }))]);
  for (const x of part) fmap[x.id] = x.qid;
  fs.writeFileSync(`${W}/${name}.txt`, `## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n` + mix.map((x) => `### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n한 줄 정체(구별용): ${x.first}\n`).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(mix.map((x) => x.id)));
  fs.writeFileSync(`${W}/${name}.prompt.txt`, tmpl.replace(/VERIFY 세션/g, 'GEN 세션').replace(/v027-raw/g, 'g022-raw').replace(/f01/g, name).replace(/174/g, String(mix.length)));
}
fs.writeFileSync(W + '/fam.map.json', JSON.stringify(fmap));
console.log(pieces.length, 'pieces', items.length, 'items · last', pieces.at(-1).n, '· fam', famItems.length, 'in', NF, 'pieces of ~', fper + CAL.length);
