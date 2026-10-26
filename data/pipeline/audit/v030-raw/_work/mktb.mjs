import fs from 'node:fs';
const L=JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/g023-lists.json','utf8')).timeBound;
const T=JSON.parse(fs.readFileSync('../targets.json','utf8')).items;
const pin={
89:{target:'question',fixText:"2026년 현재 대한민국에서 유일하게 '특별자치시' 지위를 갖고 있는 도시는?",why:'현재 지위 — 기준 시점 한 조각'},
134:{target:'explanation',fixText:"제임스 카메론 감독이 연출했고, 2026년 기준으로도 전 세계 역대 흥행 1위 기록을 지키고 있는 영화다.",why:'해설의 역대 1위는 기록이 바뀌면 틀림 — 시점 명시'},
1113:{target:'question',fixText:'2보다 큰 모든 짝수는 소수 두 개의 합으로 나타낼 수 있다는, 2026년 현재까지 증명되지 않은 수학의 미해결 문제는?',why:'증명되면 틀려짐 — 기준 시점'},
1425:{target:'question',fixText:'가우디가 설계해 1882년에 착공했으나 그가 세상을 떠난 뒤에도 2026년 현재 공사가 이어지고 있는 바르셀로나의 성당은?',why:'완공되면 틀려짐 — 기준 시점'},
6697:{target:'question',fixText:'2026년 현재 MBC 표준FM에서 방송하는 라디오 프로그램입니다. 방송 내용을 모은 월간 책자를 매달 전국 중소기업은행 지점에서 무료로 나눠 줍니다. 목요일에는 남자 진행자 중심으로 이름을 바꿔 방송하고 시그널 음악도 바뀝니다. 이 프로그램은?',why:'현재 편성 사실 — 기준 시점'},
};
const keepWhy={2929:'2026 월드컵 4강은 프랑스·스페인·잉글랜드·아르헨티나(웹) — 아시아 최고 4강 그대로',1689:'해설이 이미 2026-07 변화를 적음',4078:'연재 체계 변화 가능하나 확인 못 함 — 그대로(CV)',6680:'필름 발견 가능성은 낮음 — 그대로'};
const out={meta:{builtAt:new Date().toISOString(),n:L.length,note:'VERIFY 직접 판정(판정자 없음). target=question|explanation — pin 의 fixText 는 그 칸의 제안 문장'},items:{}};const c={};
for(const u of L){const t=T[u.id];if(!t){out.items[u.id]={verdict:'drop',why:'비활성(대상 밖)'};continue;}
const p=pin[u.id];out.items[u.id]=p?{verdict:'pin',...p}:{verdict:'keep',why:keepWhy[u.id]||(u.notes.some(n=>n.v?.year)?'이미 시점이 질문·해설에 있거나 지난 사실':'바뀔 일이 사실상 없거나 변화는 질문 밖(힌트·해설 부수 문구)')};
const v=out.items[u.id].verdict;c[v]=(c[v]||0)+1;}
out.meta.counts=c;fs.writeFileSync('../../v030-timebound.json',JSON.stringify(out,null,1));console.log(c);
