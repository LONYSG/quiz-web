import fs from 'fs';
const D='tmp55/';
const F={
 koMG:['P-ko-모닝글로리_구름.txt','https://ko.wikipedia.org/wiki/모닝글로리_구름'],
 enMG:['P-en-Morning_Glory_cloud.txt','https://en.wikipedia.org/wiki/Morning_Glory_cloud'],
 koBV:['P-ko-비너스의_띠.txt','https://ko.wikipedia.org/wiki/비너스의_띠'],
 enBV:['P-en-Belt_of_Venus.txt','https://en.wikipedia.org/wiki/Belt_of_Venus'],
 koSP:['P-ko-스프라이트_(번개).txt','https://ko.wikipedia.org/wiki/스프라이트_(번개)'],
 enSP:['P-en-Sprite_(lightning).txt','https://en.wikipedia.org/wiki/Sprite_(lightning)'],
 koBL:['P-ko-벌루닝.txt','https://ko.wikipedia.org/wiki/벌루닝'],
 koPO:['P-ko-포로로카.txt','https://ko.wikipedia.org/wiki/포로로카'],
 enTB:['P-en-Tidal_bore.txt','https://en.wikipedia.org/wiki/Tidal_bore'],
 koHB:['P-ko-하부브.txt','https://ko.wikipedia.org/wiki/하부브'],
 enHB:['P-en-Haboob.txt','https://en.wikipedia.org/wiki/Haboob'],
 koPG:['P-ko-구조토.txt','https://ko.wikipedia.org/wiki/구조토'],
 koBB:['P-ko-폭탄먼지벌레.txt','https://ko.wikipedia.org/wiki/폭탄먼지벌레'],
 enBB:['P-en-Bombardier_beetle.txt','https://en.wikipedia.org/wiki/Bombardier_beetle'],
 koGF:['P-ko-유리개구리.txt','https://ko.wikipedia.org/wiki/유리개구리'],
 enGF:['en-Glass_frog.txt','https://en.wikipedia.org/wiki/Glass_frog'],
 koBE:['P-ko-통안어과.txt','https://ko.wikipedia.org/wiki/통안어과'],
 enBE:['P-en-Barreleye.txt','https://en.wikipedia.org/wiki/Barreleye'],
 enMD:['P-en-McMurdo_Dry_Valleys.txt','https://en.wikipedia.org/wiki/McMurdo_Dry_Valleys'],
 koAA:['P-ko-아르헨티나개미.txt','https://ko.wikipedia.org/wiki/아르헨티나개미'],
 enAA:['P-en-Argentine_ant.txt','https://en.wikipedia.org/wiki/Argentine_ant'],
 koRI:['P-ko-리차트_구조.txt','https://ko.wikipedia.org/wiki/리차트_구조'],
 enRI:['P-en-Richat_Structure.txt','https://en.wikipedia.org/wiki/Richat_Structure'],
 koWL:['P-ko-월리스선.txt','https://ko.wikipedia.org/wiki/월리스선'],
 enWL:['P-en-Wallace_Line.txt','https://en.wikipedia.org/wiki/Wallace_Line'],
 enCE:['P-en-Cenote.txt','https://en.wikipedia.org/wiki/Cenote'],
};
const bad=[];
const Q=(k,text,quote)=>{ const [f,url]=F[k]; const src=fs.readFileSync(D+f,'utf8'); if(!src.includes(quote)) bad.push(k+' :: '+quote.slice(0,70)); return {text,url,quote}; };
const items=[];
const add=o=>items.push(o);
const base={spelling:'?',legend:false,care:'',hintRisk:false,spellNote:'',major:'자연과학',gradeGuess:5};

