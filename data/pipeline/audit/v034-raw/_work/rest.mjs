import fs from 'node:fs';
const D = 'data/pipeline/audit/';
// ③
fs.writeFileSync(D + 'v034-open-answers.json', JSON.stringify({ round: 'V034', items: {
  2189: { id: 2189, question: '컬링에서 선수들이 빗자루로 얼음을 문지르는 것은, 스톤의 무엇을 조절하기 위해서입니까?', primary: '진로와 거리', variants: ['방향과 거리', '거리', '방향과 속도', '진로와 속도', '속도', '경로', '거리와 방향', '거리와 진로', '거리와 속도', '진로', '방향'],
    opinion: '스위핑은 스톤이 더 멀리 가게 하고(거리) 휘어지는 정도를 줄인다(진로·방향) — 둘 다 맞는 효과다. 질문이 "무엇" 하나만 묻는데 정답이 두 개라, 변형의 낱말 하나(방향·진로·경로·속도·거리)만 쳐도 정답이 된다. 특히 방향 하나로 받는 것은 정답의 절반만 알아도 점수를 주는 꼴이고, 읽는 사람도 정답이 둘인 줄 모르고 시작한다.',
    verdict: 'narrow-question',
    proposal: '질문을 좁힌다: "컬링에서 선수들이 빗자루로 얼음을 문지르는 것은, 스톤이 가는 두 가지를 조절하기 위해서입니다. 그 두 가지는 무엇일까요?" · 정답 진로와 거리 유지 · 묶음 변형(방향과 거리 · 거리와 방향 · 거리와 진로 · 진로와 속도 · 방향과 속도 · 거리와 속도) 유지 · 낱말 하나 변형(거리 · 방향 · 진로 · 경로 · 속도)은 삭제. 질문을 안 바꾸면 차선: 낱말 하나 중 거리만 남기고 나머지 삭제 (스위핑의 가장 큰 효과).' },
  2653: { id: 2653, question: '노벨 문학상은 한 편의 작품이 아니라 무엇을 대상으로 주는 상입니까?', primary: '작가', variants: ['작가의 업적', '작가 전체', '작품 전체', '작가의 전체 작품', '작가의 평생 업적', '작가의 문학적 업적', '문학적 업적', '작가의 업적 전체'],
    opinion: '질문이 "무엇" 이라 작가(사람) · 업적/경력 전체가 모두 자연스러운 답이다. 변형이 이를 넓게 받는 것은 맞다 — 2189 와 달리 하나만 알아도 정답이 되는 절반-정답 구조가 아니라 전부 같은 뜻의 다른 말이다. 빠진 말: 업적 · 평생 업적 · 문학 활동 전체 · 문인 · 문학가.',
    verdict: 'keep-add',
    proposal: '변형 추가: 업적, 평생의 업적, 작가의 평생 공로, 문학 활동 전체, 작품 활동 전체, 문학가, 문인. 질문은 그대로.' },
} }, null, 1));

// ④ playstats
const raw = JSON.parse(fs.readFileSync(D + 'v034-raw/playstats-raw.json', 'utf8'));
const byG = {}, byGn3 = {};
for (const o of raw.items) {
  const g = o.grade ?? '?';
  for (const [m, cond] of [[byG, true], [byGn3, o.n >= 3]]) {
    if (!cond) continue;
    const t = (m[g] ??= { questions: 0, plays: 0, pre: 0, hint: 0, initial: 0, miss: 0, bot: 0 });
    t.questions++; t.plays += o.n;
    for (const b of ['pre', 'hint', 'initial', 'miss', 'bot']) t[b] += o[b];
  }
}
const pct = (m) => Object.fromEntries(Object.entries(m).map(([g, t]) => [g, { ...t, pctPre: Math.round(t.pre / t.plays * 100), pctHint: Math.round(t.hint / t.plays * 100), pctInitial: Math.round(t.initial / t.plays * 100), pctMiss: Math.round(t.miss / t.plays * 100), pctBot: Math.round(t.bot / t.plays * 100) }]));
fs.writeFileSync(D + 'v034-playstats.json', JSON.stringify({ round: 'V034', method: '사람 판(game_players 에 login_id !~ ^(bot|uic|r10_|test$|test2$|timer136$|timer1346$) 계정이 하나라도) · 공개된 문항(resolved_at 있음 · aborted 제외) · 문항마다 첫 정답(accepted · 사람) response_ms 로 넷: pre <10,000 · hint 10,000~25,000 · initial ≥25,000 · miss(아무도 못 맞힘) · bot(봇만 맞힘) · 등급 = coalesce(gq.grade, q.difficulty_score) · 기간 = 쌓인 전부(30일 제한 없음)', games: raw.games, questions: raw.items.length, byGradeAllQuestions: pct(byG), byGradeN3Plus: pct(byGn3), nDistribution: 'n=1 1480 · n=2 162 · n=3 8', items: raw.items }));

