import fs from 'fs';
const W=t=>`https://en.wikipedia.org/wiki/${t}`;
const T={};const txt=f=>T[f]??=fs.readFileSync(`tmp18/en-${f}.txt`,'utf8').replace(/\s+/g,' ');
const L=(f,quote,text)=>({text,url:W(f),quote,_f:f});
const items=[];
const add=(o)=>items.push(o);
const base={spelling:"?",gradeGuess:1,legend:false,care:"",hintRisk:false,spellNote:"",hintIdea:null};
add({...base,answer:"하모니카",also:["harmonica","mouth organ"],major:"문화·예술",mid:"음악 이론·악기",
 core:L("Harmonica","The harmonica, also known as a French harp or mouth organ, is a free reed wind instrument","입으로 불거나 들이마셔서 소리를 내는 작은 리드 악기(마우스 오르간)"),
 story:[L("Harmonica","Christian Friedrich Ludwig Buschmann is often cited as the inventor of the harmonica in 1821, but other inventors developed similar instruments at the same time.","흔히 1821년 부슈만이 발명했다고 하지만 같은 때 비슷한 악기를 만든 사람이 여럿 있었다"),
  L("Harmonica","In 1829, Charles Wheatstone developed a mouth-organ under the name \"Aeolina\"","1829년 찰스 휘트스톤도 '에올리나'라는 이름의 입 오르간을 만들었다"),
  L("Harmonica","US president Abraham Lincoln carried a harmonica in his pocket, and harmonicas provided solace to soldiers on both the Union and Confederate sides of the American Civil War.","링컨 대통령이 주머니에 넣고 다녔고, 남북전쟁 때 양쪽 병사들의 위로가 되었다")],
 hintIdea:L("Harmonica","giving it a powerful, distorted sound somewhat reminiscent of a saxophone, hence the term \"Mississippi saxophone\".","블루스 연주자가 두 손으로 감싸 쥐고 불면 색소폰 같은 소리가 나서 '미시시피 색소폰'이라 불렸다"),
 why:"주머니 속 작은 악기가 링컨과 남북전쟁 병사들의 친구였다"});
add({...base,answer:"생일 축하 노래",also:["생일 축하합니다","해피 버스데이","Happy Birthday to You","Happy Birthday"],major:"문화·예술",mid:"음악 이론·악기",hintRisk:true,
 spellNote:"국어사전에 표제어 없음 · 한국어 위키 제목은 못 열어 확인 못 함(429) · 노래 이름으로 흔한 꼴 + also 에 원제",
 core:L("Happy_Birthday_to_You","According to the 1998 Guinness World Records, it is the most recognized song in the English language","기네스 세계 기록(1998)이 영어권에서 가장 널리 알려진 노래로 꼽은 생일 노래"),
 story:[L("Happy_Birthday_to_You","The melody of \"Happy Birthday to You\" comes from the song \"Good Morning to All\"","멜로디는 원래 '굿모닝 투 올'이라는 아침 인사 노래였다"),
  L("Happy_Birthday_to_You","The sisters used \"Good Morning to All\" as a song that young children would find easy to sing.","유치원 교사 힐 자매가 아이들이 쉽게 부르라고 만든 노래로 알려져 있다"),
  L("Happy_Birthday_to_You","in 2015, the copyright claim was declared invalid, and in 2016, Warner Chappell agreed to pay back $14 million in licensing fees.","한때 워너가 저작권료를 받았으나 2015년 저작권 주장이 무효가 되었고 2016년 1,400만 달러를 돌려주기로 했다")],
 hintIdea:L("Happy_Birthday_to_You","The song's base lyrics have been translated into at least 18 languages.","가사가 적어도 18개 언어로 옮겨졌다"),
 why:"원래는 아침 인사 노래였고 한동안 부르면 돈을 내야 했던 노래"});