add({...base,answer:'모닝글로리 구름',also:['모닝 글로리 구름','Morning Glory cloud','모닝글로리'],mid:'지구과학·기상',
 core:Q('koMG','호주 북부 카펀테리아만에서 해마다 보이는, 길이 최대 1,000km의 롤 모양 구름(고립파)',
  '모닝글로리 구름은 롤 구름 또는 아치 구름으로, 길이가 최대 1,000 킬로미터 (620 mi)에 달하며'),
 story:[
  Q('enMG','원주민 가르와족은 이 구름을 오래전부터 "칸골기"라 불렀고, 호주 공군 조종사들이 1942년에 처음 보고했다','The local Garrwa Aboriginal people called it kangólgi. Royal Australian Air Force pilots first reported this phenomenon in 1942.'),
  Q('koMG','버크타운에는 9월 말~11월 초 이 구름을 타려는 글라이더 조종사들이 모여든다','이 마을은 이 현상을 타려는 활공 조종사들을 끌어들인다.'),
  Q('enMG','마을 술집에서는 냉장고에 서리가 끼고 탁자 모서리가 말려 올라가면 구름이 올 만큼 습하다는 속설이 있다','Local weather lore in the area suggests that when the fridges frost over and the café tables\' corners curl upwards at the Burketown Pub, there is enough moisture in the air for the clouds to form.')],
 hintIdea:Q('koMG','"행성에서 가장 큰 파동"이라고 불린다','그들은 "행성에서 가장 큰 파동"이라고 불린다.'),
 why:'하늘에 1,000km짜리 구름 파도가 굴러오고, 사람들이 글라이더로 그 위에 올라탄다',hintRisk:true,
 care:'속설(술집 냉장고)은 legend 성격 — 해설에서 "~라고 합니다". 카펀테리아만 남부가 예측 가능하게 관찰되는 유일한 곳(ko 위키 첫 단락).'});

add({...base,answer:'비너스의 띠',also:['비너스의띠','Belt of Venus','Venus\'s girdle','antitwilight arch'],mid:'지구과학·기상',
 core:Q('enBV','해 뜨기 전·해 진 뒤 반대쪽 하늘 지평선 위에 분홍빛 띠가 보이고, 그 아래 어두운 띠는 지구 자신의 그림자다','As twilight progresses, the arch is separated from the horizon by the dark band of Earth\'s shadow, or the "twilight wedge".'),
 story:[
  Q('enBV','분홍빛 띠는 관찰자를 둘러싸고 지평선 위 10~20도쯤까지 뻗는다','It is a pinkish glow that surrounds the observer, extending roughly 10–20° above the horizon.'),
  Q('enBV','이름은 그리스 여신 아프로디테(로마의 비너스)의 허리띠에서 따왔다','The name of the phenomenon alludes to the cestus, a girdle or breast-band, of the Ancient Greek goddess Aphrodite, customarily equated with the Roman goddess Venus.'),
  Q('koBV','한국어 위키백과: 해돋이·해넘이 시간대에 나타나는 대기 현상','비너스의 띠(영어: Belt of Venus, Venus\'s Girdle, antitwilight arch, antitwilight)는 해돋이 또는 해넘이 시간대에서 발생할 수 있는 일종의 대기 현상이다.')],
 hintIdea:Q('enBV','개기월식 때 붉게 물든 달에서도 비슷한 효과를 볼 수 있다','A similar effect can be seen on a "blood moon" during a total lunar eclipse.'),
 why:'노을 반대편 하늘의 어두운 띠가 지구의 그림자라는 것을 눈으로 볼 수 있다',hintRisk:true,
 care:'한국어 위키는 "보라색", 영어 위키는 "pinkish glow"로 색 표현이 갈린다 — 색은 묻지 않는다.'});

