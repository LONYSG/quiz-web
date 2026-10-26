import fs from 'node:fs';
const A = 'C:/work/quiz-web/data/pipeline/audit', W = A + '/v028-raw/_work/';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const I = J(W + 'items.v028.json'); const T = J(A + '/v028-targets.json'); const TI = T.items; const rv = {};
for (let k = 1; k <= 16; k++) for (const x of J(W + 'r' + k + '.out.json')) rv[x.id] = x;
const rc = J(W + 'rchk.json'); const longSet = new Set(rc.long.filter((x) => !x[2]).map((x) => String(x[0]))); const numSet = new Set(rc.numChange.map((x) => String(x[0])));
const WEB = {
  4191: ['true', 'https://www.dailian.co.kr/news/view/905486/', "'양심냉장고' 1996년 방송(김영희 PD 인터뷰) — 판정자 의심(1992) 기각, 질문 1996 맞음"],
  5419: ['true', 'https://en.wikipedia.org/wiki/National_Defense_Corps_incident', '1심(군사재판 사흘) 사령관 무죄 → 여론 악화 → 재심 사형 1951-08-13 — 힌트 "재판 사흘 만에 무죄" 맞음(판정자 의심 기각)'],
  4457: ['unverified', 'https://www.seoul.co.kr/news/2005/08/04/20050804308001', '우도는 제주 부속섬 중 가장 큼(확인). 전국 두 번째 섬이라는 뜻이면 오류(거제·진도·남해 등이 더 큼) — 힌트 문구를 "제주 부속 섬 중 가장 큰" 으로 fix 권고'],
  6291: ['unverified', 'https://www.imaeil.com/page/view/2011082607345967833', '이만수는 대구중·대구상고 출신(확인) · 출생지 항목은 못 찾음 — 힌트 "철원 출신" 근거 없음 → 의심 유지'],
  5806: ['false', 'https://developer.valvesoftware.com/wiki/Counter-Strike', 'CS 베타 1.0 = 1999-06-19(여러 출처) — 질문 "6월 18일" 오류 → 질문 fix'],
  6226: ['true', 'https://doodles.google/doodle/halloween-2000-by-guest-illustrator-lorie-loeb/', '2000-10-31 핼러윈 = 첫 움직이는 두들(구글 공식) — 판정자 의심 기각'],
  4467: ['unverified', null, '주령구 진품 소장처·불에 탄 여부 못 찾음 — 해설 의심 유지'],
  4610: ['unverified', null, '천마도장니 국보 207호는 확인 · 지정 연도(1982) 못 찾음'],
  6425: ['true', 'https://m.go.seoul.co.kr/news/2018/04/16/20180416035007', '개관(1978) 당시 대극장 3,800석 이상 — 해설 맞음(판정자 의심 기각)'],
  6255: ['unverified', 'https://www.swatchgroup.com/en/services/archive/2012/breguet-bicentennial-first-wristwatch', '브레게가 1810 주문·1812 납품한 나폴리 왕비 카롤린 뮈라 시계가 통설(브레게 사 자료) · 1806 조제핀 설은 출처 못 찾음 — 판정자 의심 유지']
};
// 제보 5
const R5 = { 3813: { src: 'V027', verdict: '분야 오분류 — "자연과학 > 식물 > 꽃·꽃말" 이 아니라 질문 단서가 일본 왕실 문장·여권(나라의 상징)', suggest: '인문·사회 > 세계 지리·국가·수도 (국가 상징) — 또는 생활·상식 쪽 일본 문화', v2: 2, note: 'V027 v2 2 · category ok:true 로 판정했으나 찬종 제보 #58 이 맞음' },
  1619: { src: 'V027', verdict: '둘째 문장("아이슬란드는 이 방식으로 전력과 난방을 크게 해결합니다")이 대표 사례 단서 = CV-86 questionCue 꼴', suggest: '질문은 첫 문장만("땅속의 뜨거운 증기나 열수를 끌어올려 터빈을 돌리는 발전 방식은 무엇일까요?") · 힌트로 "아이슬란드는 전력과 난방의 대부분을 이 방식으로 해결한다". V027 의 읽기 ⓑ 제안(아이슬란드 문장 유지)은 쓰지 말 것', v2: 2, note: 'V027 v2 2 · 단서가 거의 답(첫 문장이 이미 정의) — 1 로 내릴 여지(conf mid)' },
  2096: { src: 'V028', verdict: '질문에 종목(테니스)이 없다 → "게임이 6 대 6" 만으로는 무슨 경기인지 알 수 없음(읽기 ⓑ · 비유일 경계)', suggest: '"테니스에서 한 세트의 게임 점수가 6 대 6이 되었을 때, 경기가 끝없이 길어지는 것을 막으려고 치르는 방식을 무엇이라 합니까?" (정답·힌트 불변 · 분야 라벨이 이미 테니스)', v2: 3, note: 'v2 3 · 읽기 a 로 판정했던 것은 판정자가 분야 라벨(테니스)을 읽고 풀었기 때문 — 읽기 판정은 분야 라벨 없이 해야 한다는 교훈(CV)' },
  1438: { src: 'V028', verdict: '"그린 사람의 이름이 거의 남아 있지 않은" 은 민화를 특정하는 대표 단서가 아니라 "없음" 을 말하는 낯선 어구(#59 "무슨 말인지 모르겠음"). 앞 단서(서민 · 집 꾸밈 · 복 빎)가 민화를 가리키므로 유일성은 대체로 OK(세화·책가도는 경계)', suggest: '"서민들이 집을 꾸미고 복을 빌려고 그린 그림이 있습니다. 대부분 누가 그렸는지 이름이 전해지지 않습니다. 이 그림은 무엇일까요?" · v2 2 유지(conf low)', v2: 2, note: '읽기 ⓐ 로 판정 → ⓑ 로 정정 제안' },
  500: { src: 'V028', verdict: '두 번 건너는 꼴: 시간제 일 → 아르바이트(단어는 질문에 안 나옴) → 독일어. "아르바이트" 라는 낱말을 모르면 질문이 성립하지 않음(#62 "무슨 말인지 모르겠음") → 읽기 ⓑ · v2 3 은 타당(건너기 2)', suggest: '"\'아르바이트\'는 한국에서는 시간제로 하는 일을 가리키지만, 원래 언어에서는 \'노동\' 전반을 뜻하는 흔한 낱말입니다. 이 말은 어느 나라 말에서 왔나요?" — 낱말을 밝히면 건너기가 1 번이 되어 v2 2 로 내려감(설계가 택일)', v2: 3, note: '변형 독일/독어 제안은 판정자 변형 제안과 일치' } };
