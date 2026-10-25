// V027 본 판정 조각(p01~) + 친숙도 조각(f01~) 생성
import fs from 'node:fs';
const R = 'C:/work/quiz-web', A = R + '/data/pipeline/audit', W = A + '/v027-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const T = J(A + '/v027-targets.json');
const items = Object.values(T.items).filter((x) => x.active);
const anchors = J(W + '/anchors52.json');
const EX = new Set([51, 2914, 722, 3041, 766, 160, 2367, 887, 251, 803, 2800, 781, 3230, 86, 488, 2731, 3589, 569, 1779, 4096]);
const testAnchors = anchors.filter((a) => !EX.has(a.id));
let seed = 20261027; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sh = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
const blk = (key, x) => `### ${key}\n분야: ${x.category || ''}\n질문: ${one(x.question)}\n정답: ${x.answer}${x.variants?.length ? '  (변형: ' + x.variants.join(' / ') + ')' : ''}\n해설: ${one(x.explanation) || '(없음)'}\n힌트: ${one(x.hint) || '(없음)'}\n`;
const NP = 30, per = Math.ceil(items.length / NP);
const base = sh(items);
const map = {}; const pieces = [];
for (let i = 0; i < NP; i++) {
  const name = 'p' + String(i + 1).padStart(2, '0');
  const part = base.slice(i * per, (i + 1) * per);
  const cal = sh(testAnchors).slice(0, 10).map((a) => ({ a, cal: true }));
  const mix = sh([...part.map((x) => ({ x })), ...cal.map((c) => ({ x: { ...c.a, answer: c.a.dbAnswer }, cal: c.a.id, gold: c.a.lvl }))]);
  const keys = [];
  const txt = mix.map((m, j) => { const key = name + '-' + String(j + 1).padStart(2, '0'); keys.push(key); map[key] = m.cal ? { cal: m.cal, gold: m.gold } : { id: m.x.id }; return blk(key, m.x); }).join('\n');
  fs.writeFileSync(`${W}/${name}.txt`, `## 난이도 v2 조각 ${name} (${mix.length}건)\n\n` + txt);
  fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(keys));
  fs.writeFileSync(`${W}/${name}.prompt.txt`, `V027 난이도 v2 판정자. 먼저 C:/work/quiz-web/data/pipeline/audit/v027-raw/INSTRUCTIONS.md 를 Read 로 전부 읽고 그 지시대로 한다.\n입력: ${W}/${name}.txt (블록 ${mix.length}개). 결과: ${W}/${name}.out.json (JSON 배열 · Write 로 직접). 입력 파일과 지시서 외 다른 파일은 열지 않는다.\n`);
  pieces.push({ name, n: mix.length });
}
fs.writeFileSync(W + '/main.map.json', JSON.stringify(map));
console.log(pieces.length, 'pieces', items.length, 'items per', per);