add({...base,answer:'레드 스프라이트',also:['스프라이트','red sprite','sprite','붉은 요정'],mid:'지구과학·기상',
 core:Q('koSP','뇌우 구름 위 중간권에서 일어나는 대규모 전기 방전으로 밤하늘에 붉게 번쩍인다','스프라이트(sprite) 또는 레드 스프라이트(red sprite)는 뇌우 구름 또는 적란운 위의 중간권에서 발생하는 대규모 전기 방전으로, 밤하늘에 깜박이는 다양한 시각적 모양을 생성한다.'),
 story:[
  Q('enSP','1925년 노벨상 수상자 윌슨이 이론적으로 상층대기 방전을 예측했고, 1956년 본인이 스프라이트일 수도 있는 것을 목격했다','Nobel laureate C. T. R. Wilson had suggested in 1925, on theoretical grounds, that electrical breakdown could occur in the upper atmosphere, and in 1956 he witnessed what possibly could have been a sprite.'),
  Q('enSP','1989년 미네소타대 연구진이 처음 촬영했고 그 뒤 영상으로 수천 번 잡혔다(영어 위키 본문에 7월 4일·6일이 엇갈려 날짜는 쓰지 않는다)','They were first photographed on July 4, 1989, by scientists from the University of Minnesota and have subsequently been captured in video recordings thousands of times.'),
  Q('enSP','몇 해 뒤 잡힐 듯 말 듯한 성질 때문에 공기의 요정(sprite)이라는 이름이 붙었다','Several years after their discovery they were named "sprites" (air spirits) after their namesake mythological entity based on their elusive nature.')],
 hintIdea:Q('enSP','50~90km 상공에 무리 지어 나타난다','They often occur in clusters above the troposphere at an altitude range of 50–90 km'),
 why:'조종사들이 오래 "봤다"고 해도 믿기 어렵던 번개가 1989년 우연히 카메라에 잡혔다',hintRisk:true,
 care:'답을 "스프라이트"로만 두면 음료와 혼동 — 질문에 "번개·뇌우 위"가 들어가야 한다. 영어 위키 첫 촬영 날짜가 7월 4일/6일로 엇갈려 날짜 쓰지 않음.',
 spellNote:'한국어 위키 표제어는 "스프라이트 (번개)". 음료와 겹치지 않게 "레드 스프라이트"를 answer 로, "스프라이트"를 also 에.'});

add({...base,answer:'벌루닝',also:['ballooning','송기법','거미 벌루닝'],mid:'동물',
 core:Q('koBL','거미가 거미줄을 공중으로 내보내 바람과 대기의 힘을 타고 날아가는 이동 행동','벌루닝(ballooning)은 거미가 거미줄을 공중으로 내보낸 뒤 공기의 흐름과 대기의 힘을 이용하여 공중으로 이동하는 행동이다.'),
 story:[
  Q('koBL','거미는 높은 곳에 올라 배를 들어 올리고 가느다란 거미줄을 여러 가닥 내보낸다','거미는 풀이나 나뭇가지와 같은 높은 지점으로 올라간 뒤 배를 들어 올리고 여러 가닥의 가느다란 거미줄을 방출한다.'),
  Q('koBL','바람만으로 설명되던 이 행동에서 대기 전기장이 거미를 들어 올릴 수 있음이 2018년 실험으로 확인됐다','2018년 연구에서는 거미가 자연계에서 나타날 수 있는 수준의 전기장을 감지하며 전기장이 벌루닝 행동을 유발하고 거미를 들어 올리는 힘을 제공할 수 있다는 사실이 실험적으로 확인되었다.'),
  Q('koBL','바람이 너무 센 날에는 오히려 날기 어렵다','바람이 지나치게 강한 경우에는 벌루닝이 오히려 어려워지며')],
 hintIdea:Q('koBL','한국어로는 송기법이라고 옮기기도 한다','한국어에서는 송기법(送氣法)이라고 번역되기도 한다.'),
 why:'날개 없는 거미가 전기의 힘으로 하늘을 난다',
 care:'한국어 위키백과 한 문서가 주 출처(2018년 원논문은 열지 않음). 질문에는 "전기장" 대신 "거미줄을 띄워 날아간다"까지만.',
 spellNote:'한국어 위키백과 표제어 "벌루닝".'});

