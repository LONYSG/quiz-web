import fs from 'fs';
const urlOf=f=>{const m=f.match(/^(en|ko)-(.*)\.txt$/);return `https://${m[1]}.wikipedia.org/wiki/${encodeURI(m[2])}`};
let bad=0;
function Q([f,frag]){
  const t=fs.readFileSync(f,'utf8');
  const ss=t.replace(/\b([A-Z])\. /g,'$1\u0001 ').replace(/U\.S\. /g,'U.S\u0001 ').replace(/Sr\. /g,'Sr\u0001 ').split(/(?<=[.?!])\s+|\n+/).map(x=>x.replace(/\u0001/g,'.'));
  let s=ss.find(x=>x.includes(frag));
  if(!s){console.log('MISSING',f,frag);bad++;return {text:'',url:'',quote:''};}
  s=s.trim();
  return {text:s,url:urlOf(f),quote:s};
}
const T=(spec,text)=>{const o=Q(spec);o.text=text;return o;};
const items=[];
function add(o){
  items.push({key:'n'+(2201+items.length),answer:o.a,also:o.also||[],spelling:'?',major:o.major,mid:o.mid,gradeGuess:1,
   core:T(o.core[0],o.core[1]),story:o.story.map(s=>T(s[0],s[1])).filter((x,i,a)=>a.findIndex(y=>y.quote===x.quote)===i),hintIdea:o.hint?Q(o.hint):null,
   legend:!!o.legend,care:o.care||'',why:o.why,hintRisk:!!o.risk,spellNote:o.spell||''});
}
const BR=['생활·상식','브랜드·기업'];
add({a:'오레오',also:['Oreo'],major:BR[0],mid:BR[1],core:[['ko-오레오.txt','1912년 나비스코 사에서'],'1912년 나비스코에서 처음 만든 샌드 쿠키'],
 story:[[['en-Oreo.txt','imitation of the original Hydrox'],'오레오는 먼저 나와 있던 하이드록스 쿠키를 따라 만든 것이다'],[['en-Oreo.txt','origin of the name "Oreo" is obscure'],'이름의 유래도 분명하지 않다'],[['en-Oreo.txt','ceremonially named as "Oreo Way"'],'공장이 있던 거리에는 오레오 거리라는 이름이 붙었다']],
 hint:['ko-오레오.txt','두 개의 초콜릿 쿠키 사이에'],why:'세계에서 가장 유명한 쿠키가 사실은 경쟁 쿠키의 모방작이다',spell:'한국어 위키백과 표제어를 따름'});
add({a:'킷캣',also:['Kit Kat','KitKat'],major:BR[0],mid:BR[1],core:[['ko-킷캣.txt','킷캣(영어: Kit Kat)은'],'영국 로운트리사가 1935년 개발한 초콜릿 코팅 웨이퍼 과자'],
 story:[[['en-Kit_Kat.txt','recommendation box'],'공장 직원이 건의함에 넣은 "일하러 갈 때 싸 갈 수 있는 초콜릿 바" 제안에서 시작됐다'],[['en-Kit_Kat.txt','mutton pies known as Kit Kats'],'킷캣이라는 이름은 18세기 런던 킷캣 클럽에서 내던 양고기 파이에서 왔다']],
 hint:['ko-킷캣.txt','미국에서는 허쉬사가'],why:'과자 이름이 18세기 클럽 양고기 파이에서 왔다',spell:'한국어 위키백과 표제어를 따름 · 띄어 쓴 Kit Kat 도 also 에'});
add({a:'게토레이',also:['게이터레이드','Gatorade'],major:BR[0],mid:BR[1],core:[['ko-게토레이.txt','게토레이라는 이름은'],'플로리다 대학 마스코트 악어에서 이름을 딴 스포츠 음료'],
 story:[[['en-Gatorade.txt','Following a request from Florida Gators'],'플로리다 대학 미식축구팀 감독의 부탁으로 연구진이 만들었다'],[['en-Gatorade.txt','initially considered naming their product'],'처음 후보 이름은 게이터-에이드였는데 약효를 입증해야 할까 봐 에이드를 피했다']],
 hint:['ko-게토레이.txt','원래 운동 선수들을 위해'],why:'스포츠 음료가 대학 악어 팀 이름에서 나왔다',spell:'한국어 위키백과 표제어 게토레이를 따름(원어 발음은 게이터레이드)'});