const out = { meta: { builtAt: new Date().toISOString(), round: 'V028', half: 'verify', targets: T.requested, active: T.active, activeAtStart: T.activeAtStart, overlap: T.overlap.length, note: 'items[id] — v2 판정 + 같이 보는 표시 아홉 + familiarity.source + half + overlap. 사람 데이터 없음. DB 쓰기 없음. 변형 제안은 원자료(정규화 뒤 중복 제거).', reported: R5, webChecked: Object.fromEntries(Object.entries(WEB).map(([k, v]) => [k, { result: v[0], source: v[1], note: v[2] }])) }, items: {} };
let rcount = { ok: 0, fix: 0, reject: 0 };
for (const [id, r] of Object.entries(I)) { const x = rv[id]; if (x) rcount[x.verdict]++;
  const mach = []; if (longSet.has(id)) mach.push('200자 초과인데 qlenOver 아님'); if (numSet.has(id)) mach.push('새 숫자 추가');
  out.items[id] = { v2: r.v2, why: r.why, confidence: r.confidence, tags: r.tags, familiarity: r.familiarity, h9: r.h9, flags: { unique: r.flags.unique, fact: r.flags.fact, variants: r.flags.variants, read: { grade: r.flags.read.grade, proposal: r.flags.read.proposal, qlenOver: !!r.flags.read.qlenOver, glossed: !!r.flags.read.glossed, review: x ? { verdict: x.verdict, leak: x.leak, factChange: x.factChange, better: x.better, fixText: x.fixText, machine: mach.length ? mach : undefined } : null }, timeBound: r.flags.timeBound, category: r.flags.category, inputForm: r.flags.inputForm, sensitive: r.flags.sensitive }, cur: r.cur, half: 'verify', overlap: r.overlap }; }
fs.writeFileSync(A + '/v028-rerate.json', JSON.stringify(out)); console.log('review', rcount, 'sizeMB', (fs.statSync(A + '/v028-rerate.json').size / 1e6).toFixed(2));
