#!/usr/bin/env node
// =============================================================================
// G025 A — 계획표(DB 읽기만) → audit/g025-plan.json
//   ① worth.json 6,507 ↔ 활성 대조 · ★ V029 재독 9 고침(V029.txt 3절 — worth.json 에 안 들어가 있다)을 얹은 최종값
//   ② 적용 뒤 예상 등급 × 알가치 표(판 수 환산) · L2 별 알가치 3 비율
//   ③ 글 고칠 14(CV-111 10 · CV-112 1941 · G023 이 200자로 건너뛴 3)의 지금 글 · 새 글 · 출처
//   ④ L3 신설 후보별 들어갈 문항(GEN 이 DB 검색 뒤 직접 읽고 고른 id) ⑤ 대기 54 ⑥ 열린 판
//   사용  node scripts/g025-plan.mjs
// =============================================================================
import { connect, readJson, writeJson, len } from './g023-common.mjs';

// ★ V029.txt 3절 "고친 9 전부" — worth.json items 에는 judged/reread 가 없다(판정자 원값만). V029 의 최종 판정을 쓴다
export const REREAD = { 468: 3, 471: 3, 331: 1, 177: 2, 463: 2, 1191: 2, 1607: 2, 1210: 2, 4499: 2 };
export const CV111 = [2946, 4730, 4803, 4858, 5264, 5505, 6135, 6364, 6473, 6702];
const KINDS = ['상식', '개념', '취미세부', '유래', '고유명사', '일화', '쓸모', '숫자'];