add({a:'엠앤엠즈',also:["M&M's",'엠앤엠','M&M'],major:BR[0],mid:BR[1],core:[["en-M&M's.txt",'The two Ms represent'],'M&M 의 두 M 은 포레스트 마스와 브루스 머리 두 사람의 성'],
 story:[[["en-M&M's.txt",'saw soldiers in the Spanish Civil War'],'마스는 스페인 내전 병사들이 먹던 겉이 단단한 초콜릿 과자를 보고 만들었다'],[["en-M&M's.txt",'first big customer'],'첫 큰 고객은 열대에서도 초콜릿이 녹지 않길 바란 미군이었다']],
 hint:["en-M&M's.txt",'Each piece has the serif letter'],why:'알록달록 초콜릿의 M 두 개는 사람 둘의 성이다',spell:'한국어 위키백과 표제어 엠앤엠즈를 따름 · 영문 표기는 also 에'});
add({a:'컨버스',also:['Converse','척 테일러','컨버스 올스타'],major:'생활·상식',mid:'의복·패션',core:[['en-Converse_(shoe_company).txt','In 1922, basketball player'],'컨버스 올스타는 농구선수 척 테일러가 이름을 붙인 운동화'],
 story:[[['en-Converse_(shoe_company).txt',"in 1932, Taylor's signature"],'1932년 올스타 패치에 테일러의 서명이 들어갔다'],[['en-Converse_(shoe_company).txt',"Converse's portfolio includes products"],'지금도 대표 제품 이름이 척 테일러 올스타다']],
 hint:null,why:'운동화 이름의 사람은 발이 아파 찾아온 농구선수 겸 영업사원이었다',spell:'일반 표기 컨버스 · 한국어 위키 기업 문서 제목 미확인'});
add({a:'알루미늄 포일',also:['알루미늄 호일','알루미늄박','은박지','호일'],major:'기술·의학',mid:'재료·건설 기술',core:[['ko-알루미늄_포일.txt','알루미늄박(aluminium+箔)'],'알루미늄을 종이처럼 얇게 만든 금속박 · 은박지로도 부른다'],
 story:[[['en-Aluminium_foil.txt','Foil made from a thin leaf of tin'],'알루미늄 이전에는 주석으로 만든 포일을 썼다'],[['en-Aluminium_foil.txt','two sheets are rolled at the same time'],'얇게 만들려고 두 장을 겹쳐 함께 압연한다'],[['en-Aluminium_foil.txt','The two sides in contact with each other are matte'],'그래서 맞닿은 안쪽 면은 거칠고 바깥쪽 면은 반짝인다']],
 hint:['ko-알루미늄_포일.txt','식료품, 담배, 약품'],risk:true,why:'앞뒤 면이 다른 까닭이 만드는 방법에 있다',spell:'한국어 위키백과 표제어 알루미늄 포일 · 표준 표기 알루미늄박 은 also 에'});
add({a:'나눗셈 기호',also:['÷','오벨루스','obelus'],major:'자연과학',mid:'수학·수 상식',core:[['en-Obelus.txt','In mathematics, the ÷ symbol'],'÷ 는 영어권에서 나눗셈을 나타내는 기호'],
 story:[[['en-Obelus.txt','In codicology, a (usually horizontal) obelus'],'옛 필사본에서 이 막대 기호는 의심스러운 내용에 붙이는 표시였다'],[['en-Obelus.txt','Originally, one of these marks'],'잘못 끼어들었다고 의심되는 구절 옆에 달던 표시였다']],
 hint:['en-Obelus.txt','The word "obelus" comes from'],risk:true,why:'÷ 는 원래 틀렸을지 모른다는 표시였다',spell:'표준국어대사전에 기호 항목 없음 · 일반 표현을 따름'});
add({a:'아라비아 숫자',also:['아라비아숫자','인도-아라비아 숫자'],major:'자연과학',mid:'수학·수 상식',core:[['en-Arabic_numerals.txt','The term Hindu–Arabic numerals is also used'],'아라비아 숫자는 인도에서 시작된 위치 표기법이라 인도-아라비아 숫자라고도 한다'],
 story:[[['en-Arabic_numerals.txt','Calculations were originally performed using a dust board'],'계산은 먼지판에 글씨를 썼다 지우며 했다'],[['en-Arabic_numerals.txt','Fibonacci was a Pisan mathematician'],'피보나치가 1202년 책으로 유럽에 퍼뜨렸다']],
 hint:null,risk:true,why:'아라비아 숫자는 사실 인도에서 왔다',spell:'일반 표기'});