add({...base,answer:'포로로카',also:['Pororoca','아마존 조석해일'],mid:'지구과학·기상',
 core:Q('koPO','아마존강 하류에서 바닷물이 강을 거슬러 올라오는 조석해일 — 4m 높이 파도가 내륙 800km까지 올라온다','포로로카(포르투갈어: Pororoca [pɔɾɔˈɾɔkɐ][*])는 아마존강 하류에서 상류 방향으로 발생하는 조석해일으로, 4미터 높이의 파도가 내륙 방향으로 800킬로미터까지 올라온다.'),
 story:[
  Q('koPO','이름은 고대 투피어로 "큰 소리로 울리다"라는 뜻이다','어원은 고대 투피어로 "큰 소리로 울리다"라는 의미이며'),
  Q('koPO','서핑 선수들에게 인기가 많아 1999년부터 해마다 챔피언십이 열린다','서핑 선수들에게 매우 인기있는 현상으로, 1999년 이래로 매년 이 현상이 발생하는 상도밍고스도카핑에서 챔피언십이 개최된다.'),
  Q('enTB','세계에서 가장 큰 조석해일은 중국 첸탕강의 것으로 높이 9m, 시속 40km','Qiantang River, China, which has the world\'s largest bore, up to 9 m (30 ft) high, traveling at up to 40 km/h (25 mph)')],
 hintIdea:Q('koPO','주로 강이 대서양과 만나는 곳에서 2~3월에 생긴다','주로 강이 대서양과 만나는 부분에서 발생하며, 매년 2월에서 3월 사이에 발생한다.'),
 why:'강물이 거꾸로 흐르고 그 파도를 타고 서퍼들이 달린다',
 care:'가장 큰 조석해일은 아마존이 아니라 첸탕강(영어 위키) — "세계 최대"로 묻지 않는다. 한국어 위키 문장에 "조석해일으로" 오탈자가 있다(원문 그대로 인용).'});

add({...base,answer:'하부브',also:['haboob','하부브 모래폭풍'],mid:'지구과학·기상',
 core:Q('enHB','뇌우의 하강기류가 사막의 흙먼지를 쓸어 올려 만드는 거대한 먼지 폭풍','is an atmospheric density current forming an intense dust storm generated by strong winds from the downdrafts of thunderstorms or, less commonly, weather fronts.'),
 story:[
  Q('enHB','먼지 벽은 폭 100km, 높이 수 km에 이르기도 한다','This wall of dust can be up to 100 km (62 mi) wide, and several kilometers high.'),
  Q('enHB','이름은 수단의 먼지 폭풍을 가리키던 아랍어에서 왔고, 미국 애리조나에서는 1999년 이후 흔한 영어 낱말이 됐다','The term was originally used to describe dust storms in Sudan, and was first applied to North American dust storms in 1972 by Robert Ingram and co-authors. The term came into common English usage in Arizona after 1999.'),
  Q('enHB','수단 하르툼에서는 높이 2,000m, 시속 70km, 6시간 반 넘게 이어진 기록이 있다','In Khartoum, Sudan, haboobs have been historically documented as reaching up to 2,000 m (7,000 ft) high, advancing at up to 70 km/h (45 mph), and lasting as long as 6 1/2 hours.')],
 hintIdea:Q('enHB','화성과 토성의 위성 타이탄에서도 관측됐다','and have also been observed on Mars and Titan'),
 why:'높이 수 km 먼지 벽이 도시를 덮치는데 이름은 아랍어 "불다"에서 왔다',
 care:'한국어 위키 문서는 두 문장뿐 — 이야기 줄은 영어 위키에서. 한국어 표기는 위키 표제어 "하부브".'});

