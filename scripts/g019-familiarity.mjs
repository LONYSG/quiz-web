#!/usr/bin/env node
// =============================================================================
// G019 — 정답 친숙도 판정 단계 (기준서 5-4 · V022 방법 그대로 — 정답 · 묶음 · 중분류 · 한 줄 정체만 · 조각마다 보정 예 10)
//   node scripts/g019-familiarity.mjs prep <round> [조각 크기 40]   tmp/g019/<round>/merged.json 의 살아 있는 것 → tmp/g019/<round>/fam/fNN.{txt,keys.json,prompt.txt}
//   node scripts/g019-familiarity.mjs collect <round>              fNN.out.json(재실행이 있으면 fNN.r2.out.json) → tmp/g019/<round>/familiarity.json
//                                                                   · 친숙도 1 → tmp/g019/<round>/late-drop.json 에 "친숙도 1" (stage 가 뒤 단계에서 뺀다 · build 가 격리로 남긴다)
//   보정: data/pipeline/audit/v022-raw/_work/cal.json(10 — 기대 3 둘 · 2 셋 · 1 다섯 · id 음수) 을 조각마다 섞는다.
//         기대 1 다섯 중 1 로 맞힌 수 ≤ 2 인 조각은 "재실행" 으로 표시(V022 0절) — 재실행 결과(fNN.r2.out.json)를 최종으로 쓴다.
//   ★ 판정자에게 질문 · 난이도 · 힌트 · 생성자의 familiarityPct 를 주지 않는다. DB 를 쓰지 않는다.
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, round, sizeArg] = process.argv.slice(2);
if (!['prep', 'collect'].includes(cmd) || !/^g019[ab]$/.test(round ?? '')) { console.error('사용법: node scripts/g019-familiarity.mjs prep|collect g019a|g019b [조각 크기]'); process.exit(1); }
const W = path.join(ROOT, 'tmp/g019', round);
const FAM = path.join(W, 'fam');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const TOPIC_KO = { history: '역사·사회', media: '미디어·콘텐츠', science: '과학·기술', sports: '스포츠', life: '생활', korea: '한국', arts: '문화·예술' };
const CAL = J(path.join(ROOT, 'data/pipeline/audit/v022-raw/_work/cal.json'));
const MIDS = new Map(J(path.join(ROOT, 'tmp/g019/active.json')).map((r) => [r.l2key, r.l2name]));
const midName = (mid) => MIDS.get(mid) ?? mid;

const prompt = (f, n) => `너는 퀴즈 **정답 친숙도** 판정자다(GEN 세션 하위 에이전트). 이 파일이 지시 전체다. 모든 응답은 한국어. 도구는 Read · Write 뿐이다(웹·검색·다른 파일 열기 금지 — 입력 파일 하나와 결과 파일 하나만).
## 일
입력 ${FAM.replace(/\\/g, '/')}/${f}.txt (### 숫자 로 시작하는 블록 ${n}개 — 순서 ${f}.keys.json). 블록마다 정답 · 묶음 · 중분류 · 한 줄 정체(같은 이름의 다른 대상을 구별하기 위한 것)가 있다. **질문·난이도·힌트는 없다(일부러 뺐다).** 정답이 "무엇인지"를 한 줄 정체로만 알고, 아래 물음에 답한다.
## 판정 물음
**"한국 성인 100명(대졸 30대 · 퀴즈 프로를 가끔 봄)에게 이 정답의 이름만 보여 주면 몇 명이 '들어 봤다'고 할까?"** 판정자(너) 자신의 지식이 아니라 그 보통 성인을 어림한다. 어림한 수 pct(0~100)를 적고, pct 70 이상이면 familiarity 3 · 30 이상 70 미만이면 2 · 30 미만이면 1 이다.
- **3** = 보통 성인 대부분이 이름을 알고 무엇인지 대강 안다. 예: 나폴레옹 · 임진왜란 · 번아웃.
- **2** = 이름을 들어 봤거나 정답을 보면 "아 그거" 한다. 예: 예니체리 · 우신예찬 · DSM.
- **1** = 처음 듣는다. 예: 뒤베르제의 법칙 · 시뇨리지 · 음의 소득세.
- 질문이 쉬운지·어려운지는 보지 않는다(이 축은 정답 이름의 친숙함뿐). 전문 분야 사람만 아는 이름(학술 용어 · 작은 지역 · 마이너 인물 · 옛 제도)은 1~2 쪽이다. 한 번이라도 뉴스·교과서·영화·게임에서 접했을 법한 이름은 2 이상이다. 같은 이름이 여러 대상일 때는 한 줄 정체의 대상을 기준으로 한다.
- 어림이 흔들리면 pct 로 솔직하게 적는다(경계를 일부러 올리거나 내리지 않는다).
## 결과
${FAM.replace(/\\/g, '/')}/${f}.out.json 에 JSON 배열(입력 순서 · ${n}개)을 Write 로 직접 쓴다(스크립트 금지): {"id":숫자(### 뒤 숫자 그대로 — 음수도 그대로),"familiarity":1|2|3,"pct":0~100,"why":"한 줄(어디서 접했을 법한가 / 왜 낯선가)"}. 쓴 뒤 개수·순서를 확인하고 마지막 답변에는 "개수 · 1/2/3 수"만 짧게 적는다.`;