add({a:'주판',also:['수판','算盤'],major:'자연과학',mid:'수학·수 상식',core:[['en-Suanpan.txt','The earliest known written documentation of the Chinese abacus'],'중국 주판은 기원전 2세기 한나라 때 기록이 가장 이르다'],
 story:[[['en-Suanpan.txt','In the 13th century, Guo Shoujing'],'13세기 곽수경이 주판으로 1년의 길이를 365.2425일로 계산했다'],[['en-Suanpan.txt','In the 16th century, Zhu Zaiyu'],'16세기 주재육은 주판으로 12평균율을 계산했다']],
 hint:['en-Suanpan.txt','The evident similarity of the Roman abacus'],why:'주판으로 달력과 음계까지 계산했다',spell:'표준국어대사전 주판 · also 수판'});
add({a:'화산',also:['volcano'],major:'자연과학',mid:'지구과학·기상',core:[['en-Volcano.txt','The word volcano'],'화산(volcano)은 이탈리아 섬 이름 불카노에서 왔다'],
 story:[[['ko-화산.txt','대부분의 화산은 수중에 있다'],'지구의 화산 대부분은 바닷속에 있다'],[['en-Volcano.txt','Stratovolcanoes are tall conical'],'층상화산은 용암과 화산재가 겹겹이 쌓인 원뿔 모양의 높은 산이다'],[['ko-화산.txt','대부분의 화산은 수중에 있다'],'지구의 화산 대부분은 바닷속에 있다']],
 hint:['ko-화산.txt','화산(火山)은 행성 내부의'],why:'불의 신 이름에서 온 낱말이고 대부분이 바닷속에 있다',spell:'표준국어대사전 화산'});
add({a:'토네이도',also:['용오름','tornado'],major:'자연과학',mid:'지구과학·기상',core:[['ko-토네이도.txt','토네이도(tornado) 또는 용오름'],'토네이도 또는 용오름은 적란운에서 생기는 강력한 바람'],
 story:[[['en-Tornado.txt','The word tornado comes from the Spanish tronada'],'토네이도는 에스파냐어로 천둥을 뜻하는 낱말에서 왔다'],[['en-Tornado.txt','Those that form in dry environments can be nearly invisible'],'건조한 곳에서는 거의 보이지 않는 토네이도도 있다']],
 hint:['en-Tornado.txt','Tornadoes can have a wide range of colors'],why:'이름이 천둥에서 왔고 눈에 안 띄는 것도 있다',spell:'표준국어대사전 토네이도 · also 용오름'});
add({a:'태풍',also:['typhoon','颱風'],major:'자연과학',mid:'지구과학·기상',core:[['en-Typhoon.txt','A typhoon is a tropical cyclone'],'태풍은 북서태평양에서 생기는 강한 열대저기압'],
 story:[[['ko-태풍.txt','그리스 신화의 크고 강력한 괴물 티폰'],'영어 typhoon 은 그리스 신화의 괴물 티폰에서 왔다는 설이 있다'],[['en-Typhoon.txt','The etymology of typhoon is either of Chinese or Persian-Hindustani origin'],'영어 기록에는 중국어나 페르시아·힌두스탄어 기원이라는 설도 있다']],
 hint:null,legend:true,care:'어원은 설이 갈린다 · 사실처럼 쓰지 않는다',why:'이름의 뿌리가 괴물이라는 설',spell:'표준국어대사전 태풍'});
add({a:'강낭콩',also:['강남콩','kidney bean'],major:'자연과학',mid:'식물',core:[['ko-강낭콩.txt','강낭콩(문화어'],'강낭콩은 파세올루스 불가리스의 재배품종'],
 story:[[['ko-강낭콩.txt','훈몽자회'],'옛 기록에는 가ᇰ남코ᇰ 으로 나오고 이후 강남콩이 되었다'],[['ko-강낭콩.txt','영어 이름'],'영어 이름 키드니빈은 콩팥을 닮은 모양에서 왔다']],
 hint:null,why:'콩 이름이 강남에서 왔고 자음 동화로 바뀌었다',spell:'표준국어대사전 강낭콩'});