add({...base,answer:'구조토',also:['patterned ground','구조 토양'],mid:'지구과학·기상',
 core:Q('koPG','얼고 녹기를 되풀이하는 땅에서 돌과 흙이 저절로 다각형·원·줄무늬로 정렬되는 지형','구조토(patterned ground)는 주빙하 지역에서 지면 물질의 변형으로 형성되는 기하학적 형태의 뚜렷하고 흔히 대칭적인 자연의 패턴을 의미한다.'),
 story:[
  Q('koPG','사람이 예술적으로 만든 것으로 오해받기도 한다','구조토와 관련된 기하학적 형태와 패턴은 종종 인간이 예술적으로 만든 것으로 오해받기도 한다.'),
  Q('koPG','형성 원리는 오랫동안 과학자들을 당혹하게 했다','구조토의 형성 메커니즘은 오랫동안 과학자들을 당혹하게 했으나'),
  Q('koPG','극지방뿐 아니라 아타카마 사막과 화성에서도 관찰됐다','극도로 건조한 아타카마 사막과 화성에서도 관찰된 바 있다.')],
 hintIdea:Q('koPG','북극·남극·오스트레일리아 아웃백 같은 외딴 곳에서 주로 보인다','구조토는 일반적으로 북극, 남극, 오스트레일리아의 아웃백과 같은 외딴 지역에서 발견되지만'),
 why:'아무도 그리지 않았는데 땅 위에 완벽한 다각형·원이 그려진다',
 care:'한국어 위키 출처 한 문서(번역문) — 단정 대신 "알려졌다" 어조.'});

add({...base,answer:'폭탄먼지벌레',also:['bombardier beetle','폭탄 먼지벌레'],mid:'동물',
 core:Q('koBB','복부의 화학 반응으로 꽁무니에서 100도 이상 고온의 방어 물질을 쏜다','복부 내의 특수한 화학 반응으로 꽁무늬에서 섭씨 100도 이상 고온의 방어 물질을 발사하는 것에 착안하여'),
 story:[
  Q('enBB','과산화수소와 하이드로퀴논이 배 속 방에서 만나 촉매로 반응한다','The spray is produced from a catalyzed reaction between hydroquinone and hydrogen peroxide, an aqueous solution of which is stored in the pygidial glands in the beetle\'s abdomen.'),
  Q('enBB','반응 압력으로 입구 밸브가 닫혀 자기 몸속 기관은 보호된다','The resultant pressure buildup forces the entrance valves from the reactant storage chambers to close, thus protecting the beetle\'s internal organs.'),
  Q('enBB','발사는 한 번에 약 70번의 맥동, 초당 500번쯤 이어진다','The flow of reactants into the reaction chamber and subsequent ejection occur in a series of about 70 pulses, at a rate of about 500 pulses per second.')],
 hintIdea:Q('enBB','위협받으면 펑 소리와 함께 뜨겁고 지독한 액체를 뿜는다','when disturbed, they eject a hot, noxious chemical spray from their pygidial glands with a popping sound'),
 why:'스스로 화상을 입지 않고 몸속에서 소형 폭발을 연속으로 일으킨다',
 care:'한국어 위키는 한국·일본의 한 종을, 영어 위키는 500종 넘는 무리를 설명 — 질문은 "몸속 반응으로 뜨거운 액체를 쏘는 딱정벌레"까지. 등급 4에 가까울 수 있음.'});

add({...base,answer:'유리개구리',also:['glass frog','유리개구리과'],mid:'동물',
 core:Q('koGF','피부가 투명해 심장과 내장이 훤히 비치는 중남미의 작은 개구리','이 개구리들은 몸이 투명하여 심장과 내장기관까지 훤히 들여다볼 수 있는 것이 특징이다.'),
 story:[
  Q('enGF','2022년, 이 개구리가 간에 적혈구를 모아 숨겨 투명도를 높인다는 사실이 밝혀졌다','It was found in 2022 that these frogs have the ability to conceal red blood cells concentrated inside their livers, increasing transparency when they are vulnerable.'),
  Q('enGF','사람이라면 혈전이 생겼을 일을 이 개구리는 적혈구 위치·밀도를 조절해 피한다','While this would cause massive clotting in most animals (including humans), glass frogs are able to regulate the location, density, and packing of red cells without clotting.'),
  Q('koGF','암컷이 잎에 알을 낳고 가면 수컷이 남아 알을 지킨다','암컷은 잎에 알을 낳고 , 떠난 후에도 수컷은 종종 남아 포식자로부터 알을 보호하고 다른 암컷을 부른다.')],
 hintIdea:Q('koGF','중앙·남아메리카에 분포한다','중앙아메리카와 남아메리카에 걸쳐 분포한다.'),
 why:'투명해지는 비결이 피를 몸 한곳에 몰아 숨기는 것이었다',
 care:'한국어 위키 이 문서의 표현이 거칠다(예: "89% 이상를") — 숫자는 쓰지 않고 영어 위키 문장으로 해설. 등급 4에 가까울 수 있음.'});