// ③ 새 글 — 질문(q) · 해설(e) · 출처(src). e 가 없으면 해설은 그대로
const TEXT = {
  2946: {
    q: '돼지고기와 뼈를 삶은 국물에 해초 모자반을 넣고 걸쭉하게 끓이는 제주의 향토 음식이 있습니다. 음식 이름은 제주말로 모자반을 부르는 말에서 왔습니다. 이 음식은 무엇일까요?',
    e: "제주말로 모자반을 '몸'이라 부릅니다. 메밀가루를 풀어 국물을 걸쭉하게 만들고, 잔칫날 같은 특별한 날에 주로 먹었습니다.",
    src: ['https://ko.wikipedia.org/wiki/몸국'],
  },
  4730: {
    q: '1715년 한 그림이 암스테르담 시청으로 옮겨지면서, 두 기둥 사이에 맞추려고 네 변이 모두 잘려 나간 것으로 보입니다. 그림 속에는 노란 옷의 부관 곁에 허리에 죽은 닭을 찬 소녀가 빛을 받고 서 있습니다. 실제로는 낮 장면인데 덧칠한 어두운 니스 때문에 밤 장면으로 오해받아 붙은 이름으로 불리는 이 그림은 무엇일까요?',
    e: "렘브란트가 1642년에 완성한 그림으로, 원래 제목은 '프란스 바닝 코크 대장이 이끄는 제2구역 민병대'입니다.",
    src: ['https://en.wikipedia.org/wiki/The_Night_Watch'],
  },
  4803: {
    q: "1994년 남아프리카 공화국은 이 공휴일의 이름을 '선의의 날'로 바꾸었고, 싱가포르는 더 이상 공휴일로 지키지 않게 되었습니다. 크리스마스에 수고한 일꾼에게 선물 상자를 건네던 데서 이름이 왔다는 설명이 흔한, 영연방 여러 나라에서 쉬는 이 공휴일은 무엇일까요?",
    e: '크리스마스 다음 날인 12월 26일이며, 이름의 유래는 확실하지 않습니다. 영국에서는 큰 할인 판매가 열리고 축구 리그 경기가 몰리는 날이기도 합니다.',
    src: ['https://en.wikipedia.org/wiki/Boxing_Day'],
  },
  4858: {
    q: "오토바이를 싫어하던 이탈리아의 항공 기술자 코라디노 다스카니오가 설계를 맡은 스쿠터가 있습니다. 그는 엔진을 뒷바퀴 옆에 붙이고 바퀴를 변속기로 바로 돌려 체인을 없앴습니다. 시제품을 처음 본 사장 엔리코 피아조가 '말벌 같다!'고 외친 것이 그대로 이름이 된 이 스쿠터는 무엇일까요?",
    e: "이름은 이탈리아어로 '말벌'이라는 뜻입니다. 1953년 영화 '로마의 휴일'에서 오드리 헵번이 그레고리 펙의 이 스쿠터를 타는 장면으로 널리 알려졌습니다.",
    src: ['https://en.wikipedia.org/wiki/Vespa'],
  },
  5264: {
    q: "1927년 프랑스 르플레시벨빌에서 기술자 조르주 바타유가 회사를 세웠습니다. 이 회사는 1951년 유압으로 움직이는 건설 기계 'TU'를 내놓았고, 1977년 지분 40%를 미국 케이스에 넘겼습니다. 한국에서는 이 회사 이름이 굴착기를 가리키는 일반명사처럼 쓰입니다. 이 회사는 어디일까요?",
    e: "프랑스 상표에서 온 말로 표준국어대사전에도 올라 있습니다. 같은 기계를 '굴착기'나 '삽차'라고도 합니다.",
    src: ['https://en.wikipedia.org/wiki/Poclain', 'https://ko.wikipedia.org/wiki/굴착기'],
  },
  5505: {
    q: '1961년 당의정으로 처음 나왔다가 1963년 지금과 같은 드링크제로 바뀐 피로 해소제가 있습니다. 1976년부터 드링크 광고가 금지되었다가 1993년에 광고를 다시 시작했습니다. 이름을 로마 신화에서 술의 신으로 꼽히는 신에게서 따온 이 제품은 무엇일까요?',
    e: '동아제약 강신호 회장이 독일 유학 시절 함부르크 시청 지하 입구에서 본 바커스 상을 떠올려 지었다고 전합니다.',
    src: ['https://www.dailian.co.kr/news/view/605640/', 'https://dailypharm.com/user/news/41168'],
  },
  6135: {
    q: "OV-101로 불린 미국 우주 왕복선 시험기는 1976년 9월 17일 '헌법의 날'에 맞춰 '컨스티튜션'이라는 이름으로 공개될 계획이었습니다. 그런데 한 SF 드라마의 팬들이 보낸 편지가 수십만 통 쏟아지자, 그 드라마 속 우주선의 이름으로 바뀌었습니다. 이 시험기의 이름은 무엇일까요?",
    e: "그 드라마는 '스타트렉'이며, 공개 행사에는 제작자 진 로든베리와 주요 출연진이 나왔습니다. 엔진과 열 차폐가 없어 우주로는 나가지 못했고, 1977년 대기권 접근·착륙 시험을 했습니다.",
    src: ['https://en.wikipedia.org/wiki/Space_Shuttle_Enterprise'],
  },
  6364: {
    q: '님프 칼립소와 플레이아데스 자매의 아버지로 전하는 티탄입니다. 고대에는 처음으로 천구의를 만든 이로 여겨졌습니다. 16세기 지도 제작자 메르카토르가 이 이름을 지도책 제목으로 삼은 뒤, 이 이름은 지도책을 가리키는 말이 되었습니다. 이 티탄은?',
    e: '티탄들의 전쟁에서 진 뒤 제우스의 벌로 세상 서쪽 끝에서 하늘을 떠받치게 되었다고 전합니다. 페르세우스에게 묵을 곳을 내주지 않아 돌이 되었다는 이야기도 있습니다.',
    src: ['https://en.wikipedia.org/wiki/Atlas_(mythology)'],
  },
  6473: {
    q: "1865년 파리 동물원에서 런던 동물원으로 옮겨 온 아프리카코끼리가 있습니다. 1882년 미국 흥행사 바넘에게 팔릴 때, 학생 10만 명이 빅토리아 여왕에게 팔지 말아 달라는 편지를 보냈습니다. 이 코끼리의 이름은 뒤에 '아주 큰'을 뜻하는 흔한 영어 낱말이 되었습니다. 이름은?",
    e: '1885년 캐나다 온타리오주 세인트토머스의 철도 기지에서 기차에 치여 숨졌습니다.',
    src: ['https://en.wikipedia.org/wiki/Jumbo'],
  },
  6702: {
    q: "1958년 듀폰의 화학자 조지프 시버스는 여성용 거들에 쓰던 고무를 대신할 섬유를 만들었습니다. 처음에는 '파이버 K'라 불렸습니다. 영어 'expands'(늘어나다)의 글자 순서를 바꿔 지은, 북미에서 쓰는 이 섬유의 일반 이름은 무엇일까요?",
    e: "듀폰은 자기 제품에 '라이크라'라는 상표를 붙였고, 유럽에서는 주로 '엘라스테인'이라고 부릅니다.",
    src: ['https://en.wikipedia.org/wiki/Spandex'],
  },
  1941: {
    q: '어깨와 허리를 함께 잡는 3점식 안전띠는 1959년 볼보가 처음 차에 달았습니다. 볼보는 더 많은 생명을 구하려고, 발명자로서 이 안전띠 설계에 가진 독점 권리를 내세우지 않고 다른 회사들도 쓸 수 있게 풀었습니다. 이 권리는 무엇일까요?',
    src: ['https://www.volvogroup.com/en/about-us/heritage/three-point-safety-belt.html', 'https://en.wikipedia.org/wiki/Nils_Bohlin', 'https://lemelson.mit.edu/resources/nils-bohlin'],
  },
};
// G023 이 200자로 건너뛴 3 — 판정 파일의 제안 문장(read.proposal · review ok)
const QLEN3 = { 5137: ['G022', 'g022-rerate.json'], 5218: ['V028', 'v028-rerate.json'], 5712: ['V028', 'v028-rerate.json'] };

