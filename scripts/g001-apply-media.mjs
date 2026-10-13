#!/usr/bin/env node
// =============================================================================
// G001 — V005 판정 반영 → 미디어 최종 200 (★ 이 스크립트는 DB 를 쓰지 않는다 — 파일만)
//   입력  data/pipeline/samples/r047-media.json (R047 정리본 200 · dropped 10)
//         data/pipeline/audit/v005-results.json (V005 판정 200)
//   출력  data/pipeline/samples/g001-media.json   최종 200 · 항목마다 v005{verdict, applied, why} · dropped 10 그대로
//         data/pipeline/audit/g001-fixes.json     반영 기록 (before/after · 사유 · 출처)
//         data/pipeline/generated/g001/<mid>-<n>.json   pipeline-load --round g001 이 읽는 꼴
//   적재  npm run pipeline:load -- --round g001 --gate-only   (게이트만)
//         node scripts/backup.mjs → npm run pipeline:load -- --round g001
//   ★ 두 번 돌려도 같은 결과 (입력 파일만 읽는다). source_ref = "<subId>#g001-<ref>" — 적재도 두 번 들어가지 않는다
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMid } from '../pipeline/dist/categories.js';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';
import { normalizeAnswer } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const SRC = rd('data/pipeline/samples/r047-media.json');
const V5 = rd('data/pipeline/audit/v005-results.json');
const V = new Map(V5.items.map((x) => [x.ref, x]));