add({...base,answer:"오르골",also:["뮤직박스","music box"],major:"문화·예술",mid:"음악 이론·악기",
 core:L("Music_box","A music box (American English) or musical box (British English) is an automatic musical instrument in a box that produces musical notes by using a set of pins placed on a revolving cylinder or disc to pluck the tuned teeth (or lamellae) of a steel comb.","돌아가는 원통의 핀이 강철 빗살을 튕겨 저절로 연주하는 상자"),
 story:[L("Music_box","The popular device best known today as a \"music box\" developed from musical snuff boxes of the 18th century","18세기 음악이 나오는 코담뱃갑에서 발전했다"),
  L("Music_box","Early 13th century: In Flanders, an ingenious bell ringer invented a cylinder with pins which operates cams, which then hit the bells.","13세기 플랑드르의 종지기가 핀 박힌 원통으로 종을 치게 했던 것이 뿌리"),
  L("Music_box","1796: Antoine Favre-Salomon, a clockmaker from Geneva replaced the stack of bells by a comb with multiple pre-tuned metallic notes in order to reduce space.","1796년 제네바 시계공이 종 더미를 금속 빗으로 바꾸어 크기를 줄였다")],
 why:"종 대신 빗을 튕기게 바꾼 시계공의 아이디어"});
add({...base,answer:"지휘봉",also:["baton","바통"],major:"문화·예술",mid:"클래식 음악",
 core:L("Baton","A baton is a stick that is used by conductors primarily to enlarge and enhance the manual and bodily movements associated with directing an ensemble of musicians.","오케스트라 지휘자가 손동작을 크게 보이려고 쥐는 막대"),
 story:[L("Baton","On 8 January 1687, Jean-Baptiste Lully was conducting a Te Deum to celebrate Louis XIV of France's recent recovery from illness.","1687년 1월 루이 14세의 쾌유를 비는 테 데움을 작곡가 륄리가 이끌고 있었다"),
  L("Baton","he was beating time by banging a long staff (a precursor to the baton; the French word bâton actually meaning \"staff\") against the floor when he struck his toe, creating an abscess.","그는 긴 막대로 바닥을 쿵쿵 치며 박자를 맞추다 제 발가락을 찍어 곪았다"),
  L("Baton","The wound turned gangrenous, but Lully refused to have his toe amputated and the infection spread, resulting in his death on 22 March.","상처가 썩어들어 갔는데 발가락 절단을 거부해 그해 3월 숨졌다")],
 care:"1687년 일화는 영어 위키 기준 · 출처 그대로만 쓸 것",why:"박자 막대에 제 발등을 찍은 작곡가의 최후"});
add({...base,answer:"셀카봉",also:["셀피 스틱","selfie stick","셀프카메라봉"],major:"문화·예술",mid:"사진·디자인",
 spellNote:"국어사전에 없음 · 국내에서 '셀카봉'이 통용 · 한국어 위키 제목은 못 열어 확인 못 함(429) · also 에 셀피 스틱",
 core:L("Selfie_stick","A selfie stick is used to take photographs or video by positioning a digital camera device, typically a smartphone, beyond the normal range of the arm.","팔이 닿는 거리 밖에서 사진을 찍도록 스마트폰을 끝에 끼우는 막대"),
 story:[L("Selfie_stick","The 1983 Minolta Disc-7 camera had a convex mirror on its front to allow the composition of self-portraits, and its packaging showed the camera mounted on a stick while used for such a purpose.","1983년 미놀타 카메라 포장 상자에 이미 막대에 카메라를 단 모습이 실렸다"),
  L("Selfie_stick","A \"telescopic extender\" for compact handheld cameras was patented by Ueda Hiroshi and Mima Yujiro in 1983","같은 해 일본의 우에다 · 미마가 늘어나는 카메라 막대 특허를 냈다"),
  L("Selfie_stick","Museums, galleries and historical sites such as the Palace of Versailles have banned the sticks because of concerns about possible damage to priceless artworks and other objects.","작품이 상할까 베르사유 궁전 같은 곳은 금지했다")],
 why:"스마트폰보다 30년 앞서 나온 발명"});