add({...base,answer:'통안어과',also:['통안어','배럴아이','barreleye','스푸크피시'],mid:'동물',
 core:Q('koBE','통 모양의 눈을 가진 심해어 무리 — 머리가 투명한 돔으로 덮여 있다','통 모양의 눈을 갖고 있어 통안어(Barreleyes, Spooky, spook fish)라는 이름이 붙여졌다.'),
 story:[
  Q('enBE','눈은 머리에서 튀어나와 있지만 연한 조직으로 된 커다란 투명 돔 안에 들어 있다','All species have large, telescoping eyes, which dominate and protrude from the head, but are enclosed within a large transparent dome of soft tissue.'),
  Q('koBE','아래쪽에 달린 눈이 작은 거울로 빛을 모아 컴컴한 심해에서 시야를 확보한다는 사실이 최근 밝혀졌다','아래쪽에 달린 눈이 작은 거울을 이용해 적은 양의 빛을 모아 컴컴한 심해에서 시야를 확보한다는 사실이 최근에 밝혀졌다.'),
  Q('enBE','2009년 MBARI 연구진이 투명한 머리와 통 모양 눈의 수수께끼를 풀었다고 발표했다','MBARI press release, Researchers solve mystery of deep-sea fish with tubular eyes and transparent head, 23 February 2009.')],
 hintIdea:Q('koBE','대서양·태평양·인도양의 열대와 온대 심해에서 산다','심해에서 사는 작은 물고기로 대서양과 태평양 그리고 인도양의 열대 및 온대 해역에서 발견된다.'),
 why:'머리가 유리처럼 투명하고 그 안에서 눈이 돌아가는 물고기',
 care:'영어 위키 문서에 "original research" 표지가 있어 MBARI 보도자료 제목만 인용했고 질문에는 투명 머리·통 눈 수준만. 한국어 위키의 "눈 2쌍" 서술은 단정하지 않는다.',
 spellNote:'한국어 위키 표제어 "통안어과"(과 이름). 본문은 "통안어"로도 부른다.'});

add({...base,answer:'맥머도 드라이 밸리',also:['맥머도 건조 계곡','McMurdo Dry Valleys','드라이 밸리'],mid:'지구과학·기상',
 core:Q('enMD','남극에 있는, 눈과 얼음이 거의 없는 세계에서 가장 춥고 건조한 사막','The Dry Valleys are the coldest and driest desert in the world, and the largest ice-free region in Antarctica'),
 story:[
  Q('enMD','까닭은 산에서 흘러내리는 건조한 활강풍이 눈을 빠르게 증발시키기 때문이다','The dry wind evaporates the snow rapidly and little melts into the soil.'),
  Q('enMD','2013년 가장 건조한 곳의 영구동토에서 살아 있는 미생물이 하나도 발견되지 않았다','They found no living organisms in the permafrost, making University Valley the first location on the planet visited by humans with no detected active microbial life.'),
  Q('enMD','화성 환경과 비슷해 시험장으로 쓰인다','The valleys\' hyper-arid, cold-desert climate was soon identified as a high-fidelity terrestrial analogue for the environment of Mars')],
 hintIdea:Q('enMD','돈 후안 못은 지구에서 가장 짠 호수 가운데 하나다','The most saline of all is small Don Juan Pond.'),
 why:'남극인데 눈이 없고, 지구에서 생명이 안 보이는 곳이 있다',hintRisk:true,
 care:'한국어 위키 문서는 두 문장뿐이라 이야기 줄은 영어 위키. 표기는 한국어 위키 표제어 "맥머도 드라이 밸리".'});