// ── 1. V005 fix 36 + unsure 2 — 항목별 판단
//   take: 'all' = 제안 그대로 / 'own' = 제안 취지대로 GEN 이 다른 문구(사유에 왜) / 필드별 값은 own 에 직접
//   sources: GEN 이 G001 에 다시 확인한 출처 (제안 속 새 사실)
const DECIDE = {
  'movie-19': { take: 'all', why: '층만 대중으로 (CV-01 — 문항은 그대로, 브리핑 설계 판단)' },
  'movie-21': { take: 'all', why: '쿠얀은 관세청 수사관 — 제안 그대로' },
  'anim-03': { take: 'all', why: 'CV-02 — B2 그대로 변형을 비운다. 질문이 "한국 방영 제목" 을 묻고 그 한정이 문항의 재미다. 질문을 읽고 그대로 친 사람은 "카드캡터 체리" 를 친다' },
  'anim-16': { take: 'all', why: '미야자키 발언 귀속(미확인)을 뺀 제안 그대로' },
  'anim-22': { take: 'all', why: '방화 사건 → 다른 제작작. 빙과·유포니엄·Free! 는 교토 애니메이션 제작(en.wikipedia)', sources: ['https://en.wikipedia.org/wiki/Kyoto_Animation'] },
  'game-07': { take: 'all', why: 'CV-02 — B2 그대로. 질문이 "한국과 일본에서 부르던 이름" 을 묻는다 — 서구 제목 PES 계열 빼고 위닝 · Winning Eleven 만' },
  'game-09': { take: 'all', why: '섬 멀티 두 곳 — 제안 그대로' },
  'game-13': {
    take: 'own',
    q: "'던전앤파이터'의 한 기본 직업은 한쪽 팔이 붉게 뒤틀린 저주받은 손을 지닌 설정입니다. 웨펀마스터·소울브링어·아수라 등으로 전직하는 이 직업은 무엇일까요?",
    e: "그 팔은 귀신이 깃들어 붉게 변하고 뒤틀리는 '귀수(鬼手)'로 설정되어 있으며, 남성 전직에는 버서커와 검귀도 있습니다.",
    why: '제안 질문(귀·검사 조각 제거)을 받되 3-1 에 맞춰 두 문장으로 — 단서 문장 앞, 묻는 문장 끝. 해설은 제안 그대로',
  },
  'game-17': { take: 'all', why: 'CV-03 — 센티널·스컬지 진영은 나무위키 카오스 문서로 확인', sources: ['https://namu.wiki/w/카오스(워크래프트%203/유즈맵)'] },
  'game-23': { take: 'all', why: '스페인어 뜻풀이 → 첫 출근 지각 (en.wikipedia — VERIFY 확인)' },
  'game-24': { take: 'all', why: '여관 주인 단정 제거 — 제안 그대로' },
  'drama-21': { take: 'all', why: 'CV-03 — 배달료를 아끼려 레이철·챈들러와 셋이 옮김은 en.wikipedia 회차 문서로 확인', sources: ['https://en.wikipedia.org/wiki/The_One_with_the_Cop'] },
  'drama-24': {
    take: 'own',
    hint: '빈은 이 인형이 살아 있는 것처럼 굴어, 크리스마스에는 선물을 사 주고 아침에는 깨우지 않으려 조심한다.',
    why: 'CV-03 — 제안 힌트의 "말을 걸고 함께 잠을 잔다" 는 en.wikipedia 에서 확인하지 못했다. 같은 문서에 있는 사실(살아 있는 듯 대함 · 크리스마스 선물 · 아침에 깨우지 않음)로 다시 썼다',
    sources: ['https://en.wikipedia.org/wiki/Mr._Bean'],
  },
  'drama-25': { take: 'all', why: '1화 첫 장면 → 첫머리' },
  'comics-01': {
    take: 'own',
    hint: "2007년 유료 웹진 '만끽'에서 연재를 시작했지만, 사이트가 문을 닫아 다음으로 옮겨 완결했다.",
    why: 'unsure — 옛 힌트(제목의 상징 설명)는 출처 없음. 판정자 제안(박해일 염두)은 웹툰가이드 기사로 확인됐으나 해설이 박해일 캐스팅을 말해 해설과 맞닿는다 → ko.wikipedia 로 확인한 연재 이력으로',
    sources: ['https://ko.wikipedia.org/wiki/이끼_(만화)'],
  },
  'comics-02': {
    take: 'own',
    hint: "주인공 원류환은 북한 최정예 요원이지만, 남한에서는 '방동구'라는 이름으로 산다.",
    why: "CV-03 — 남한 가명은 '동구' 가 아니라 '방동구'(ko.wikipedia 영화 문서 — 원류환(방동구) 역). 이름만 바로잡았다",
    sources: ['https://ko.wikipedia.org/wiki/은밀하게_위대하게_(영화)'],
  },
  'comics-07': { take: 'all', why: '2000~2024 열 편 — 제안 그대로' },
  'comics-09': { take: 'all', why: '합숙이 아니라 학교에 남아 일주일 — 제안 그대로' },
  'comics-25': {
    take: 'own',
    hint: "2016년부터는 이 단계 작가 가운데 일부에게 매달 지원금을 주는 '포텐업' 제도도 생겼다.",
    why: "CV-03 — 제안 힌트(조석 2006년 데뷔)는 확인 못 함: 2006년 '마음의 소리' 는 '도전만화' 에 올라온 것으로 나오고, 이 단계 이름은 확인되지 않았다. VERIFY 가 나무위키로 확인한 포텐업(2016.1 · 월 지원)으로",
    sources: ['https://namu.wiki/w/%EB%B2%A0%EC%8A%A4%ED%8A%B8%20%EB%8F%84%EC%A0%84'],
  },
  'variety-16': { take: 'all', why: '윤은혜의 귀를 막음 — 제안 그대로' },
  'kpop-01': {
    take: 'own',
    hint: '정규 앨범이 아닌 3.5집으로도 50만 장 넘게 팔았다.',
    why: '제안 힌트(멤버 세 명 이름)는 찬종이 "너무 쉬움" 으로 표시한 옛 질문의 단서 그대로라 다시 떠먹여 주기가 된다 → VERIFY 가 확인한 3.5집 판매(데일리안)로',
    sources: ['https://www.dailian.co.kr/news/view/994784/'],
  },
  'kpop-06': { take: 'all', why: '"세 멤버 함께" 제거 — 제안 그대로' },
  'kpop-08': { take: 'all', why: '아메바컬쳐 2006년 — 제안 그대로' },
  'kpop-09': { take: 'all', why: '힌트 교체(써니 일화 — 데일리안) · 시제 "9인조로 데뷔한"' },
  'kpop-11': { take: 'all', why: '층만 대중으로' },
  'kpop-12': { take: 'all', why: '뜻풀이 → 2010년 1월 1위 기록 (en.wikipedia)' },
  'kpop-14': {
    take: 'all',
    e: "이듬해 낸 정규 1집 '별일 없이 산다'로 한국대중음악상 올해의 음악인에 뽑혔습니다.",
    why: "힌트는 제안 그대로(서울신문). ★ 해설의 '타이틀곡은 달이 차오른다, 가자' 는 V005 미확인(지식 근거)이고 G001 검색으로도 타이틀곡 여부를 확인 못 해 확인된 수상으로 바꿨다 (GEN 판단)",
    sources: ['https://www.seoul.co.kr/news/2009/05/17/20090517401001'],
  },
  'kpop-15': { take: 'all', why: 'unsure — en.wikipedia: 안무는 닉 배스와 트렌트 디킨스, 어셔·팀버레이크 이력은 디킨스. 제안 해설 그대로', sources: ['https://en.wikipedia.org/wiki/Sorry,_Sorry_(Super_Junior_song)'] },
  'football-01': { take: 'all', why: '힐링턴 공장 견습 — 제안 그대로' },
  'football-07': { take: 'all', why: '해설이 옛 질문(깨물기)을 전제 — 제안 그대로' },
  'football-12': { take: 'all', why: '단정 → "전한다"' },
  'football-17': { take: 'all', why: '2018 복귀 · 2019 기술이사' },
  'football-22': { take: 'all', why: '아시아 최초 → 한국 남자 선수 최초' },
  'football-24': { take: 'all', why: '프로 경력은 마인츠뿐' },
  'football-25': { take: 'all', why: '1967년부터 14년' },
  'new-03': {
    take: 'own',
    q: "MBC 드라마 '대장금'(2003)에서 양미경이 연기한 수라간 궁녀는 어린 장금을 엄하게 가르치면서도 어머니처럼 돌봤습니다. 극 중에서 이 인물을 부르던 이름은 무엇일까요?",
    hint: '이 인물은 수라간 최고 자리를 두고 맞수 최씨 궁녀와 음식 경합을 벌인다.',
    why: "제안 질문의 '상궁' 제거는 받되 '수라간의 윗사람 · 호칭' 대신 '수라간 궁녀 · 이름' — '호칭' 이면 변형 한백영(본명)이 B2 에 걸린다. 힌트의 '대대로 그 자리를 이어 온 집안'(V005 미확인)과 '상궁' 조각을 뺐다 (경합은 경향신문 2003 — VERIFY 확인)",
    sources: ['https://www.khan.co.kr/article/200311121441361'],
  },
  'new-04': { take: 'all', why: '세뇨리따는 전진·이정현 · 집계 범위 명시' },
  'new-05': { take: 'all', why: "'큰 별' 뜻풀이 제거 · 뜻은 해설로" },
};