add({...base,answer:"이글루",also:["igloo","iglu"],major:"문화·예술",mid:"건축",
 core:L("Igloo","also known as a snow house or snow hut, is a type of shelter built of suitable snow.","눈덩이를 쌓아 만든 반구형 집"),
 story:[L("Igloo","Although igloos are often associated with all Inuit, they were traditionally used only by the people of Canada's Central Arctic and the Qaanaaq area of Greenland.","모든 이누이트가 이글루에 산 것이 아니라 캐나다 중부 북극과 그린란드 일부 사람들만 썼다"),
  L("Igloo","Other Inuit tended to use snow to insulate their houses, which were constructed from whalebone and hides.","다른 이누이트는 고래뼈와 가죽으로 집을 짓고 눈은 단열에 썼다"),
  L("Igloo","Snow's insulating properties enable the inside of the igloo to remain relatively warm.","눈 속 공기주머니가 열을 막아 안은 상대적으로 따뜻하다")],
 why:"이글루는 모든 에스키모의 집이 아니었다"});
add({...base,answer:"리코더",also:["recorder"],major:"문화·예술",mid:"음악 이론·악기",
 core:L("Recorder","The recorder is a family of woodwind musical instruments and a member of the family of duct flutes that includes tin whistles and flageolets.","학교에서 누구나 부는 관악기"),
 story:[L("Recorder","The English verb record (from Middle-French , early thirteenth century) meant \"to learn by heart, to commit to memory, to go over in one's mind, to recite\"","이름의 뿌리는 '외우다 · 되새기다'라는 뜻의 옛 낱말(record)"),
  L("Recorder","It was long after the English recorder was so-named that it gained two additional meanings: \"silently practicing a tune\", or \"sing or render in song\"—both referring almost-exclusively to songbirds.","그 낱말은 나중에 새가 지저귀다는 뜻도 얻었다"),
  L("Recorder","Henry VIII was a recorder player; at his death in 1547 an inventory of his possessions included 76 recorders in consorts of various sizes and materials.","헨리 8세는 리코더를 즐겨 불어 죽을 때 남긴 물건 중 76개가 있었다")],
 why:"녹음기가 아니라 '외우다 · 새처럼 노래하다'에서 온 이름"});
add({...base,answer:"가고일",also:["gargoyle"],major:"문화·예술",mid:"건축",
 spellNote:"국어사전에 없음 · 국내에서 '가고일'로 통용 · 한국어 위키 제목은 못 열어 확인 못 함(429) · also 에 영문",
 core:L("Gargoyle","is a carved or formed grotesque with a spout designed to convey water from a roof","고딕 성당 지붕에 튀어나온 괴물 모양의 조각"),
 story:[L("Gargoyle","thereby preventing it from running down masonry walls and eroding the mortar between.","사실은 빗물을 벽에서 멀리 뱉어 내는 물받이 주둥이였다"),
  L("Gargoyle","Gargoyles are usually elongated fantastical animals because their length determines how far water is directed from the wall.","몸이 길쭉한 까닭은 길수록 물을 벽에서 멀리 보내기 때문"),
  L("Gargoyle","When not constructed as a waterspout and only serving an ornamental or artistic function, the technical term for such a sculpture is a grotesque, chimera, or boss.","물받이 구실이 없고 장식뿐이면 가고일이 아니라 그로테스크 · 키메라라 부른다")],
 hintIdea:L("Gargoyle","gargoyles are said to protect what they guard, such as a church, from any evil or harmful spirits.","악령으로부터 성당을 지킨다고 믿었다"),
 why:"무서운 괴물 조각의 정체는 빗물받이"});