add({...base,answer:'아르헨티나개미',also:['Argentine ant','Linepithema humile','민개미'],mid:'동물',
 core:Q('enAA','서로 다른 대륙에 퍼진 아르헨티나개미 군체들이 사실은 하나의 지구적 초군체라는 것이 유전·행동·화학 분석으로 드러났다','Several subsequent studies used genetic, behavioral, and chemical analyses to show that introduced supercolonies on separate continents actually represent a single global supercolony.'),
 story:[
  Q('koAA','다른 개미와 달리 서식지가 달라도 서로 싸우지 않는다','아르헨티나개미는 다른 개미와 달리, 서식지가 달라도 서로 싸우지 않는다.'),
  Q('enAA','유전이 너무 비슷해 한 둥지 개미가 이웃 둥지에 섞여 들어가도 공격받지 않는다','In their introduced range, their genetic makeup is so uniform that individuals from one nest can mingle in a neighboring nest without being attacked.'),
  Q('enAA','캘리포니아에서는 서로 다른 초군체 경계에서 해마다 3천만 마리가 죽는다','On the border of the Very Large Colony and the Lake Hodges Colony thirty million ants die each year, on a battlefront that covers many miles.')],
 hintIdea:Q('enAA','고향에서는 가까운 둥지끼리 텃세를 부리고 서로 공격한다','Colonies living in close proximity are territorial and aggressive toward one another.'),
 why:'지구 곳곳의 개미가 한 가족처럼 굴고, 경계선에서는 해마다 3천만 마리가 죽는 전쟁이 벌어진다',
 care:'"단 하나의 전 지구 초군체"는 연구 결과(영어 위키 서술) — 단정 말고 "연구로 밝혀졌다". 원산지는 남미 파라나강 유역.'});

add({...base,answer:'리차트 구조',also:['리차트구조','사하라의 눈','Richat Structure','지구의 눈','Eye of the Sahara'],mid:'지구과학·기상',
 core:Q('koRI','모리타니 사하라에 있는 지름 40km의 동심원 모양 지형 — 위성에서 눈동자처럼 보인다','리차트 구조(Richat Structure)는 사하라의 눈(Eye of Sahara), 지구의 눈, Guelb er Richat(아랍어: قلب الريشات) 등으로 불리는 지름 40km의 돌출된 동심 원형 지형이다.'),
 story:[
  Q('koRI','처음에는 운석 충돌 구덩이로 짐작했지만 충돌로 생긴 변성암이 발견되지 않아 지지를 잃었다','구조 주변에 운석 충돌로 인한 변성암이 발견되지 않아 이 가설은 지지를 받지 못 하고 있다.'),
  Q('koRI','화산설도 화산암이 발견되지 않아 힘을 얻지 못했다','화산암이 발견되지 않아 이 주장도 힘을 얻지 못하였다.'),
  Q('enRI','아틀란티스 터라는 주장은 근거 없는 변두리 주장이다','The Richat Structure has been the subject of unsubstantiated fringe claims to be the site of Atlantis mentioned in the works of Plato.')],
 hintIdea:Q('koRI','현지 말 Guelb 은 "섬 산"을 뜻한다','Guelb 은 "섬 산"을 의미한다.'),
 why:'위성에서 보면 눈동자인데, 어떻게 생겼는지 아직도 설명이 안 된다',hintRisk:true,
 care:'아틀란티스는 근거 없는 주장 — 질문에 쓰지 않거나 "믿기 어려운 주장"으로만. 생성 원인은 미해결(ko 위키 "아직까지 이 구조의 생성에 대해 설명하지 못하고 있다").'});