// ── 2. 단서를 바꾼 44 를 질문→해설→힌트로 이어 읽어 찾은 것 (V005 6절 4번과 같은 꼴) — GEN
const STALE = {
  'movie-01': { e: "류승룡이 맡은 아빠 '용구'가 딸에게 사 주려던 노란 세일러문 가방이 비극의 발단이 됩니다.", why: "해설의 '용구' 는 옛 질문에만 나오던 이름 — 누구인지 밝힘" },
  'movie-07': { e: '맥컬리 컬킨이 연기한 소년 케빈의 가족이 떠난 여행지는 프랑스 파리였고, 각본과 제작은 존 휴스가 맡았습니다.', why: "해설의 '케빈' 은 옛 질문에만 나오던 이름" },
  'drama-03': { e: "현빈과 하지원이 주연을 맡았고, 현빈이 연기한 김주원의 대사 '이게 최선입니까?'와 그가 입은 트레이닝복이 크게 유행했습니다.", why: "해설의 '김주원' 은 옛 질문에만 나오던 이름" },
  'drama-04': { e: "일본 작가 가미오 요코의 만화가 원작이며, 이민호가 연기한 구준표를 비롯한 네 명의 부잣집 아들을 'F4'라 불렀습니다.", why: "해설의 '구준표' 는 옛 질문에만 나오던 이름" },
  'variety-05': { e: '개그맨 정찬우·김태균 콤비가 진행했고, 정찬우가 2018년 활동을 멈춘 뒤에는 김태균이 스페셜 DJ와 함께 이어서 진행했습니다.', why: '해설이 옛 질문의 진행자 소개(정찬우·김태균 콤비)를 전제로 했다' },
  'kpop-02': { e: "2011년에는 '내가 제일 잘 나가'로 같은 시상식에서 올해의 노래상을 한 번 더 받았습니다.", why: "★ 사실 어긋남 — 해설의 '그해' 가 옛 질문의 2011년을 가리켰는데 새 질문은 2009년이라 '2009년에 내가 제일 잘 나가로 수상' 으로 읽힌다. 2011 MAMA 올해의 노래(en.wikipedia 2NE1)", sources: ['https://en.wikipedia.org/wiki/2NE1'] },
};