add({...base,answer:"도레미파솔라시도",also:["도레미","솔페주","solfège"],major:"문화·예술",mid:"음악 이론·악기",
 spellNote:"사전 표제어는 '계이름' · 질문은 '음계를 부르는 이름'으로 · also 에 도레미",
 core:L("Solfège","Syllables are assigned to the notes of the scale and assist the musician in audiating","음계의 음에 붙인 음절 이름"),
 story:[L("Solfège","In eleventh-century Italy, the music theorist Guido of Arezzo invented a notational system that named the six notes of the hexachord after the first syllable of each line of the Latin hymn \"Ut queant laxis\"","11세기 이탈리아 귀도가 라틴 찬가 'Ut queant laxis' 각 줄의 첫 음절로 음 이름을 지었다"),
  L("Solfège","Each successive line of this hymn begins on the next scale degree, so each note's name was the syllable sung at that pitch in this hymn.","줄마다 한 음씩 높아지는 노래라 그 음에 부르던 글자가 이름이 되었다"),
  L("Solfège","Guido's system had only six notes, but \"si\" was added later as the seventh note of the diatonic scale.","처음엔 여섯 음뿐이고 '시'는 나중에 일곱째로 더해졌다")],
 why:"도레미는 옛 찬가의 첫 글자였다"});
add({...base,answer:"회전문",also:["revolving door"],major:"문화·예술",mid:"건축",
 core:L("Revolving_door","A revolving door typically consists of three or four doors that hang on a central shaft and rotate around a vertical axis within a cylindrical enclosure.","가운데 축에 문짝 서너 개가 매달려 빙글빙글 도는 출입문"),
 story:[L("Revolving_door","Theophilus Van Kannel of Philadelphia obtained US patent 387,571 on 7 August 1888, for a \"Storm-Door Structure\".","1888년 필라델피아의 반 카넬이 '폭풍 문'이라는 이름으로 특허를 받았다"),
  L("Revolving_door","effectually prevents the entrance of wind, snow, rain or dust","바람 · 눈 · 비 · 먼지가 들어오지 못하게 하는 것이 목적이었다"),
  L("Revolving_door","They are also energy efficient; they act as an airlock to prevent drafts, decreasing the loss of heating or cooling for the building as compared to a standard door.","늘 닫혀 있는 셈이라 냉난방 손실이 적다")],
 why:"사람이 편하라고가 아니라 바람을 막으려고 만든 문"});
add({...base,answer:"마천루",also:["skyscraper","고층 건물"],major:"문화·예술",mid:"건축",
 core:L("Skyscraper","A skyscraper is a very tall building or otherwise permanently habitable structure","하늘을 찌를 듯 아주 높은 건물"),
 story:[L("Skyscraper","The term \"skyscraper\" was first applied to buildings of steel-framed construction of at least 10 stories in the late 19th century, a result of public amazement at the tall buildings being built in major United States cities","19세기 말 미국 도시에 치솟은 건물을 보고 놀란 사람들이 붙인 이름"),
  L("Skyscraper","The first steel-frame skyscraper was the Home Insurance Building","첫 철골 고층 건물은 1885년 시카고의 10층짜리 홈 인슈어런스 빌딩"),
  L("Skyscraper","Otis later introduced the first commercial passenger elevators to the Equitable Life Building in 1870","1870년 승객용 엘리베이터가 들어선 건물을 첫 마천루로 꼽는 학자도 있다")],
 why:"10층짜리가 '하늘을 긁는 집'이라 불렸다"});
add({...base,answer:"서커스",also:["circus"],major:"문화·예술",mid:"공연·연극·뮤지컬",
 core:L("Circus","A circus is a company of performers who put on diverse entertainment shows that may include clowns, acrobats, trained animals, trapeze acts","곡예 · 동물 · 광대 쇼를 보여 주는 공연단"),
 story:[L("Circus","Although not the inventor of the medium, Newcastle-under-Lyme born Philip Astley is credited as the father of the modern circus.","현대 서커스의 아버지는 영국의 기병 출신 애스틀리"),
  L("Circus","In 1770, he hired acrobats, tightrope walkers, jugglers, and a clown to fill in the pauses between the equestrian demonstrations and thus chanced on the format which was later named a \"circus\".","말타기 쇼 사이 쉬는 시간을 메우려 곡예사와 광대를 불렀다가 우연히 서커스 꼴이 생겼다"),
  L("Circus","Many circus performances are still held in a ring","지금도 원형 무대에서 하는 곳이 많다")],
 why:"쉬는 시간 땜빵이 서커스가 되었다"});