add({...base,answer:'월리스선',also:['월리스 선','Wallace Line','Wallace\'s Line'],mid:'생물학',
 core:Q('koWL','1859년 월리스가 그은 동물 분포 경계선 — 인도네시아 발리와 롬복 사이 35km 해협을 지난다','월리스선(영어: Wallace Line 또는 Wallace\'s Line)은 1859년 영국의 박물학자 앨프리드 러셀 월리스가 그은 생물 지리학적 경계선으로, 영국의 생물학자 토머스 헨리 헉슬리가 명명하였다.'),
 story:[
  Q('koWL','롬복 해협은 폭이 약 35km뿐이지만 두 섬의 서식 종이 확연히 다르다','특히 롬복 해협에서는 그 거리가 매우 짧아 약 35 킬로미터에 불과하지만, 이것만으로도 각 섬에 서식하는 종의 차이가 두드러진다.'),
  Q('enWL','서쪽 섬들은 얕은 바다로 아시아 대륙과 이어져 비슷한 야생동물이, 동쪽 뉴기니 같은 섬은 호주와 이어져 유대류가 산다','Earl describes how shallow seas connect islands on the west (Sumatra, Java, etc.) with the Asian continent and with similar wildlife, and islands on the east such as New Guinea are connected to Australia and are characterized by the presence of marsupials.'),
  Q('enWL','정작 월리스 본인의 1859년 논문에는 필리핀이 없었고, 지금의 선은 1868년 헉슬리가 다시 그린 것이다','In fact, Wallace did not include the Philippines in his 1859 paper, and the determination of a line in honor of his name was suggested by T. H. Huxley in 1868.')],
 hintIdea:Q('koWL','선은 보르네오와 술라웨시 사이 마카사르 해협을 지난다','이 선은 인도네시아를 관통하여, 보르네오와 술라웨시(셀레베스) 사이의 마카사르 해협과 발리와 롬복 사이의 롬복 해협을 지난다.'),
 why:'35km 바닷길 하나를 사이에 두고 동물 세계가 갈린다',
 care:'"선 이름은 월리스, 지금 선은 헉슬리가 그린 것" 이야기는 영어 위키 서술 그대로.',spellNote:'한국어 위키백과 표제어 "월리스선"(붙여 씀).'});

add({...base,answer:'세노테',also:['cenote'],mid:'지구과학·기상',
 core:Q('enCE','석회암 바닥이 무너져 지하수가 드러난 천연 구덩이·우물','is a natural pit, or sinkhole, resulting when a collapse of limestone bedrock exposes groundwater.'),
 story:[
  Q('enCE','유카탄 반도에서 쓰인 말로, 고대 마야인이 물을 길어 쓰던 곳이다','The term originated on the Yucatán Peninsula of Mexico, where the ancient Maya commonly used cenotes for water supplies'),
  Q('enCE','칙술루브 운석 구덩이의 가장자리를 따라 세노테가 원을 그리며 몰려 있다','a higher-density circular alignment of cenotes overlies the measured rim of the Chicxulub crater'),
  Q('enCE','그 구덩이는 세노테 배열에서 알아본 뒤 중력 탐사 등으로 지도가 그려졌다','This crater structure, identified from the alignment of cenotes, but also subsequently mapped using geophysical methods')],
 hintIdea:Q('enCE','세노테 물은 비가 땅속으로 천천히 걸러진 것이라 투명한 경우가 많다','Cenote water is often transparent, as the water comes from rain water filtering slowly through the ground'),
 why:'공룡을 멸종시킨 운석 구덩이의 자리를 연못들이 그려 보인다',
 care:'등급 4에 가까울 수 있음(여행지로 알려짐) — 질문은 "공룡 멸종 구덩이 가장자리의 연못" 쪽으로.'});

const out={done:true,chunk:'새재료-55',lane:'hard',grade:5,items:items.map((x,i)=>({key:'n'+(5501+i),...x})),dropped:{dupActive:10,weakStory:4,noSource:0,other:12},opened:50};
if(bad.length){console.log('BAD\n'+bad.join('\n'));process.exit(1);}
fs.writeFileSync('chunk-55.json',JSON.stringify(out,null,1));
console.log('ok',items.length);