// ④ L3 신설 — 들어갈 문항은 GEN 이 검색(정답·질문 낱말) 뒤 직접 읽고 고른 것. ≥3 이면 신설
const L3 = [
  { name: '미국사', parent: 33, ids: [912, 3537, 3966, 6451], seen: '보스턴 차 사건 2 · 페리(증기 해군) · 하와이 왕국 — 1993 페리(일본 개항) · 2623 뉴딜(20세기 서양)은 지금이 맞아 둠' },
  { name: '고대 문명', parent: 33, ids: [5570, 3312, 3970], seen: '함무라비 법전 · 모헨조다로 2(인더스) — 쐐기문자 · 로제타석(문자 체계) · 피라미드(랜드마크) · 길가메시(신화)는 지금이 맞아 둠' },
  { name: '한국 신종교·민속 신앙', parent: 37, ids: [662, 3870, 664, 3871], seen: '천도교 2 · 원불교 2(지금 고대·소수 종교)' },
  { name: '배우·영화인', parent: 64, ids: [6441, 6442, 3286, 3915, 5163], seen: '정답이 배우인 세계 영화 문항 — 디카프리오 · 오드리 헵번 · 이소룡 2 · 리타 헤이워스' },
  { name: '배우·영화인', parent: 29, ids: [5503, 6350, 6349], seen: '정답이 배우이고 질문이 배우 이력인 것 — 한석규 · 안성기 · 전지현(지금 방송·예능 > 광고) · 이광수 · 차승원(예능) · 임은경(광고 모델)은 지금이 맞아 둠' },
  { name: 'SNS·인터넷 문화', parent: 54, ids: [3167, 3240, 3516], seen: '챌린지(짧은 영상) · 해시태그 · 몬티 파이선(스팸 메일 이름) — 위키(네트워크·인터넷)는 둠' },
  { name: '음악 매체·산업', parent: 62, ids: [1882, 3834, 1883, 3833, 2504, 1884, 3162, 5576, 1876, 3830], seen: '정답이 매체·차트·유통인 것 — CD 2 · 워크맨 2 · LP · 빌보드 핫 100 · 스트리밍 · 냅스터 · MTV 2 — 모타운(음반사)은 시대 L3 에 둠' },
  { name: '응원가·응원 문화', parent: 71, ids: [5465, 4127, 415], seen: '오 필승 코리아 · You\'ll Never Walk Alone · 부부젤라 — 야구 응원은 0 이라 축구 아래' },
  { name: '시사·정치 용어', parent: 41, ids: [6738, 3822, 1869], seen: '브렉시트 · 레임덕 · 게리맨더링(말이 생긴 내력) — 필리버스터 · 캐스팅보트 · 매니페스토 · 포퓰리즘은 지금(체제·기구 / 선거·의회)에 둠' },
];
const L3_HOLD = [
  { name: '디즈니 밖 극장 애니메이션', parent: 65, ids: [3383, 1423], why: '슈렉 2 뿐(3 미만) — 65 의 "서양 TV 애니메이션" 은 TV 라 안 맞음 · 지금(디즈니·픽사 극장 애니메이션)에 둠' },
  { name: '출판·그림책', parent: 67, ids: [4856, 6175], why: '펭귄 북스 · 월리를 찾아라 2 뿐 — 무민 · 바바파파 · 토마스는 애니메이션 문항 · 그대로' },
  { name: '세계 인물', parent: null, ids: [6757], why: '설계 결정 — 신설 없음' },
];