add({...base,answer:"바이올린",also:["violin"],major:"문화·예술",mid:"클래식 음악",
 core:L("Violin","The violin, sometimes referred to as a fiddle, is a wooden chordophone, and is the smallest, and thus highest-pitched instrument (soprano) in regular use in the violin family.","현악기 가족 중 가장 작고 소리가 높은 악기"),
 story:[L("Violin","The word \"violin\" comes from Italian , a diminutive of viola.","이름은 '비올라'에 '작다'는 말이 붙은 이탈리아어"),
  L("Violin","perhaps [coming] from Vitula, Roman goddess of joy, or from related Latin verb , \"to cry out in joy or exaltation\".","뿌리는 로마의 기쁨의 여신 비툴라일지도 모른다"),
  L("Violin","Violinists and collectors particularly prize the fine historical instruments made by the Stradivari, Guarneri, Guadagnini and Amati families","스트라디바리 같은 옛 이탈리아 가문의 악기를 특히 귀하게 친다")],
 care:"비올라 낱말 설명이 위키에서도 'perhaps' — 단정하지 않기",why:"바이올린은 '작은 비올라'라는 이름"});
add({...base,answer:"오페라",also:["opera"],major:"문화·예술",mid:"클래식 음악",
 core:L("Opera","Opera is a form of Western theatre in which music is a fundamental component and dramatic roles are taken by singers.","배우 대신 가수들이 노래로 이야기를 이끌어 가는 서양 연극"),
 story:[L("Opera","(the literal translation of the Italian word \"opera\")","이탈리아어 opera 의 문자 그대로 뜻은 '작품'"),
  L("Opera","Opera originated in Italy at the end of the 16th century (with Jacopo Peri's mostly lost Dafne, produced in Florence in 1598)","16세기 말 이탈리아 피렌체에서 시작되었다"),
  L("Opera","The performance is typically given in an opera house, accompanied by an orchestra or smaller musical ensemble","공연장에서 오케스트라 반주에 맞춰 부른다")],
 why:"오페라는 그냥 '작품'이라는 뜻의 낱말이다"});
add({...base,answer:"연필",also:["pencil"],major:"문화·예술",mid:"사진·디자인",
 core:L("Pencil","is a writing or drawing implement with a solid pigment core in a protective casing","나무 속에 심을 넣은 필기구"),
 story:[L("Pencil","Graphite pencils (traditionally known as \"lead pencils\") produce grey or black marks that are easily erased","'납 연필'이라 불렸지만 심은 흑연"),
  L("Pencil","in 1565 (some sources say as early as 1500), a large deposit of graphite was discovered on the approach to Grey Knotts from the hamlet of Seathwaite in Borrowdale parish, Cumbria, England.","1565년경 영국 보로데일에서 흑연 덩어리가 발견되었다"),
  L("Pencil","It remains the only large-scale deposit of graphite ever found in this solid form.","그렇게 단단한 덩어리로 발견된 큰 흑연 광맥은 지금까지 그곳뿐")],
 why:"납이 하나도 안 들었는데 '납 연필'이라 불렀다"});