// rerate  [id, currentGrade, rerated, reason, action]
const R = [
  [25, 3, 3, '코지마 히데오는 게임 팬에겐 바로지만 일반인 기준 이름 회상(19 §3-4 게임 세부=3). 실측 2판 모두 못 맞힘 — 표본 작아 유지, 지켜볼 것.', 'keep'],
  [1337, 2, 3, '정화는 역사 인물 이름 떠올리기(설명 → 이름 꼴, 한 번 생각나야 함). 실측 2판 모두 못 맞힘(n=2) → 3. 변형 정허 · 정화 제독 추가 제안.', 'weak-change'],
  [425, 3, 2, '도플러는 사이렌 비유가 익숙해 이름이 곧 떠오른다. 실측 2판 모두 5초대 → 2. 학교 과학 용어(§3-2)라 3 도 방어 가능 — n=2 라 약한 변경.', 'weak-change'],
  [392, 3, 3, '최상위 도메인은 용어 회상. 실측 2판 못 맞힘이지만 변형 TLD · 톱레벨 도메인 있음. 유지. 변형 추가: 최상위도메인 · 탑레벨 도메인 · 도메인 끝자리.', 'keep'],
  [2800, 3, 3, '함수는 눈금자 3 의 앵커(함수). 실측 2판 7초 — 앵커 우선, 유지.', 'keep'],
  [3588, 3, 2, '감칠맛은 일상어이고 다시마 국물 단서가 답을 말해 줌(§3-3 한 단계 내림). 실측 2판 3.7초 → 2.', 'weak-change'],
  [1433, 3, 2, '수원 화성: "기록으로 원형 복원된 조선 성곽" 하면 거의 하나. 실측 2판 7초 → 2 (n=2).', 'weak-change'],
  [2087, 3, 2, '대리석은 일상어, 석회암 변성 단서가 답을 줌. 실측 2판 5초 → 2 (n=2).', 'weak-change'],
  [3322, 3, 4, '크메르 루주: 폴 포트는 알아도 정권 이름 떠올리기는 어렵다(정의 → 이름). 실측 2판 못 맞힘 → 4. 변형 크메르루주 정권 · 민주 캄푸치아 · 캄보디아 공산당 추가 제안.', 'weak-change'],
  [2611, 3, 4, '후계자: 질문이 열려 있어 정답 꼴이 흔들림(변형 8 있음). 실측 3판 중 2 못 맞힘 · 맞힌 1 은 힌트 뒤 13초 → 4 쪽.', 'change'],
  [3412, 3, 4, '만종은 유명하지만 질문이 달리의 주장 + X선 일화라 단서가 낯섦. 실측 2판 못 맞힘(힌트 뒤에도). 알가치 1 이라 4 로 올려도 손해 적음.', 'weak-change'],
  [1234, 3, 3, '사해문서: 변형 있음. 실측 2판 못 맞힘이지만 기록 사실이 어려운 질문 꼴(3~4). 유지, 지켜볼 것.', 'keep'],
  [2117, 3, 3, '공생은 눈금자 앵커(§3-2 학교 용어 3). 실측 2판 3초이지만 흰동가리와 말미잘이 대표 예 — 앵커 우선 유지.', 'keep'],
  [5025, 3, 4, '양촌리는 세대 밖(§3-4): 전원일기는 20~30대가 이름은 알아도 마을 이름은 모른다. 실측 2판 못 맞힘 → 4. 변형 양촌리 마을 추가 제안.', 'weak-change'],
  [5018, 3, 2, 'Nobody 는 2008 대중문화이고 주 플레이어 세대의 노래. 실측 2판 3.7초 → 2 (n=2).', 'weak-change'],
  [2286, 3, 3, '달팽이관 — 눈금자 반고리관과 같은 꼴 3. 실측 2판 5.6초이나 앵커 우선 유지.', 'keep'],
  [1337.1, 0, 0, '', 'x'],
  [1548, 1, 2, 'DC: 이름은 쉽지만 DC 가 바로 안 떠오르는 사람이 있다. 실측 3판: 힌트 전 1 · 힌트만 1 · 못 맞힘 1 → 2 (n=3).', 'change'],
  [1567, 2, 2, '쿼티: 실측 힌트 전 2/3 — 2 와 맞음.', 'keep'],
  [1388, 3, 3, '팀파니: 실측 힌트 뒤 2/3 — 3 과 맞음.', 'keep'],
  [1802, 2, 2, '불협화음: 힌트 전 2/3 — 맞음.', 'keep'],
  [825, 1, 1, '지퍼: 힌트 전 3/3 — 맞음.', 'keep'],
  [2055, 1, 1, '거미 다리 8: 힌트 전 2/3 — 맞음. 못 맞힌 1 은 표기 차이 가능성(변형 8개 · 여덟 있음).', 'keep'],
  [1680, 1, 1, '김밥: 힌트 전 2 · 초성 뒤 1 — 맞음.', 'keep'],
  [1337.2, 0, 0, '', 'x'],
].filter((r) => r[4] !== 'x');
const pm = Object.fromEntries(raw.items.map((o) => [o.qid, o]));
const items = {};
for (const r of R) {
  const o = pm[String(r[0])];
  items[r[0]] = { id: r[0], currentGrade: r[1], observed: { n: o.n, pre: o.pre, hint: o.hint, initial: o.initial, miss: o.miss, bot: o.bot, medianMs: o.medianMs }, rerated: r[2], reason: r[3], action: r[4] };
}
const vals = Object.values(items);
const counts = { total: vals.length, change: vals.filter((x) => x.action === 'change').length, weakChange: vals.filter((x) => x.action === 'weak-change').length, keep: vals.filter((x) => x.action === 'keep').length };
fs.writeFileSync(D + 'v034-rerate.json', JSON.stringify({ round: 'V034', note: '첫 회 · 표본 작음: 사람 판 67판, n≥3 문항 8개뿐. n=2 에서 두 판 모두 한쪽 끝인 문항 16을 참고로 더함. n=1 은 보지 않음. weak-change 는 n=2 라 약한 변경.', counts, items }, null, 1));
console.log(counts);