const c = await connect();
try {
  const open = (await c.query('select count(*)::int n from games where ended_at is null')).rows[0].n;
  const at = new Date().toISOString();
  const W = readJson('v029-worth.json');
  const items = W.items;
  const { rows: act } = await c.query('select id, difficulty_score g, category_id, worth from questions where is_active');
  const actSet = new Set(act.map((r) => String(r.id)));
  const { rows: inact } = await c.query('select id from questions where not is_active and id = any($1::bigint[])', [Object.keys(items)]);
  const check = {
    worthItems: Object.keys(items).length,
    activeNotInWorth: act.filter((r) => !items[r.id]).map((r) => r.id),
    inWorthNotActive: inact.map((r) => Number(r.id)),
    badWorth: Object.entries(items).filter(([, x]) => ![1, 2, 3].includes(x.worth)).map(([id]) => id),
    badKind: Object.entries(items).filter(([, x]) => !KINDS.includes(x.kind)).map(([id]) => id),
    dbWorthNotNull: act.filter((r) => r.worth !== null).length,
  };
  const final = {}; // 활성만
  for (const r of act) { const id = String(r.id); final[id] = REREAD[id] ?? items[id].worth; }
  const dist = (m) => { const d = { 1: 0, 2: 0, 3: 0 }; for (const v of Object.values(m)) d[v]++; return d; };
  const afterText = { ...final }; for (const id of CV111) afterText[id] = 3;
  const grade = (m) => {
    const t = {}; for (const r of act) { const g = r.g; t[g] ??= { 1: 0, 2: 0, 3: 0 }; t[g][m[r.id]]++; }
    return t;
  };
  // 판 수 환산(V029.txt 2-2 꼴 · 20문항 한 판에 가장 어려운 칸 4개)
  const hardest = (t) => ({ 초급: { grade: 3, w3: t[3][3], games: Math.floor(t[3][3] / 4) }, 중급: { grade: 4, w3: t[4][3], games: Math.floor(t[4][3] / 4) }, 고급: { grade: 5, w3: t[5][3], games: Math.floor(t[5][3] / 4) } });

  // L2 별 알가치 3 비율(적용 뒤 · 문항 25 이상)
  const { rows: tree } = await c.query('select id, name_ko, level, parent_id from categories');
  const cat = new Map(tree.map((r) => [r.id, r]));
  const l2of = (id) => { let r = cat.get(id); while (r && r.level > 2) r = cat.get(r.parent_id); return r?.level === 2 ? `${cat.get(r.parent_id)?.name_ko} > ${r.name_ko}` : '(분야 없음)'; };
  const byL2 = {};
  for (const r of act) { const k = l2of(r.category_id); byL2[k] ??= { n: 0, 1: 0, 2: 0, 3: 0 }; byL2[k].n++; byL2[k][afterText[r.id]]++; }
  const l2 = Object.entries(byL2).filter(([, v]) => v.n >= 25).map(([k, v]) => ({ l2: k, n: v.n, w1: v[1], w2: v[2], w3: v[3], w3pct: Math.round((100 * v[3]) / v.n) })).sort((a, b) => a.w3pct - b.w3pct);

  // ③ 글
  const ids = [...Object.keys(TEXT), ...Object.keys(QLEN3)];
  const { rows: tq } = await c.query(`select q.id, q.display_answer, q.question_text, q.explanation, q.general_hint, q.difficulty_score,
      coalesce((select array_agg(answer_text order by answer_text) from question_answers a where a.question_id=q.id and not a.is_primary),'{}') variants
      from questions q where q.id = any($1::bigint[])`, [ids]);
  const text = {};
  for (const r of tq) {
    const id = String(r.id);
    let after;
    if (TEXT[id]) after = { question: TEXT[id].q, explanation: TEXT[id].e ?? r.explanation, src: TEXT[id].src, kind: CV111.includes(+id) ? 'CV-111' : 'CV-112' };
    else {
      const [from, f] = QLEN3[id]; const j = readJson(f); const it = Array.isArray(j.items) ? j.items.find((x) => String(x.id) === id) : j.items[id];
      after = { question: it.flags.read.proposal, explanation: r.explanation, src: [`audit/${f} items[${id}].flags.read.proposal (review ${it.flags.read.review.verdict})`], kind: `QLEN240 (${from})` };
    }
    text[id] = {
      answer: r.display_answer, grade: r.difficulty_score, variants: r.variants, hint: r.general_hint,
      before: { question: r.question_text, explanation: r.explanation, qlen: len(r.question_text) },
      after: { ...after, qlen: len(after.question) },
      worth: { before: final[id], after: CV111.includes(+id) ? 3 : final[id] },
    };
  }

  // ④ L3
  const { rows: qa } = await c.query('select id, display_answer, category_id from questions where is_active and id = any($1::bigint[])', [[...L3, ...L3_HOLD].flatMap((x) => x.ids)]);
  const QA = new Map(qa.map((r) => [r.id, r]));
  const pathOf = (id) => { const p = []; let r = cat.get(id); while (r) { p.unshift(r.name_ko); r = cat.get(r.parent_id); } return p.join(' > '); };
  const l3 = L3.map((x) => ({ ...x, parentName: cat.get(x.parent).name_ko, n: x.ids.length, create: x.ids.length >= 3, items: x.ids.map((id) => ({ id, answer: QA.get(String(id))?.display_answer, now: pathOf(QA.get(String(id))?.category_id) })) }));
  const hold = L3_HOLD.map((x) => ({ ...x, items: x.ids.map((id) => ({ id, answer: QA.get(String(id))?.display_answer, now: pathOf(QA.get(String(id))?.category_id) })) }));

  const pend = readJson('g024-category-pending.json');
  const plan = {
    round: 'G025', step: 'A', builtAt: at, openGames: open,
    check, rereadApplied: REREAD,
    worth: { fileRaw6506: dist(Object.fromEntries(act.map((r) => [r.id, items[r.id].worth]))), final6506: dist(final), afterCV111: dist(afterText) },
    gradeWorth: { afterB: grade(final), afterC: grade(afterText) }, hardest: { afterB: hardest(grade(final)), afterC: hardest(grade(afterText)) },
    l2, text, l3, l3Hold: hold, pending54: pend.items.map((x) => ({ id: x.id, answer: x.answer, now: x.now, why: x.why })),
    final, // id → 적용할 worth(B)
  };
  writeJson('g025-plan.json', plan);
  console.log(JSON.stringify({ open, check: { ...check, activeNotInWorth: check.activeNotInWorth.length }, worth: plan.worth, gradeWorth: plan.gradeWorth, hardest: plan.hardest }, null, 1));
  for (const x of l2.slice(0, 10)) console.log('낮음', x.l2, x.n, `${x.w3pct}%`);
  for (const [id, t] of Object.entries(text)) console.log(id, t.answer, `${t.before.qlen}→${t.after.qlen}`, `worth ${t.worth.before}→${t.worth.after}`);
  for (const x of l3) console.log('L3', x.parentName, '>', x.name, x.n, x.create ? '신설' : '보류');
} finally { await c.end(); }