add({...base,answer:"피에로",also:["Pierrot","삐에로"],major:"문화·예술",mid:"공연·연극·뮤지컬",
 core:L("Pierrot","is a stock character of pantomime and commedia dell'arte whose origins date back to the late 17th-century Italian troupe of players performing in Paris","흰 얼굴 분장의 슬픈 광대 캐릭터"),
 story:[L("Pierrot","The name is a diminutive of Pierre (Peter), using the suffix -ot and derives from the Italian Pedrolino.","이름은 '작은 베드로'라는 뜻"),
  L("Pierrot","is that of the sad clown, often pining for love of Columbine","오늘날엔 사랑에 아파하는 슬픈 광대로 그려진다"),
  L("Pierrot","Performing unmasked, with a whitened face, he wears a loose white blouse with large buttons and wide white pantaloons.","가면 없이 얼굴을 하얗게 칠하고 단추 큰 흰 옷을 입는다")],
 why:"웃기는 광대처럼 보이지만 원래는 사랑에 우는 인물"});
add({...base,answer:"벽돌",also:["brick"],major:"문화·예술",mid:"건축",
 core:L("Brick","A brick is a type of building material used to build walls, pavements, and other elements in masonry construction.","점토로 빚어 굽는 직육면체 건축 재료"),
 story:[L("Brick","The earliest bricks were dried mudbricks, meaning that they were formed from clay-bearing earth or mud and dried (usually in the sun) until they were strong enough for use.","처음엔 굽지 않고 햇볕에 말린 진흙 벽돌이었다"),
  L("Brick","The oldest discovered bricks, originally made from shaped mud and dating before 7500 BC, were found at Tell Aswad","가장 오래된 벽돌은 기원전 7500년 이전 것이 발견되었다"),
  L("Brick","Air-dried bricks, also known as mudbricks, have a history older than fired bricks","굽는 벽돌보다 말린 벽돌의 역사가 더 길다")],
 why:"벽돌은 구워서 만들기 전에 먼저 말려서 만들었다"});
add({...base,answer:"굴뚝",also:["chimney"],major:"문화·예술",mid:"건축",
 core:L("Chimney","A chimney is an architectural ventilation structure made of masonry, clay or metal that isolates hot toxic exhaust gases or smoke","연기를 밖으로 내보내는 집의 높은 통"),
 story:[L("Chimney","Industrial chimney use dates to the Romans, who drew smoke from their bakeries with tubes embedded in the walls.","로마 사람들이 빵집 연기를 벽 속 관으로 뺀 것이 시작"),
  L("Chimney","However, domestic chimneys first appeared in large dwellings in northern Europe in the 12th century.","보통 집 굴뚝은 12세기 북유럽 큰 집에서 처음 등장했다"),
  L("Chimney","Chimneys are typically vertical, or as near as possible to vertical, to ensure that the gases flow smoothly, drawing air into the combustion","높을수록 공기를 빨아들여 불이 잘 탄다")],
 why:"옛 집엔 연기가 그냥 지붕 구멍으로 빠졌다"});
add({...base,answer:"지우개",also:["eraser","rubber"],major:"문화·예술",mid:"사진·디자인",
 core:L("Eraser","An eraser (also known as a rubber in some Commonwealth countries","글씨를 지우는 문구"),
 story:[L("Eraser","Before rubber erasers used today, tablets of wax were used to erase lead or charcoal marks from paper.","고무 지우개 전엔 밀랍 덩이로 지웠다"),
  L("Eraser","Crustless bread was used;","빵 껍질 뺀 속살로 지우기도 했다"),
  L("Eraser","including South Africa from which the material first used got its name","영국 등에선 지우개를 '러버'라 부른다")],
 why:"옛날엔 빵으로 지웠다"});
let bad=0;
items.forEach((it,i)=>{it.key='n'+(1801+i);
 for(const l of [it.core,...it.story,it.hintIdea].filter(Boolean)){
  const q=l.quote.replace(/\s+/g,' ');
  if(!txt(l._f).includes(q)){console.log('MISS',it.answer,'|',q.slice(0,70));bad++}
  delete l._f;}});
const out={done:true,chunk:"새재료-18",lane:"easy",items,dropped:{dupActive:11,weakStory:0,noSource:0,other:0},opened:21};
fs.writeFileSync('chunk-18.json',JSON.stringify(out,null,1));console.log(items.length,'miss',bad);