// ⑤
const G = {
  5496: ['agree', 'blind 가 틀린 이유는 대사를 몰라서 — 힌트는 \'애기야 가자\' 와 나란히 + 가슴을 가리키는 장면이 있어 충분.'],
  6342: ['agree', 'blind 는 \'그런데 말입니다\' 로 갔지만 힌트에 동전 값을 내라는 장면이 있다. 충분.'],
  3774: ['agree', 'blind 가 \'현대 5종\' 을 추측 — 같은 뜻이라 변형 현대 5종 · 현대5종 추가 제안.'],
  794: ['agree', '질문이 몇 개냐인데 blind 가 23쌍이라 답한 것은 단위 오류 — 쌍≠개라 오답이 맞다. 힌트가 침팬지 48 과 비교를 요구하는 점은 약하지만 유지.'],
  2365: ['agree', 'blind 가 개념 이름을 답함 — 질문이 올바른 표현을 묻고 있어 힌트가 방향을 오도하지 않음.'],
  780: ['disagree', 'blind 의 \'컷오프\' 는 컷 탈락과 같은 뜻으로 골프 중계에서 흔히 쓰이는데 변형에 없다. 변형 추가 제안: 컷오프, 컷 오프, 컷탈락.'],
  555: ['agree', 'blind 가 112 로 답했지만 힌트의 \'급하지 않은 민원\' 이 182 를 가려냄. 유지.'],
  4143: ['agree', '힌트 \'집 안을 반짝반짝\' 이 노홍철 고유. blind 의 정형돈은 오답.'],
  5044: ['agree', '힌트의 사반세기 · 단어 맞히기 게임이 가족오락관을 가려냄.'],
  4199: ['agree', '힌트 \'집안일을 떠넘기던 호통\' 이 유행어를 가리킴 — 질문에 가축 단서가 있어 충분.'],
  4558: ['agree', '힌트 \'한 여자에게 고백하는 듯한\' 이 충분하고 질문에 이미 한 여성의 이름이 있다.'],
  5500: ['agree', '이영애 \'산소 같은 여자\' 는 마몽드. blind 라네즈는 오답, 힌트(아모레퍼시픽 · 장미)가 가려냄.'],
  5502: ['agree', '힌트 \'LG생활건강 · 전지현\' 이 엘라스틴을 가려냄. blind 리엔도 LG 지만 오답.'],
  6345: ['agree-unverified', '김지민 · 뿜엔터테인먼트 · 느낌 아니까 연결은 이 라운드에서 웹으로 못 닫음 — 지식 수준 동의, 출처 확인 필요.'],
  6238: ['agree', '\'뜨거워지는\' 은 정의에 필연적. 정답 글자 아님.'],
  881: ['agree', '힌트가 게임·영화 쓰임이지만 질문이 방송 이야기 — 같은 개념이라 문제 없음.'],
  4214: ['agree', '힌트가 에이트리 + 여섯 돌 — 질문과 겹치나 정체를 가려내는 데 필요.'],
  4528: ['agree', '후렴 가사는 널리 알려져 동의. 해설의 \'밀크 후보곡 · 켄지 작곡\' 은 이 라운드에서 못 닫음(unverified).'],
  1070: ['agree', '양희은 1979 · 노무현 광고는 널리 알려진 사실.'],
  1874: ['disagree-soft', '질문이 정의를 다 말하고 힌트는 한국 도입사만 말해 단서가 약함. 제안: "이름은 \'대리인\' 을 뜻하는 스웨덴 말에서 왔고, 우리나라는 1994년 국민고충처리위원회를 세우며 행정부 전체에 이 제도를 들여왔다." (정답 글자 없음)'],
  2964: ['agree', '1975 데뷔는 위키로 닫힘(GEN). 롯데 자이언츠 응원가도 맞음.'],
  3733: ['agree', '번역 질문 예외 동의.'],
  4190: ['agree', '힌트가 질문의 출연 정보를 되풀이하고 베스트커플상만 더함 — 약하지만 유지.'],
  4430: ['agree', '정답이 한자 이름이라 정의가 곧 핵심.'],
  4453: ['agree', '겨울 금강산 = 개골산 널리 알려짐.'],
  4503: ['agree', '힌트의 \'여주인공 궁녀의 이름이 곧 제목\' 은 정답 글자를 주지 않음.'],
  4968: ['agree', '충신·효자·열녀는 정의에 필연적.'],
  6313: ['agree', '\'본인 이름으로만\' 은 정의에 필연적.'],
};
const gi = {};
for (const [k, v] of Object.entries(G)) gi[k] = { id: +k, stance: v[0], reason: v[1] };
const dis = Object.values(gi).filter((x) => x.stance.startsWith('disagree'));
fs.writeFileSync(D + 'v034-g029-reread.json', JSON.stringify({ round: 'V034', note: '28 항목(miss 14 + 그대로 둔 14 — 브리핑의 26 은 계산 착오)', counts: { total: Object.keys(gi).length, agree: Object.keys(gi).length - dis.length, disagree: dis.length }, items: gi }, null, 1));
console.log(Object.keys(gi).length, dis.length);