add({a:'하리보',also:['Haribo','HARIBO'],major:BR[0],mid:BR[1],core:[['ko-하리보.txt','회사 이름은 Hans Riegel'],'하리보는 한스 리겔 본의 약자'],
 story:[[['ko-하리보.txt','HAns RIegel BOnn'],'창업자 이름과 도시 이름 앞 글자를 합쳤다'],[['en-Haribo.txt','The company created the first gummy candy'],'1922년 작은 곰 모양 젤리를 처음 만들었다'],[['en-Haribo.txt','Tanzbär'],'처음 이름은 춤추는 곰이었다']],
 hint:null,why:'곰 젤리 회사 이름이 사람과 도시 이름 줄임말이다',spell:'한국어 위키백과 표제어 하리보'});
add({a:'누텔라',also:['Nutella'],major:BR[0],mid:BR[1],core:[['en-Nutella.txt','Nutella was developed in Piedmont'],'누텔라는 전후 카카오 부족 때문에 헤이즐넛을 섞어 만든 이탈리아 스프레드'],
 story:[[['en-Nutella.txt','Pietro Ferrero owned a bakery'],'페레로는 헤이즐넛 산지 알바의 빵집 주인이었다'],[['en-Nutella.txt','Originally sold as a solid block'],'처음에는 덩어리로 팔다가 바르는 크림으로 바꿨다']],
 hint:['en-Nutella.txt','Under Italian law'],why:'카카오가 모자라 헤이즐넛을 넣은 데서 시작했다',spell:'외래어 표기 누텔라'});
add({a:'프링글스',also:['Pringles'],major:BR[0],mid:BR[1],core:[['en-Pringles.txt','In 1956, Procter & Gamble'],'프링글스는 감자칩이 부서지고 눅눅한 불만에서 개발됐다'],
 story:[[['en-Pringles.txt','The saddle-shape of Pringles chips'],'말안장 모양은 수학에서 쌍곡포물면이라 부르는 곡면이다'],[['en-Pringles.txt','originally known as Pringle'],'다른 제조사가 반발해 감자칩이라 부르지 못했다']],
 hint:null,why:'과자 모양이 수학 곡면이다',spell:'한국어 위키백과 표제어 프링글스'});
add({a:'트럼프 카드',also:['트럼프','플레잉 카드','playing card'],major:'스포츠·게임',mid:'보드게임·카드게임',core:[['ko-트럼프_카드.txt','한국에서는 트럼프 카드'],'한국에서 트럼프라 부르지만 원래는 으뜸패를 가리키는 말'],
 story:[[['en-Playing_card.txt','Playing cards probably came to Europe from the East'],'카드는 동쪽에서 마믈루크 이집트를 거쳐 유럽에 왔을 것이다'],[['en-Playing_card.txt','The Mamluk court cards showed abstract designs'],'마믈루크 카드에는 사람 그림 대신 무늬나 서체가 있었다']],
 hint:['ko-트럼프_카드.txt','일반적으로 카드 한 벌'],risk:true,why:'트럼프는 카드의 이름이 아니라 으뜸패라는 뜻',spell:'한국어 위키백과 표제어 플레잉 카드(트럼프 카드)'});
add({a:'틱택토',also:['삼목','tic-tac-toe','OX 게임'],major:'스포츠·게임',mid:'보드게임·카드게임',core:[['ko-틱택토.txt','틱택토(tic-tac-toe)는'],'O 와 X 를 3×3 칸에 번갈아 놓는 두 사람 게임'],
 story:[[['en-Tic-tac-toe.txt','three-in-a-row boards can be traced back to ancient Egypt'],'이집트 지붕 타일에 기원전 1300년경 판이 있다'],[['en-Tic-tac-toe.txt','called terni lapilli'],'로마에서는 돌 세 개로 하는 테르니 라필리가 있었다']],
 hint:null,why:'종이 낙서 게임이 3천 년을 거슬러 간다',spell:'한국어 위키백과 표제어 틱택토'});
const out={done:true,chunk:'새재료-22',lane:'easy',items,dropped:{dupActive:0,weakStory:0,noSource:0,other:0},opened:0};
fs.writeFileSync('out.json',JSON.stringify(out,null,1));
console.log(items.length,'bad',bad);