// ── 3. B10 (원제·상표가 영어 — MD8 "영문 제목") — 작품 제목 · 곡 제목 · 공식 영문 이름만. 인물·캐릭터·용어의 영문 표기는 B4 로 게이트가 뺀다
const B10 = new Set([
  'Shiri', 'Interstellar', 'Love Letter', 'Home Alone', 'Forrest Gump',
  'Fullmetal Alchemist', 'One Punch Man', 'Up', 'Ratatouille', 'Powerpuff Girls', 'Monsters Inc',
  'Dungeon & Fighter', 'Fortress', 'Bubble Bobble', 'Tekken', 'Winning Eleven', 'Overwatch', 'Lost Temple',
  'Secret Garden', 'The Walking Dead', 'Sherlock', 'Lookism',
  'COOL', 'Buzz', 'Epik High', 'Crying Nut', 'Dynamic Duo', 'Lollipop', 'Abracadabra', 'Mister',
  'Leicester City', 'Leicester',
]);

const fixes = [];
const out = [];
const LAT = /[A-Za-z]/, HAN = /[가-힣]/;
for (const src of SRC.items) {
  const it = structuredClone(src);
  const v = V.get(it.ref);
  if (!v) throw new Error(`V005 판정 없음: ${it.ref}`);
  const rec = (field, before, after, by, why, sources) => { if (before !== after) fixes.push({ ref: it.ref, answer: it.a, field, before, after, by, why, sources: sources ?? [] }); };
  // 새 문항(new-*) 질문의 줄바꿈 → 공백 (DB 활성 3,943 에 줄바꿈 0 — 화면이 문장마다 끊는다 · R035)
  if (it.q.includes('\n')) { const b = it.q; it.q = it.q.replace(/\s*\n\s*/g, ' '); rec('q', b, it.q, 'GEN', '줄바꿈 → 공백 (활성 문항과 같은 꼴 — 화면이 문장마다 줄을 바꾼다)'); }
  let applied = false, why = 'ok — 고칠 것 없음';
  if (v.verdict !== 'ok') {
    const d = DECIDE[it.ref];
    if (!d) throw new Error(`판단 없음: ${it.ref} (${v.verdict})`);
    const p = v.proposal ?? {};
    const pick = (k, pk) => (d[k] !== undefined ? d[k] : d.take === 'all' && p[pk] != null ? p[pk] : undefined);
    const nq = pick('q', 'question'), ne = pick('e', 'explanation'), nh = pick('hint', 'hint'), nv = pick('v', 'variants'), nl = pick('layer', 'layer');
    const by = d.take === 'all' ? 'V005' : 'V005→GEN';
    if (nq !== undefined) { const b = it.q; it.q = String(nq).replace(/\s*\/\s*/g, ' ').trim(); rec('q', b, it.q, by, d.why, d.sources); }
    if (ne !== undefined) { const b = it.e; it.e = ne; rec('e', b, it.e, d.e !== undefined ? 'GEN' : by, d.why, d.sources); }
    if (nh !== undefined) { const b = it.hint; it.hint = nh; it.hintMeta = { ...(it.hintMeta ?? {}), source: (d.sources ?? [])[0] ?? (v.sources ?? [])[0] ?? it.hintMeta?.source ?? null, basis: 'web', genFix: 'G001' }; rec('hint', b, it.hint, d.hint !== undefined ? 'GEN' : by, d.why, d.sources); }
    if (nv !== undefined) { const b = JSON.stringify(it.v); it.v = nv; rec('v', b, JSON.stringify(it.v), by, d.why, d.sources); }
    if (nl !== undefined) { const b = it.layer; it.layer = nl; rec('layer', b, it.layer, by, d.why); }
    applied = true; why = d.why;
  }
  const st = STALE[it.ref];
  if (st) { const b = it.e; it.e = st.e; rec('e', b, it.e, 'GEN', `clue 44 이어 읽기 — ${st.why}`, st.sources); }
  // B10 / B4
  const otv = it.v.filter((x) => B10.has(x));
  it.originalTitleVariants = otv;
  // 적재 게이트와 같은 판정으로 뺄 변형을 미리 뺀다 (B4 영문 원어 · B8 정규화 중복) — 파일 = DB
  const gate = checkAnswerSet(it.q, it.a, it.v, normalizeAnswer, { originalTitles: otv });
  if (gate.blocked.length) throw new Error(`질문에 정답 노출: ${it.ref} ${gate.blocked.map((b) => b.answer)}`);
  if (gate.dropped.length) { const drop = new Set(gate.dropped.map((d) => d.answer)); it.vGateDropped = gate.dropped.map((d) => `${d.answer} (${d.kind})`); it.v = it.v.filter((x) => !drop.has(x)); }
  it.v005 = { verdict: v.verdict, applied, why };
  if (st) it.g001Extra = st.why;
  out.push(it);
}
// kpop-15 해설: 제안에 '어셔·저스틴' 이 디킨스에 붙도록 이미 들어 있다

