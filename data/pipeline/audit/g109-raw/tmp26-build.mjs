import fs from 'fs';
const D='tmp26/';
const W=(t)=>`https://ko.wikipedia.org/wiki/${t}`, E=(t)=>`https://en.wikipedia.org/wiki/${t}`;
const src={
 bates:['ko-베이츠_의태.txt',W('베이츠_의태')], parth:['ko-처녀생식.txt',W('처녀생식')], crown:['ko-수관기피.txt',W('수관기피')],
 ball:['ko-구상_번개.txt',W('구상번개')], elmo:['ko-세인트_엘모의_불.txt',W('세인트_엘모의_불')], syn:['ko-공감각.txt',W('공감각')],
 prop:['en-Proprioception.txt',E('Proprioception')], nnf:['ko-비뉴턴_유체.txt',W('비뉴턴_유체')], bzko:['ko-벨루소프-자보틴스키_반응.txt',W('벨로우소프-자보틴스키_반응')],
 bzen:['en-Belousov–Zhabotinsky_reaction.txt',E('Belousov–Zhabotinsky_reaction')], lko:['ko-리제강_고리.txt',W('리제강_고리')], len:['en-Liesegang_rings.txt',E('Liesegang_rings')],
 mand:['ko-망델브로_집합.txt',W('망델브로_집합')], laz:['ko-나사로_분류군.txt',W('나사로_분류군')], pac:['ko-파치니_소체.txt',W('파치니_소체')],
 snowko:['ko-바다눈.txt',W('바다눈')], snowen:['en-Marine_snow.txt',E('Marine_snow')], rlnko:['ko-되돌이후두신경.txt',W('되돌이후두신경')], rlnen:['en-Recurrent_laryngeal_nerve.txt',E('Recurrent_laryngeal_nerve')],
 stro:['ko-스트로마톨라이트.txt',W('스트로마톨라이트')]
};
const q=(s,t)=>({s,t});
const items=[
{answer:'베이츠 의태',also:['Batesian mimicry','베이츠식 의태'],major:'자연과학',mid:'생물학',g:4,
 core:q('bates','해를 끼치지 않는 종이 포식자의 공격을 피하기 위해 해로운 종의 경계색을 흉내 내도록 진화한 의태의 한 형태이다.'),
 story:[q('bates','일부는 피상적으로 다른 종과 매우 유사하여 베이츠조차 날개 모양만으로는 종을 구별할 수 없었다.'),q('bates','그러나 덜 분명한 형태적 특징을 자세히 조사해보니 이들이 유전적으로 밀접한 관계가 아님을 알 수 있었다.'),q('bates','이러한 이유로 주어진 환경에서 모방자는 일반적으로 모델보다 개체 수가 적다.')],
 hint:['가짜가 진짜보다 많아지면 포식자가 둘을 가려내게 되어 속임수가 통하지 않게 된다',q('bates','모방자가 모델보다 수가 많아지면 포식자가 모방자와 모델을 구별하는 것이 더 강력한 선택적 이점이 된다.')],
 why:'독도 없으면서 독 있는 척하는 무임승차 전략 — 흉내쟁이는 원본보다 적어야 성공한다',hr:true,care:'뮐러 의태(서로 독 있는 종끼리 닮음)와 구별. 정답에 학자 이름이 들어가지만 개념이 정답.'},
{answer:'처녀생식',also:['단위생식','parthenogenesis'],major:'자연과학',mid:'생물학',g:4,
 core:q('parth','수정 과정 없이 배가 직접 발달하는 무성생식의 자연적인 형태이다.'),
 story:[q('parth','캘리포니아콘도르의 경우, 암컷이 번식할 수 있는 수컷이 있는 상황에서도 임의적 처녀생식이 발생할 수 있다.'),q('parth','예를 들어, 상어, 일부 뱀, 코모도왕도마뱀, 그리고 다양한 가축 조류에서 발생하는 많은 자발적 처녀생식 사례는 임의적 처녀생식의 결과로 널리 알려져 왔다.'),q('parth','채찍꼬리도마뱀과 같은 다배체 필수적 처녀생식 생물에서는 모든 자손이 암컷이다.')],
 hint:['스트레스가 많은 시기에는 유성 생식으로 태어난 자손이 새로운 유전자 조합을 가져 더 적합할 수 있다',q('parth','스트레스가 많은 시기에는 유성 생식으로 태어난 자손이 새롭고 잠재적으로 유익한 유전자 조합을 가지므로 더 적합할 수 있다.')],
 why:'수컷 없이 새끼를 낳는 동물 — 상어 · 코모도왕도마뱀 · 콘도르까지',hr:false,care:'정답 하나에 카드 하나: 단위생식은 같은 대상(also).'},
{answer:'수관 기피',also:['수관기피','crown shyness'],major:'자연과학',mid:'식물',g:5,
 core:q('crown','일부 나무 종에서 관찰되는 현상으로 충분히 재목된 나무들의 수관이 서로 닿지 않아 수로와 같은 틈이 있는 캐노피를 형성한다.'),
 story:[q('crown','수관 기피는 정확한 생리학적 근거는 불확실하다.'),q('crown','바람에 충돌하지 않도록 인공적으로 왕관을 방지하면, 점차 캐노피 틈을 메운다.'),q('crown','연구에 따르면 이는 잠엽충의 유생 확산을 억제할 수 있다고 제시된다.')],
 hint:['식물에게도 이웃이 가까워지는 것을 빛의 변화로 알아채는 반응이 있다',q('crown','광수용체 매개 그늘 회피 반응은 다양한 식물 종에서 잘 문서화된 행동이다.')],
 why:'나무끼리 서로 닿지 않으려고 하늘에 틈을 남긴다 — 까닭은 아직 학설 여럿',hr:true,care:'ko 위키 본문이 번역투. 원인은 가설 여럿이라 단정 금지(바람 마찰 · 빛 감지 · 해충 억제).'},
{answer:'구상번개',also:['구전','볼 라이트닝','ball lightning'],major:'자연과학',mid:'지구과학·기상',g:4,
 core:q('ball','공중에 발광체가 부유하는 자연 현상이다.'),
 story:[q('ball','구상번개는 1638년 영국에서 처음으로 목격된 이후 1987년 오스트레일리아를 비롯하여 미국, 중국, 러시아 등 많은 국가에서도 목격되었다.'),q('ball','또한 구상번개는 일반 번개와 달리 사라질때 유황 냄새가 난다고 목격자들의 증언이 있었다.'),q('ball','구상번개 발생 환경, 원리, 구조 등은 아직 밝혀지지 않았다.')],
 hint:['가끔 UFO로 오인받기도 하는 현상',q('ball','가끔씩 UFO로 오인받기도 한다.')],
 why:'목격담은 수백 년인데 원리는 아직 모르는 둥근 불덩이',hr:false,care:'ko 위키 항목이 짧음 — 중앙에서 영문 출처를 더 열어 확인 권장. "10만분의 1 확률" 같은 수치는 쓰지 말 것.'},
{answer:'세인트 엘모의 불',also:['성 엘모의 불','St. Elmo\'s fire','엘모의 불'],major:'자연과학',mid:'지구과학·기상',g:4,
 core:q('elmo','강한 대기 전기장 속에서 돛대·첨탑·안테나와 같은 뾰족한 물체 주변에 나타나는 푸른색 또는 보랏빛의 코로나 방전이다.'),
 story:[q('elmo','‘세인트 엘모’라는 이름은 선원들의 수호성인으로 여겨진 에라스무스에서 유래했으며, 다른 지역에서는 성 니콜라스의 불·코르포산트 등 여러 이름으로 불렸다.'),q('elmo','현대에는 뇌우 속을 비행하는 항공기의 앞전과 조종석 창, 고층 건물의 첨탑에서도 관측된다.'),q('elmo','방전이 계속되면 특유의 희미한 소리나 지직거리는 소리가 동반될 수 있다.')],
 hint:['폭풍 속 배의 돛대 끝이 푸르게 빛나며 지직거린다',q('elmo','방전이 계속되면 특유의 희미한 소리나 지직거리는 소리가 동반될 수 있다.')],
 why:'폭풍 속 돛대 끝에서 저절로 켜지는 푸른 불 — 선원들은 수호성인의 신호로 여겼다',hr:true,care:'구상번개(같은 묶음)와 다른 현상: 물체에 붙은 코로나 방전. hint 에 "불" 이 들어가지 않게 문장을 만들 것.'},
{answer:'공감각',also:['synesthesia','색청'],major:'자연과학',mid:'인체·해부',g:4,
 core:q('syn','인간의 오감 중 한 영역의 감관에 자극이 주어졌을 때 그 자극이 다른 영역의 자극을 불러일으키는 현상을 일컫는다.'),
 story:[q('syn','작곡가 니콜라이 림스키코르사코프(Nikolai Rimsky-Korsakov)의 음에 대한 인지는 색청의 전형을 보인다.'),q('syn','예를 들어 C 장조는 흰색, A 장조는 불그스름한 장밋빛이며 각각의 음조에서 단조로 바뀔 때 인지되는 색 또한 달라진다.'),q('syn','프란시스 갈톤은 1880년의 논문에서 숫자와 관련된 색채적, 형태적 감각을 처음으로 밝혀내었다.')],
 hint:['글자나 숫자를 볼 때 저절로 색이 느껴지는 경우도 있다',q('syn','글자 혹은 숫자에서 색채를 느끼는 경우이다.')],
 why:'소리에서 색이 보이는 사람들 — 작곡가의 조성마다 색이 달랐다',hr:false,care:'국어의 "공감각적 표현"으로 아는 사람이 많음 — 문항은 감각 현상(신경 쪽)임을 분명히. 등급은 3~4 사이.'},
{answer:'고유수용감각',also:['고유감각','proprioception','자기수용감각'],major:'자연과학',mid:'인체·해부',g:4,
 core:q('prop','is the sense of self-movement, force, and body orientation in three-dimensional space.'),
 story:[q('prop','In 1826, Charles Bell expounded the idea of a "muscle sense", which is credited as one of the first descriptions of physiologic feedback mechanisms.'),q('prop','In 1906, the term proprio-ception (and also intero-ception and extero-ception) is attested in a publication by Charles Scott Sherrington involving receptors.'),q('prop','Proprioception is tested by American police officers using the field sobriety testing to check for alcohol intoxication.')],
 hint:['눈을 감고도 자기 팔다리가 어디 있는지 안다',q('prop','The patient is blindfolded while a joint is moved to a specific angle for a given period of time and then returned to neutral.')],
 why:'눈 감고 코 끝 짚기 음주 단속 — 우리 몸의 "숨은 감각"',hr:false,care:'한국어 표기: 표준국어대사전 표제어 고유수용감각(O). 영문 위키만 열었음 — 한국어 문서가 얇음.'},
{answer:'비뉴턴 유체',also:['비뉴턴유체','non-Newtonian fluid','우블렉'],major:'자연과학',mid:'화학·원소',g:4,
 core:q('nnf','뉴턴의 점성법칙, 응력과 무관한 즉 일정한 점도를 따르지 않는 유체이다.'),
 story:[q('nnf','비뉴턴 유체의 저렴하고 무독성인 예는 물에 전분(예: 옥수수 전분/옥수수 가루)을 현탁시킨 것으로, 때로는 "우블렉", "나무 수액" 또는 "마법의 진흙"이라고도 한다(물 1대 옥수수 전분 1.5에서 2).'),q('nnf','각 단계에서 두꺼워짐을 유발할 만큼 충분한 힘을 제공할 수 있을 만큼 빠르게 움직이는 사람은 층밀림 두꺼워짐 특성으로 인해 가라앉지 않고 큰 우블렉 통 위를 걸을 수 있다.'),q('nnf','"oobleck"이라는 이름은 닥터 수스의 책 바르톨로뮤와 우블렉(Bartholomew and the Oobleck)에서 유래되었다.')],
 hint:['토마토 케첩은 흔들면 더 잘 흘러나온다',q('nnf','토마토 케첩은 흔들릴 때 더 잘 움직이며')],
 why:'빨리 걸으면 물 위(?)를 걷는다 — 전분 물이 힘을 받으면 굳는다',hr:true,care:'"물 위를 걷는" 표현은 질문 문장에서 조심(전분 현탁액임). 물리·화학 경계 — 화학 쪽으로 분류함.'},
{answer:'벨로우소프-자보틴스키 반응',also:['BZ 반응','벨루소프-자보틴스키 반응','Belousov–Zhabotinsky reaction'],major:'자연과학',mid:'화학·원소',g:5,
 core:q('bzko','혹은 BZ 반응은 비평형 열역학의 고전적인 예로서 작용하는 일련의 반응 중 하나로, 비선형계 화학 오실레이터가 확립된다.'),
 story:[q('bzen','the ratio of concentration of the cerium(IV) and cerium(III) ions oscillated, causing the colour of the solution to oscillate between a yellow solution and a colorless solution.'),q('bzen','Belousov made two attempts to publish his finding, but was rejected on the grounds that he could not explain his results to the satisfaction of the editors of the journals to which he submitted his results.'),q('bzen','In 1959 his work was finally published in a less respectable, nonreviewed journal.'),q('bzen','not known in the West until a conference in Prague in 1968.')],
 hint:['한 번 끝난 줄 알았던 용액이 몇 시간 뒤 다시 색이 변하기 시작한 적이 있다',q('bzen','This reaction, depending on the conditions, will resume if left for 5 to 20 hours after it has stopped at the final red color.')],
 why:'스스로 색이 깜빡이는 용액 — "그럴 리 없다"며 논문이 퇴짜 맞았다',hr:true,care:'표기: 한국어 위키 표제어 "벨로우소프-자보틴스키 반응"; 국내 글은 벨루소프로도 씀(also). 학자 이름이 들어간 정답이나 개념 이름이다.',spell:'한국어 위키백과 표제어를 따름 · 벨루소프 표기도 흔해 also 에 둠'},
{answer:'리제강 고리',also:['리제강 현상','Liesegang rings','리제강 링'],major:'자연과학',mid:'화학·원소',g:5,
 core:q('lko','리제강 고리는 라펠 에두아르트 리제강이 발견한 특이한 침전현상이다.'),
 story:[q('len','The phenomenon was first noticed in 1855 by the German chemist Friedlieb Ferdinand Runge.'),q('lko','이크롬산칼륨을 함유한 젤 형태의 막에 질산은 용액 한 방울을 떨어뜨린 후, 몇 시간이 지나자 불용성의 이크롬산은이 날카로운 동심원 구조를 형성한 것이 관찰되었다.'),q('len','the mechanism for the formation of Liesegang rings is still unclear.')],
 hint:['젤 속에서 물질이 번질 때 대류가 없으면 저절로 동심원 무늬가 생긴다',q('lko','대류가 없는 상태에서 특정 농도 및 조건이 충족되면 발생한다.')],
 why:'젤 속에 한 방울 떨어뜨리면 저절로 과녁 무늬가 생기고, 100년 넘게 원리가 논쟁 중',hr:true,care:'처음 본 사람은 1855년 룽게(영문 위키), 이름은 1896년 리제강에서. 질문에서 "누가 처음"을 묻지 말 것.',spell:'한국어 위키백과 표제어를 따름'},
{answer:'망델브로 집합',also:['만델브로 집합','Mandelbrot set'],major:'자연과학',mid:'수학·수 상식',g:4,
 core:q('mand','복소평면에서 정의된 2차원 집합으로, 함수 fc(z)=z2+c가 z=0에서 시작하여 반복될 때 무한대로 발산하지 않는 복소수 c를 만족하는 집합이다.'),
 story:[q('mand','이 집합은 1978년 로버트 W. 브룩스와 피터 마텔스키가 클라인 부분군 연구를 하면서 처음 정의되고 그려졌다.'),q('mand','망델브로 집합의 이미지는 확대할수록 점진적으로 더 미세한 재귀적 세부 사항을 드러내는 무한히 복잡한 경계를 보여준다.'),q('mand','망델브로 집합은 1980년대 중반 개인용 컴퓨터가 고해상도로 집합을 그릴 수 있을 만큼 강력해지면서 컴퓨터 그래픽 데모로 유명')],
 hint:['수식은 한 줄인데 확대할수록 끝없이 복잡한 경계가 나타난다',q('mand','즉, 수열 fc(0), fc(fc(0)) 등이 절댓값이 유계로 유지되는 c의 집합이다.')],
 why:'한 줄짜리 식이 만든 끝없는 무늬 — 개인용 컴퓨터 시대의 스타',hr:true,care:'△ 프랙털(db#6704)과 가까우나 다른 대상. 이름의 유래 인물(브누아 망델브로)과 최초로 그린 사람이 다름에 주의. 표기는 ko 위키 "망델브로", 국내 흔한 표기 "만델브로".',spell:'한국어 위키백과 표제어를 따름 · 만델브로도 흔해 also'},
{answer:'나사로 분류군',also:['라자루스 분류군','Lazarus taxon'],major:'자연과학',mid:'생물학',g:5,
 core:q('laz','고생물학에서 나사로 분류군(Lazarus taxon)은 화석 기록에서 하나 이상의 기간 동안 사라지고 나중에 다시 나타날 분류군이다.'),
 story:[q('laz','이 용어는 예수 그리스도가 나사로를 죽은 자 가운데서 살리신 기독교 성서 요한복음의 이야기를 나타낸다.'),q('laz','그러나 실러캔스에 적용되는 것과 같이 상당한 기간 동안 화석 기록에서 누락된 다른 살아있는 화석도 나사로 분류군이다.'),q('laz','Conothraupis mesoleuca는 1938년부터 2003년까지 발견되지 않았지만 Emas 국립 공원의 갤러리 숲에서 재발견되었다.')],
 hint:['멸종한 줄 알았다가 다시 찾은 생물을 가리키기도 한다',q('laz','마찬가지로 보존 생물학 및 생태학에서는 멸종된 것으로 생각되었다가 재발견된 종이나 개체군을 가리킬 수 있다.')],
 why:'죽었다 살아난 이름 — 멸종한 줄 알았던 생물의 이름표',hr:true,care:'실러캔스(영상 후보 3회 5번)와 이야기가 겹칠 수 있음 — 이 카드는 개념(분류군)이 정답.'},
{answer:'파치니 소체',also:['파터-파치니 소체','Pacinian corpuscle','lamellar corpuscle'],major:'자연과학',mid:'인체·해부',g:5,
 core:q('pac','피부 및 기타 내부 장기에서 발견되는 진동 또는 압력에 반응하는 낮은 역치의 기계수용기이다.'),
 story:[q('pac','캡슐은 축삭 말단 주변에 동심원적으로 배열된 20-70개의 결합 조직 라멜라로 구성되어 있으며, 양파와 같은 구조를 형성한다.'),q('pac','길이는 최대 2mm, 직경은 거의 1mm까지 측정할 수 있다.'),q('pac','큰 것은 육안으로 볼 수 있다.')],
 hint:['피부 깊은 곳에서 진동과 깊은 압력을 느낀다',q('pac','주로 진동과 깊은 압력에 반응한다.')],
 why:'손끝 속 양파 껍질 — 휴대폰 진동을 알아채는 센서',hr:true,care:'이야기가 구조 설명 위주라 약함 — 중앙에서 보강 또는 탈락 판단. 파치니 이름 유래(1831년 발견 등)는 이번에 못 열었음.'},
{answer:'바다눈',also:['마린 스노','marine snow','마린스노'],major:'자연과학',mid:'지구과학·기상',g:4,
 core:q('snowko','바다눈 또는 마린 스노(marine snow)는 표해수층에서 사는 생물들의 죽은 사체나 배설물이 눈처럼 되어서 심해에 내리는걸 말한다.'),
 story:[q('snowen','In the deep ocean, marine snow is a continuous shower of mostly organic detritus falling from the upper layers of the water column.'),q('snowen','It is a significant means of exporting energy from the light-rich photic zone to the aphotic zone below, which is referred to as the biological pump.'),q('snowen','Marine snow often forms during algal blooms.')],
 hint:['깊은 바다의 생물들은 위에서 내려오는 이것을 먹고 산다',q('snowen','Bacteria are largely responsible for the remineralisation and fragmentation of aggregates.')],
 why:'심해에는 늘 눈이 내린다 — 위에서 죽은 것들이 내려와 깊은 곳의 밥이 된다',hr:false,care:'한국어 위키 표제어는 "바다눈"(표준국어대사전에는 없음). ko 문서가 짧고 고래 사체 문장은 쓰지 말 것.',spell:'한국어 위키백과 표제어 · 사전에 없음 · also 에 마린 스노'},
{answer:'되돌이후두신경',also:['반회후두신경','반회신경','recurrent laryngeal nerve'],major:'자연과학',mid:'인체·해부',g:5,
 core:q('rlnko','미주신경(10번 뇌신경)의 가지로 반지방패근을 제외한 후두의 모든 자체기원근육들에 분포한다.'),
 story:[q('rlnko','기린의 경우 되돌이후두신경이 4.6m 가량을 매우 길게 우회하는데,'),q('rlnen','The extreme detour of the recurrent laryngeal nerves, about 4.6 metres (15 ft) in the case of giraffes, has been cited as evidence of evolution'),q('rlnen','Ancient Greek physician Galen demonstrated the nerve course and the clinical syndrome of recurrent laryngeal nerve paralysis, noting that pigs with the nerve severed were unable to squeal.')],
 hint:['목소리를 내는 신경을 끊은 돼지는 소리를 지르지 못했다',q('rlnen','noting that pigs with the nerve severed were unable to squeal.')],
 why:'기린의 목소리 신경은 목을 내려갔다 올라오는 4.6m 길 — 진화가 남긴 흔적',hr:true,care:'"설계 오류" 식의 가치 판단 표현 금지 — 진화 설명은 "보여주는 사례로 거론된다" 수준.',spell:''},
{answer:'스트로마톨라이트',also:['스트로마톨리스','stromatolite'],major:'자연과학',mid:'지구과학·기상',g:4,
 core:q('stro','35억년 이전에 만들어진 것도 있어 지구상의 생명체가 남긴 화석 중 가장 오래된 기록을 보여준다.'),
 story:[q('stro','남세균은 (그리고 극한미생물인 감마프로테오박테리아 역시) 계속적인 광합성을 통해 원시 지구 대기의 산소 량을 증가시키는데 주된 역할을 했다.'),q('stro','낮 동안에는 강력한 자외선이 내려쬐기 때문에 스트로마톨라이트의 박테리아는 밤 동안에만 활발한 활동을 할 수 있다.'),q('stro','현생 스트로마톨라이트는 주로 고염 호수와 석호 등 극단적으로 염도가 높아 바닥의 식물을 뜯어먹는 동물들이 활동할 수 없는 환경에서 발견된다.')],
 hint:['오스트레일리아 서부 샤크 만의 보호구역에서는 지금도 살아 있는 것을 볼 수 있다',q('stro','이런 장소중 하나는 오스트레일리아 서부 샤크 만의 하멜린 풀 해양 자연보호구역(Hamelin Pool Marine Nature Reserve)으로')],
 why:'35억 년 된 미생물 층 — 오늘날에도 짠 바닷가에서 자란다',hr:false,care:'산소 증가 설명 문장은 "주된 역할" 수준만. 고래 · 다른 카드와 겹침 없음(db 빨대는 글자 일부 일치일 뿐).'},
];
let bad=0; const cache={};
const txt=(k)=>cache[k]??=fs.readFileSync(D+src[k][0],'utf8');
const chk=(o)=>{ if(!txt(o.s).includes(o.t)){console.log('MISSING',o.s,o.t.slice(0,50));bad++;} return {text:o.t,url:src[o.s][1],quote:o.t}; };
const out=items.map((it,i)=>{
 const core=chk(it.core);
 const story=it.story.map(chk);
 const hq=chk(it.hint[1]);
 return {key:'n'+(2601+i),answer:it.answer,also:it.also,spelling:'?',major:it.major,mid:it.mid,gradeGuess:it.g,core,story,
 hintIdea:{text:it.hint[0],url:hq.url,quote:hq.quote},legend:false,care:it.care,why:it.why,hintRisk:it.hr,spellNote:it.spell||''};
});
if(bad){process.exit(1)}
const res={done:true,chunk:'새재료-26',lane:'hard',items:out,dropped:{dupActive:15,weakStory:3,noSource:5,other:4},opened:36};
fs.writeFileSync('chunk-26.json',JSON.stringify(res,null,1));
console.log('ok',out.length);
