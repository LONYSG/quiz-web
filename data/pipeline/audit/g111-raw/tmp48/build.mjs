import fs from 'fs';
const D='data/pipeline/audit/g111-raw/tmp48/';
const W=t=>'https://en.wikipedia.org/wiki/'+t;
const items=[
{a:'반창고',also:['일회용 반창고','밴드','대일밴드','밴드에이드'],major:'기술·의학',mid:'발명·발견',
 core:['Band-Aid',"The Band-Aid was invented in 1920 by a Johnson & Johnson employee, Earle Dickson, in Highland Park, New Jersey, for his wife Josephine, who frequently injured, cut and burned herself while cooking."],
 story:[['Band-Aid',"The prototype was a strip of gauze down the middle of a long piece of surgical tape that allowed her to dress her wounds without assistance."],['Band-Aid',"In 1921, the product made just $3,000."],['Band-Aid',"Dickson had a successful career at Johnson & Johnson, rising to vice president until his retirement in 1957."]],
 hint:['Band-Aid',"A red pull string was added in 1940 to help open the packaging."],why:'아내가 요리하다 자주 다치자 남편이 만든 것이 세계 상비품이 됐다 — 첫해 매출은 3천 달러',care:'브랜드(밴드에이드 · 대일밴드)가 아닌 일반 낱말 반창고를 정답으로. 질문에서 상표 이름을 쓰지 않는다',hr:false},
{a:'풍선껌',also:['bubble gum'],major:'생활·상식',mid:'세계 음식·요리',
 core:['Bubble_gum',"One recipe, based on a formula for a chewing gum called \"Blibber-Blubber\", was found to be less sticky than regular chewing gum and stretched more easily."],
 story:[['Bubble_gum',"Bubble gum got its distinctive pink color because the original recipe Diemer worked on produced a dingy gray colored gum, so he added red dye (diluted to pink), as that was the only dye he had on hand at the time."],['Bubble_gum',"This type of non-sticky gum became highly successful and was eventually named by the president of Fleer as Dubble Bubble because of its stretchy texture."],['Bubble_gum',"In 1928, Walter Diemer, an accountant for the Fleer Chewing Gum Company in Philadelphia, was experimenting with new gum recipes."]],
 hint:['Bubble_gum',"This type of non-sticky gum became highly successful"],why:'풍선껌이 분홍색인 까닭은 집어 든 염료가 빨강뿐이었기 때문 — 원래는 칙칙한 회색',care:'',hr:false},
{a:'롤러코스터',also:['roller coaster'],major:'기술·의학',mid:'자동차·교통',
 core:['Roller_coaster',"The oldest roller coasters are believed to have originated from the so-called \"Russian Mountains\"; specially constructed hills of ice located in the area that is now Saint Petersburg, Russia."],
 story:[['Roller_coaster',"Built in the 17th century, the slides were built to a height of between 70 and 80 feet (21 and 24 m), had a 50-degree drop, and were reinforced by wooden supports."],['Roller_coaster',"Conversely, in Russian, they are called \"American hills\" (Американские горки, Amerikanskiye gorki)."],['Roller_coaster',"German has the word Achterbahn, stemming from Figur-8-Bahn, relating to the form of the number 8 (acht in German)."]],
 hint:['Roller_coaster',"Today, most roller coasters are built out of steel, which can allow for more intense forces and inversions, although modernized versions of wooden coasters still exist."],why:'조상은 얼음으로 만든 러시아의 미끄럼틀 — 프랑스어권은 러시아 산, 러시아는 미국 언덕이라 부른다',care:'',hr:false},
{a:'진공청소기',also:['청소기','vacuum cleaner'],major:'기술·의학',mid:'발명·발견',
 core:['Vacuum_cleaner',"In 1901, powered vacuum cleaners using suction were invented independently by British engineer Hubert Cecil Booth and American inventor David T. Kenney."],
 story:[['Vacuum_cleaner',"relied upon just suction with air pumped through a cloth filter and was offered as part of his cleaning services."],['Vacuum_cleaner',"Booth also may have coined the word \"vacuum cleaner\"."],['Vacuum_cleaner',"Thurman's system, powered by an internal combustion engine, traveled to the customer's residence on a horse-drawn wagon as part of a door-to-door cleaning service."]],
 hint:['Vacuum_cleaner',"Kenney's was a stationary"],why:'처음 청소기는 집에 들어오지 못할 만큼 커서 마차에 실려 와 집 밖에서 호스를 창문으로 넣었다',care:'story 1줄째는 Booth 마차형 기계 문장의 뒷부분 — 질문 작성자는 위키백과 원문에서 앞부분을 다시 확인할 것',hr:false},
{a:'코코넛',also:['coconut','야자열매'],major:'자연과학',mid:'식물',
 core:['Coconut',"The generic name Cocos, and the common name, is derived from the 16th-century Portuguese word coco, meaning 'head' or 'skull' after the three indentations on the coconut shell that give an impression of a face."],
 story:[['Coconut',"This apparently came from encounters in 1521 by Portuguese and Spanish explorers with Pacific Islanders, when the coconut shell reminded them of ghosts in Portuguese folklore called coco or côca."],['Coconut',"In the West, the fruit was originally called nux indica, a name used by Marco Polo in 1280 while in Sumatra."],['Coconut',"indicating that the coconuts were not introduced naturally, such as by sea currents, but by early Austronesian sailors to the Americas from at least 300 BCE."]],
 hint:['Coconut',"Only a few penetrate deep into the soil for stability."],why:'코코넛 이름은 껍질의 구멍 세 개가 얼굴처럼 보여 "해골 · 도깨비" 라는 포르투갈어에서 왔다',care:'이름 유래는 "~로 보인다"(apparently) 추정 — 단정하지 않는다',legend:true,hr:false},
{a:'안경',also:['eyeglasses','glasses'],major:'기술·의학',mid:'발명·발견',
 core:['Glasses',"The first glasses were estimated to have been made in central Italy, most likely in Pisa or Florence, by about 1290"],
 story:[['Glasses',"It is not yet twenty years since there was found the art of making glasses, which make for good vision"],['Glasses',"Eyeglasses, having first been made by someone else, who was unwilling to share them, he [Spina] made them and shared them with everyone with a cheerful and willing heart."],['Glasses',"The stigma began to fall away in the U.S. in the early 1900s when the popular Theodore Roosevelt was regularly photographed wearing glasses"]],
 hint:['Glasses',"Venice quickly became an important center of manufacture, especially due to using the high-quality glass made at Murano."],why:'처음 만든 사람은 비법을 숨기려 했지만, 수도사가 모두에게 나눠 주었다 — 안경이 멋이 된 것은 겨우 100여 년 전',care:'',hr:false},
{a:'꿀',also:['벌꿀','honey'],major:'생활·상식',mid:'세계 음식·요리',
 core:['Honey',"Due to honey's high sugar concentration and acidic pH level many microorganisms cannot grow in it and, when properly stored, honey therefore does not spoil."],
 story:[['Honey',"However, no edible honey has been found in Egyptian tombs; all such cases have been proven to be other substances or only chemical traces."],['Honey',"The oldest known honey remains were found in Georgia during the construction of the Baku–Tbilisi–Ceyhan pipeline: archaeologists found honey remains on the inner surface of clay vessels unearthed in an ancient tomb, dating back between 4,700 and 5,500 years."],['Honey',"If exposed to moist air, its hydrophilic properties pull moisture into the honey, eventually diluting it to the point that fermentation can begin."]],
 hint:['Honey',"Honey collection is an ancient activity, long preceding the honey bee's domestication; this traditional practice is known as honey hunting."],why:'"이집트 무덤에서 3천 년 된 꿀을 먹었다"는 흔한 이야기는 확인된 적이 없다 — 상하지 않는 건 사실이지만 습기엔 약하다',care:'통념 바로잡기. "이집트 무덤 꿀" 이야기를 사실로 쓰지 않는다',hr:false},
{a:'해파리',also:['jellyfish'],major:'자연과학',mid:'동물',
 core:['Jellyfish',"Although they lack a true brain, cnidarian jellyfish have a \"ring\" nervous system that plays a significant role in motor and sensory activity."],
 story:[['Jellyfish',"might be effectively immortal because of its ability under certain circumstances to transform from medusa back to the polyp stage"],['Jellyfish',"The tentacles are armed with stinging cells and may be used to capture prey or to defend against predators."]],
 hint:['Jellyfish',"Thousands of swimmers worldwide are stung every year, with effects ranging from mild discomfort to serious injury or even death."],why:'뇌가 없는데도 살아가고, 한 종은 다 자란 몸에서 다시 어린 시절로 돌아가 사실상 죽지 않을 수 있다',care:'"불로불사"는 "그럴 수 있다(might be)" 수준 — 단정하지 않는다. 종 이름은 Turritopsis dohrnii',hr:false},
{a:'불가사리',also:['starfish','sea star','별불가사리'],major:'자연과학',mid:'동물',
 core:['Starfish',"Starfish typically have a central disc and usually five arms, though some species have a larger number of arms."],
 story:[['Starfish',"Traditionally, starfish were thought to lack a centralized brain."],['Starfish',"Recent genetic evidence, however, suggests that the majority of an echinoderm's body is \"all-brain\"."],['Starfish',"In Antarctic Labidiaster annulatus, the number of arms can exceed fifty."]],
 hint:['Starfish',"Many species are brightly coloured in various shades of red or orange"],why:'뇌가 없다고 알았는데 유전자를 보니 몸 거의 전체가 뇌일 수 있다',care:'"몸 전체가 뇌"는 최근 연구가 시사하는 수준 — "~라는 연구가 있다" 꼴로',hr:false},
{a:'생일 케이크',also:['생일케이크','birthday cake'],major:'생활·상식',mid:'세계 음식·요리',
 core:['Birthday_cake',"In many cultures, it is also customary to serve the birthday cake with small lit candles on top, especially in the case of a child's birthday."],
 story:[['Birthday_cake',"In Germany by the 18th century (then the Holy Roman Empire), the tradition of celebrating birthdays with a birthday cake and candles began."],['Birthday_cake',"His cake was said to be as big as an oven could make it, with candles stuck in it, marking the years of his age."],['Birthday_cake',"in classical Roman culture, cakes were occasionally served at special birthdays and at weddings."]],
 hint:['Birthday_cake',"These were circles made from flour and nuts, leavened with yeast, and sweetened with honey."],why:'촛불 꽂은 생일 케이크는 18세기 독일 백작의 생일잔치에서 시작됐다고 한다',care:'"~라고 한다" 수준으로',hr:true},
{a:'푸딩',also:['pudding'],major:'생활·상식',mid:'세계 음식·요리',
 core:['Pudding',"The word pudding is believed to come from the French boudin, which may derive from the Latin botellus, meaning \"small sausage\", referring to encased meats used in medieval European puddings."],
 story:[['Pudding',"It refers to the entrails or stomach of a sheep, pig or other animal stuffed with meat, offal, suet, oatmeal and seasonings."],['Pudding',"Savoury puddings include Yorkshire pudding, black pudding, suet pudding and steak and kidney pudding."]],
 hint:['Pudding',"often set using cornstarch, gelatin or similar coagulating agent"],why:'달콤한 디저트 푸딩의 어원은 "작은 소시지" — 원래는 동물 창자에 고기를 채운 음식이었다',care:'어원은 "~로 여겨진다" 수준',hr:false},
{a:'연',also:['kite','가오리연','방패연'],major:'생활·상식',mid:'세계 언어·어원',
 core:['Kite',"In China, the kite has been claimed as the invention of the 5th-century BC Chinese philosophers Mozi and Lu Ban, who flew wooden kites called muyuan (木鸢)."],
 story:[['Kite',"With the invention of paper in the Han dynasty, kites made of paper became popular, and kites were called zhiyuan (纸鸢)."],['Kite',"In the pre-modern period, Malays in Singapore used kites for fishing."],['Kite',"After its introduction into India, the kite further evolved into the fighter kite"]],
 hint:['Kite',"Kites were known throughout Polynesia, as far as New Zealand"],why:'처음엔 나무로 만든 "나무 솔개"였고, 어떤 곳에선 낚시 도구로 썼다',care:'한 글자 정답 — 질문은 "하늘에 띄우는 놀이 도구"로 동음이의를 막을 것. 기원은 "~라고 알려졌다"',legend:true,hr:false},
{a:'포크',also:['fork','식탁용 포크'],major:'생활·상식',mid:'세계 음식·요리',
 core:['Fork',"the personal table fork was most likely invented in the Eastern Roman (Byzantine) Empire, where they were in common use by the 4th century."],
 story:[['Fork',"Damian condemned the fork as \"vanity\"."],['Fork',"for many years it was viewed as an unmanly Italian affectation."],['Fork',"It was not until the 18th century that the fork became commonly used in Great Britain"]],
 hint:['Fork',"Records show that by the 9th century in some elite circles of Persia a similar utensil known as a barjyn was in limited use."],why:'지금은 당연한 포크를 한때 성직자가 허영이라 비난했고, 영국에서는 남자답지 못하다고 여겼다',care:'페트루스 다미아누스 일화는 "~라고 한다" 수준',legend:true,hr:false},
{a:'열기구',also:['hot air balloon','기구'],major:'기술·의학',mid:'항공·우주 기술',
 core:['Hot_air_balloon',"The hot air balloon is the first successful human-carrying flight technology."],
 story:[['Hot_air_balloon',"King Louis XVI had originally decreed that condemned criminals would be the first pilots, but de Rozier, along with Marquis François d'Arlandes, petitioned successfully for the honor."],['Hot_air_balloon',"The first free flight with human passengers was made a few weeks later, on November 21, 1783."],['Hot_air_balloon',"demonstrated it publicly on September 19, 1783, making an unmanned flight lasting 10 minutes."]],
 hint:['Hot_air_balloon',"Hot air balloons that can be propelled through the air rather than simply drifting with the wind are known as thermal airships."],why:'최초 비행사는 사형수가 될 뻔했는데, 두 사람이 "내가 타겠다"고 청원해 그 영광을 얻었다',care:'',hr:false},
{a:'재채기',also:['sneeze'],major:'자연과학',mid:'인체·해부',
 core:['Sneeze',null],
 story:[['Sneeze',"a sneeze without an obvious cause was generally perceived as a sign that someone was talking about the sneezer at that very moment."],['Sneeze',"In 2020, sneezes were recorded generating plumes of up to 8 meters (26 ft)."]],
 hint:null,why:'"누가 내 얘기 하나 보다" — 한중일 베트남이 같은 미신을 갖고 있고, 세 번 연속이면 사랑에 빠진 사람이 있다는 뜻',care:'미신 부분은 풍습으로만(사실 아님)',legend:true,hr:false},
{a:'사랑니',also:['지치','wisdom tooth','third molar'],major:'자연과학',mid:'인체·해부',
 core:['Wisdom_tooth',"The third molar, commonly called wisdom tooth, is the most posterior of the three molars in each quadrant of the human dentition."],
 story:[['Wisdom_tooth',"The oldest known impacted wisdom tooth belonged to a European woman who lived between 13,000 and 11,000 BCE, in the Magdalenian period."],['Wisdom_tooth',"With the Industrial Revolution, the affliction became ten times more common, owing to the new prevalence of soft, processed foods."]],
 hint:['Wisdom_tooth',"Most adults have four wisdom teeth, one in each of the four quadrants"],why:'부드러운 음식이 늘면서 사랑니 문제가 열 배로 늘었다 — 영어 이름은 "지혜의 이", 한국어는 "사랑의 이"',care:'한국어 이름 "사랑니"의 유래(첫사랑을 앓을 나이에 난다)는 이번에 열지 않았다 — 질문에 쓰지 않는다. 영어판 사실만',hr:false},
{a:'맨홀 뚜껑',also:['맨홀뚜껑','맨홀 덮개','manhole cover'],major:'기술·의학',mid:'재료·건설 기술',
 core:['Manhole_cover',"A manhole cover is a removable plate forming the lid over the opening of a manhole, an opening large enough for a person to pass through."],
 story:[['Manhole_cover',"The question of why manhole covers are typically round (in some countries) was made famous by Microsoft when they began asking it as a job-interview question."],['Manhole_cover',"A round manhole cover cannot fall through its circular opening, whereas a square manhole cover might fall in if it were inserted diagonally in the hole."],['Manhole_cover',"95% of Japanese municipalities have their own cover design, often with colorful inlaid paint."]],
 hint:['Manhole_cover',"It is designed to prevent anyone or anything from falling in, and to keep out unauthorized persons and material."],why:'왜 둥글까? 마이크로소프트 면접 질문으로 유명 — 사각이면 대각선으로 빠진다',care:'',hr:true},
];
let bad=0;
const n=s=>s.replace(/\s+/g,' ');
function mk(t,pair){ if(!pair) return null; const [f,txt]=pair; const src=fs.readFileSync(D+'en_'+f+'.txt','utf8'); if(!n(src).includes(n(txt))){console.log('MISS',t,f,txt.slice(0,70));bad++;} return {text:txt,url:W(f),quote:txt}; }
const out=[];let k=4801;
for(const it of items){
 if(it.a==='재채기'){ const src=fs.readFileSync(D+'en_Sneeze.txt','utf8'); it.core=['Sneeze',src.split('\n')[0].split('. ')[0]+'.']; it.hint=['Sneeze',"Until recently, the maximum visible distance over which the sneeze plumes (or puffs) travel was observed at 0.6 metres (2.0 ft)"]; }
 const o={key:'n'+k++,answer:it.a,also:it.also,spelling:'?',major:it.major,mid:it.mid,gradeGuess:1,
  core:mk(it.a,it.core),story:it.story.map(s=>mk(it.a,s)),hintIdea:mk(it.a,it.hint),legend:!!it.legend,care:it.care,why:it.why,hintRisk:it.hr||/\s/.test(it.a),spellNote:''};
 if(it.a==='생일 케이크')o.spellNote='표준국어대사전에 없음 · 한국어 위키백과 표제어 "생일 케이크"(띄어 씀)를 따르고 붙여 쓴 꼴을 also 에';
 if(it.a==='연')o.spellNote='표준국어대사전 표제어 "연" 은 동음이의가 많음 — 질문에서 뜻을 분명히';
 out.push(o);
}
const res={done:true,chunk:'새재료-48',lane:'easy',grade:1,items:out,dropped:{dupActive:150,weakStory:4,noSource:0,other:1},opened:22};
if(!bad){fs.writeFileSync('data/pipeline/audit/g111-raw/chunk-48.json',JSON.stringify(res,null,1));console.log('written',out.length);} else console.log('bad',bad);