// ── 4. 파일 쓰기
const counts = { items: out.length, 대중: out.filter((i) => i.layer === '대중').length, 팬세부: out.filter((i) => i.layer === '팬 세부').length,
  applied: out.filter((i) => i.v005.applied).length, fixRows: fixes.length };
writeFileSync(path.join(ROOT, 'data/pipeline/samples/g001-media.json'), JSON.stringify({ round: 'G001', note: 'R047 정리본 + V005 판정 반영 (fix 36 · unsure 2) + clue 이어 읽기 6. dropped 10 은 R047 것 그대로', counts, dropped: SRC.dropped, items: out }, null, 1) + '\n');
writeFileSync(path.join(ROOT, 'data/pipeline/audit/g001-fixes.json'), JSON.stringify({ round: 'G001', basis: 'ai-out/V005.txt · data/pipeline/audit/v005-results.json', count: fixes.length, fixes }, null, 1) + '\n');

// generated/g001 — 소분류마다 한 파일 (pipeline-load --round 의 꼴)
const gdir = path.join(ROOT, 'data/pipeline/generated/g001');
mkdirSync(gdir, { recursive: true });
for (const f of readdirSync(gdir)) if (f.endsWith('.json')) rmSync(path.join(gdir, f));
const bySub = new Map();
for (const it of out) {
  const m = /^L3:([a-z0-9-]+)#(\d+)$/.exec(it.sub);
  if (!m) throw new Error(`소분류 key 꼴이 아니다: ${it.ref} ${it.sub}`);
  const subId = `${m[1]}/${m[2]}`;
  if (!bySub.has(subId)) bySub.set(subId, []);
  bySub.get(subId).push(it);
}
for (const [subId, list] of bySub) {
  const [midKey, n] = subId.split('/');
  const mid = findMid(midKey);
  const subName = mid?.subs[Number(n) - 1];
  if (!subName) throw new Error(`소분류 없음: ${subId}`);
  const doc = {
    _meta: { round: 'g001', subId, midKey, subName, questionPrompt: 'media-v2', scorePrompt: 'score-v1', hintPrompt: 'hint-v3', generator: 'claude-opus-5-5', questionGenerator: 'claude-opus-5-5', stage: 'media', note: 'G001 — R037 생성 · R047 정리 · V005 판정 · G001 반영 (data/pipeline/samples/g001-media.json)' },
    items: list.map((it) => ({
      seedId: `${subId}#g001-${it.ref}`,
      seed: { subject: it.work ?? it.a, aspect: it.layer, ref: it.ref },
      question: {
        ok: true, question: it.q, answer: it.a, acceptedAnswers: it.v, originalTitleVariants: it.originalTitleVariants,
        explanation: it.e, score: it.score, generalHint: it.hint ?? null, generalHintVersion: it.hint ? 'hint-v3' : null,
        layer: it.layer, genre: it.genre, sources: it.sources, v005: it.v005,
      },
    })),
  };
  writeFileSync(path.join(gdir, `${midKey}-${n}.json`), JSON.stringify(doc, null, 1) + '\n');
}
console.log(`g001-media.json ${out.length} (대중 ${counts.대중} · 팬 세부 ${counts.팬세부}) · 반영 ${counts.applied} · 기록 ${fixes.length}행 · generated/g001 ${bySub.size}파일`);
console.log(`게이트 판정으로 뺀 변형 ${out.reduce((n, i) => n + (i.vGateDropped?.length ?? 0), 0)} (B4 영문 원어 · B8 정규화 중복 — 항목의 vGateDropped)`);