if (cmd === 'prep') {
  const SIZE = Number(sizeArg ?? 40);
  const M = J(path.join(W, 'merged.json')).filter((i) => !i.drop.length);
  const late = existsSync(path.join(W, 'late-drop.json')) ? J(path.join(W, 'late-drop.json')) : {};
  let s = round === 'g019a' ? 20261021 : 20261022; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const items = M.filter((i) => !late[i.ref]).map((i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  mkdirSync(FAM, { recursive: true });
  const map = {};
  for (let k = 0; k * SIZE < items.length; k++) {
    const f = `f${String(k + 1).padStart(2, '0')}`;
    const part = items.slice(k * SIZE, (k + 1) * SIZE).map((it, j) => ({ id: (k + 1) * 1000 + j + 1, ref: it.ref, answer: it.answer, topicKo: TOPIC_KO[it.topic] ?? it.topic, mid: midName(it.mid), first: it.identity ?? '' }));
    for (const p of part) map[p.id] = p.ref;
    const all = [...part, ...CAL.map((c) => ({ id: c.id, answer: c.answer, topicKo: c.topicKo, mid: c.mid, first: c.first }))].map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    writeFileSync(path.join(FAM, `${f}.txt`), `## 정답 친숙도 조각 ${f} (${all.length}건)\n\n` + all.map((x) => `### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n한 줄 정체(구별용): ${x.first}\n`).join('\n'));
    writeFileSync(path.join(FAM, `${f}.keys.json`), JSON.stringify(all.map((x) => x.id)));
    writeFileSync(path.join(FAM, `${f}.prompt.txt`), prompt(f, all.length));
    console.log(f, all.length);
  }
  writeFileSync(path.join(FAM, 'map.json'), JSON.stringify(map, null, 1));
} else {
  const map = J(path.join(FAM, 'map.json'));
  const out = {}; const rerun = []; const cal = {};
  for (const f of readdirSync(FAM).filter((x) => /^f\d+\.keys\.json$/.test(x)).map((x) => x.slice(0, 3)).sort()) {
    const keys = J(path.join(FAM, `${f}.keys.json`));
    const r2 = path.join(FAM, `${f}.r2.out.json`);
    const use = existsSync(r2) ? r2 : path.join(FAM, `${f}.out.json`);
    if (!existsSync(use)) { console.log(`${f}: 결과 없음`); continue; }
    const res = J(use);
    if (res.length !== keys.length || res.some((x, i) => x.id !== keys[i])) throw new Error(`${f}: 개수·순서가 입력과 다름`);
    for (const x of res) { const want = x.pct >= 70 ? 3 : x.pct >= 30 ? 2 : 1; if (want !== x.familiarity) throw new Error(`${f} ${x.id}: pct ${x.pct} ↔ ${x.familiarity}`); }
    const c = res.filter((x) => x.id < 0); const exp1 = CAL.filter((k) => k.expected === 1).map((k) => k.id);
    const hit1 = c.filter((x) => exp1.includes(x.id) && x.familiarity === 1).length;
    cal[f] = { file: path.basename(use), hit1: `${hit1}/${exp1.length}`, all: c.map((x) => `${x.id}:${x.familiarity}`).join(' ') };
    if (hit1 <= 2 && !existsSync(r2)) rerun.push(f);
    for (const x of res.filter((y) => y.id > 0)) out[map[x.id]] = { familiarity: x.familiarity, pct: x.pct, why: x.why, piece: f, run: existsSync(r2) ? 2 : 1 };
  }
  writeFileSync(path.join(W, 'familiarity.json'), JSON.stringify({ round, cal, rerun, items: out }, null, 1));
  const v = Object.values(out); const n = (k) => v.filter((x) => x.familiarity === k).length;
  console.log(`판정 ${v.length} · 1 ${n(1)} · 2 ${n(2)} · 3 ${n(3)} · 재실행 필요 ${rerun.join(' ') || '없음'}`);
  console.log(JSON.stringify(cal));
  if (!rerun.length) {
    const lp = path.join(W, 'late-drop.json'); const late = existsSync(lp) ? J(lp) : {};
    for (const [ref, x] of Object.entries(out)) if (x.familiarity === 1) late[ref] = `친숙도 1 (pct ${x.pct} · ${x.why})`;
    writeFileSync(lp, JSON.stringify(late, null, 1));
    console.log(`late-drop ${Object.values(late).filter((w) => w.startsWith('친숙도 1')).length}건(친숙도 1)`);
  }
}
