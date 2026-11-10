// V049 판정 → 5 파일 verify 칸 · audit/v049-topics.json
import fs from 'fs';
const T = 'data/minigame/topics/';
// [번호, from, verdict, to]
const FOOL = {
  holiday: [[2,'한과','tooClose','곶감'],[3,'수정과','tooClose','대추차'],[4,'식혜','tooClose','매실차'],[5,'완자','tooClose','호박전'],[6,'꼬치전','tooClose','호박전'],[11,'강정','tooClose','인절미'],[12,'떡볶이떡','tooClose','시루떡'],[19,'제사','tooClose','덕담'],[21,'제초','tooClose','차례'],[22,'도포','tooClose','양복'],[22,'두루마기','tooClose','기모노'],[22,'치마저고리','tooClose','턱시도'],[31,'고속도로','tooClose','공항'],[34,'할머니 댁','tooClose','마을회관'],[35,'결혼 압박','tooClose','사촌 모임'],[37,'만두 빚기','tooClose','차례상 차리기'],[38,'쥐불놀이','tooClose','연날리기']],
  school: [[3,'현장체험학습','tooClose','학예회'],[4,'종업식','tooClose','방학식'],[8,'종업식','tooClose','입학식'],[17,'화이트보드','tooClose','교탁'],[20,'슬리퍼','tooClose','양말'],[23,'보조가방','tooClose','우산'],[28,'수능','tooClose','쪽지시험'],[29,'기말고사','tooClose','수행평가'],[30,'받아쓰기','tooClose','숙제 검사'],[31,'쪽지시험','tooClose','글짓기'],[33,'애국조회','tooClose','학급회의'],[35,'부반장','tooClose','선도부']],
  drinking: [[1,'송년회','tooClose','야유회'],[2,'뒤풀이','tooClose','회식'],[11,'콩나물국밥','tooClose','김치찌개'],[12,'황태해장국','tooClose','순대국'],[14,'컨디션','tooClose','꿀물'],[15,'블랙아웃','tooClose','속쓰림'],[21,'실내포차','tooClose','고깃집'],[25,'하이볼','tooClose','맥주'],[25,'샹그리아','tooClose','막걸리'],[28,'스파클링와인','tooClose','맥주'],[30,'노가리','tooClose','육포'],[31,'먹태','tooClose','육포'],[35,'어묵','tooClose','홍합탕']],
  cafe: [[20,'컵케이크','tooClose','마카롱'],[28,'파이','tooClose','마들렌']],
  streetfood: [[16,'떡꼬치','tooClose','닭꼬치'],[20,'어묵','tooClose','순대'],[22,'식혜','tooFar','호떡'],[23,'떡꼬치','tooClose','인절미'],[27,'도넛','tooClose','핫도그'],[30,'식혜','tooFar','인절미']],
};
// 그 밖의 op: [op, 번호, name, fix]
const OTH = {
  holiday: [['diff',7,'육전','3 → 2 (명절 전의 대표 — 널리 앎)'],['diff',29,'강강술래','3 → 2']],
  school: [['variant',20,'실내화','"실내화 주머니" 빼기 — 실내화를 넣는 가방이라 다른 물건(책가방 fool 로도 쓰임)']],
  drinking: [['variant',30,'먹태','"먹태깡" 빼기 — 과자 상표라 다른 것'],['sub',7,'술게임','술자리 문화 → 술게임 (369게임 · 아이엠그라운드와 같은 칸)']],
  cafe: [['diff',26,'마들렌','3 → 2']],
  streetfood: [['diff',26,'찹쌀떡','3 → 2'],['diff',28,'오징어튀김','3 → 2']],
};
const UNSURE = {
  holiday: ['liar-holiday-038: 달집태우기 · 쥐불놀이 · 부럼 깨기 — 정월대보름 풍습이라 20~40대 전부가 아는지 애매(달집태우기 diff 3 유지, 낯설면 빼도 됨). 부럼 깨기는 fool 로만 쓰임','liar-holiday-023: 복주머니 fool 복조리 — 30대 이하에겐 약간 낯설 수 있음','liar-holiday-017·018: 세배 ↔ 덕담은 같은 장면(세배 때 하는 말)이라 설명이 많이 겹침 — 둘 다 유지'],
  school: ['liar-school-001·003: 수학여행 · 소풍 · 수련회 · 현장체험학습은 한 묶음이라 어느 쪽 설명도 서로 가까움 — fool 한 칸씩만 고침','liar-school-026: 생활기록부 fool 통지표(성적표의 옛 말)는 젊은 층에게 낯설 수 있음 — 유지','liar-school-034: 청소당번 fool 주번 — 요즘 학교엔 거의 없음, 유지'],
  drinking: ['liar-drinking-010~013: 숙취 → 해장국 → 콩나물국밥 → 북엇국이 "속 푸는 국" 설명으로 많이 겹침 — 4개 모두 유지하나 해장국/콩나물국밥은 같은 설명이 나올 수 있음(하나 빼도 됨)','liar-drinking-030·031: 먹태 ↔ 노가리 — 둘 다 마른 명태 안주라 설명이 겹침(서로 fool 로 쓰였던 것은 고침) — 하나 빼도 됨','liar-drinking-003~006: 건배 · 원샷 · 러브샷 · 벌주 네 개가 서로 fool — 각각의 설명은 달라 유지','liar-drinking-009: 아이엠그라운드 보편성(diff 3) — 20~40대는 대부분 앎'],
  cafe: ['liar-cafe-023: 크로플 — 한철 유행 의심(2021~) 하지만 카페 메뉴로 자리 잡음','liar-cafe-006: 아인슈페너 diff 3 — 커피 마시는 사람은 아는 편, 유지','liar-cafe-033: 쇼케이스 fool 냉장고 — 가깝지만 "케이크 진열" 설명이 나오면 갈림, 유지','liar-cafe-030: 토스트 fool 샌드위치 — 가깝지만 유지(길거리 간식에도 토스트 있음)'],
  streetfood: ['liar-streetfood-022·030: 팥죽 · 메밀묵은 "길거리 간식" 이라기보다 전통 간식 — 이 주제의 약한 쪽(G055 판단 유지)','liar-streetfood: 붕어빵 · 호떡 · 핫도그 · 츄러스 · 떡볶이 같은 대표가 항목이 아니라 fool 로만 나옴 — 30 은 하한 28 이상이지만 다음 보충 때 우선 후보','liar-streetfood-013: 소프트아이스크림 fool 붕어싸만코 — 아이스크림이긴 하나 "길거리" 가 아님, 유지'],
};
const items = {}; const sets = {}; const all = { fool: 0, ok: 0, tooClose: 0, tooFar: 0, bad: 0 };
for (const n of Object.keys(FOOL)) {
  const file = T + 'liar-' + n + '.json';
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fixes = []; const probs = new Set(); const cnt = { tooClose: 0, tooFar: 0, bad: 0 };
  const byNum = new Map();
  for (const [num, from, v, to] of FOOL[n]) { if (!byNum.has(num)) byNum.set(num, []); byNum.get(num).push({ from, verdict: v, to }); }
  for (const [num, rs] of byNum) {
    const it = j.items[num - 1];
    if (!it || it.id !== 'liar-' + n + '-' + String(num).padStart(3, '0')) throw new Error('번호 불일치 ' + n + num);
    for (const r of rs) { if (!it.fool.includes(r.from)) throw new Error('fool 없음 ' + it.id + ' ' + r.from); cnt[r.verdict]++; }
    fixes.push({ op: 'fool', id: it.id, name: it.name, replace: rs }); probs.add(num);
  }
  const opc = { diff: 0, era: 0, sub: 0, variant: 0 };
  for (const [op, num, name, txt] of OTH[n] || []) {
    const it = j.items[num - 1]; if (it.name !== name) throw new Error('이름 불일치 ' + n + num);
    opc[op]++; probs.add(num); fixes.push({ op, id: it.id, name, fix: txt });
  }
  fixes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const foolN = j.items.length * 3; const okN = foolN - cnt.tooClose - cnt.tooFar - cnt.bad;
  const status = probs.size <= 3 ? 'verified' : 'candidate';
  j.verify = { round: 'V049', checkedAt: new Date().toISOString(), itemsChecked: j.items.length, foolAudit: { fools: foolN, ok: okN, ...cnt }, problemItems: probs.size, counts: { remove: 0, ...opc }, fixes, unsure: UNSURE[n], verdict: status === 'verified' ? 'verified' : 'candidate', why: '라이어 새 주제 전수 판정: 문제 항목 ' + probs.size + '/' + j.items.length + ' (fool tooClose ' + cnt.tooClose + ' · tooFar ' + cnt.tooFar + ' · bad ' + cnt.bad + ' · remove 0 · diff ' + opc.diff + ' · era ' + opc.era + ' · sub ' + opc.sub + ' · 변형 ' + opc.variant + ') — 적용은 G056' };
  j.status = status;
  fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
  sets['liar-' + n] = { items: j.items.length, problemItems: probs.size, fool: foolN, ...cnt, remove: 0, ...opc, dup: 0, okFool: okN, status };
  for (const k of ['tooClose', 'tooFar', 'bad']) all[k] += cnt[k];
  all.fool += foolN; all.ok += okN;
  j.items.forEach((it, i) => {
    const num = i + 1; const rs = byNum.get(num) || [];
    const oth = (OTH[n] || []).filter((o) => o[1] === num).map((o) => ({ op: o[0], fix: o[3] }));
    items[it.id] = { verdict: probs.has(num) ? 'fix' : 'ok', fool: it.fool.map((f) => { const r = rs.find((x) => x.from === f); return r ? { f, v: r.verdict, to: r.to } : { f, v: 'ok' }; }), ...(oth.length ? { other: oth } : {}) };
  });
}
fs.writeFileSync('data/pipeline/audit/v049-topics.json', JSON.stringify({ round: 'V049', total: Object.keys(items).length, sets, fools: all, items }, null, 1) + '\n');
console.log(Object.entries(sets).map(([k, v]) => k + ' ' + JSON.stringify(v)).join('\n'), '\n', all);
