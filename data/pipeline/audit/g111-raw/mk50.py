import json
D="tmp50/"
KO="https://ko.wikipedia.org/wiki/"; EN="https://en.wikipedia.org/wiki/"
def L(text,f,q):
    t=open(D+f,encoding="utf-8").read()
    assert q in t,(f,q)
    base=f[:2]; title=f[3:-4]
    url=(KO if base=="ko" else EN)+title.replace(" ","_")
    return {"text":text,"url":url,"quote":q}
items=[]
def add(answer,also,major,mid,core,story,hint,why,legend=False,care="",hr=False,sn=""):
    items.append({"key":"n%04d"%(5001+len(items)),"answer":answer,"also":also,"spelling":"?","major":major,"mid":mid,"gradeGuess":1,
     "core":core,"story":story,"hintIdea":hint,"legend":legend,"care":care,"why":why,"hintRisk":hr,"spellNote":sn})

add("건빵",["乾パン"],"한국","한국 음식",
 L("비스킷으로 분류되는, 군대에서 별사탕과 함께 주는 딱딱한 마른 빵","ko-건빵.txt","건빵은 하드택의 한 종류로 ‘빵’으로 불리지만 비스킷으로 분류된다."),
 [L("건빵의 이름은 일본이 1904년 전투식량용으로 개발한 비스킷 '여러 번 구운 빵'에서 '마른 빵'으로 바뀐 데서 왔다","ko-건빵.txt","이것이 이후에 ‘마른 빵’이라는 뜻의 ‘건면포(乾麺麭)’로 불리다가"),
  L("해방 뒤 일본인이 모두 돌아가 혼자 기계를 다룰 줄 알던 이순택이 건빵을 만들어 팔았다","ko-건빵.txt","그 기계를 혼자 다룰 수 있었던 이순택은 그것을 바탕으로 건빵이라는 과자를 만들어 냈다."),
  L("한국전쟁 때 공장이 폭격으로 부서진 것을 기회 삼아 피난한 이순택은 부산에서 다시 국군에 납품했고, 그 공장의 후계자들이 해태제과 등에서 건빵을 대중화했다","ko-건빵.txt","그 공장에서 배운 후계자들이 제빵, 제과업체(대표적으로 해태제과)에서 건빵을 대중화하였다.")],
 L("건빵 봉지 속에는 목이 메지 않게 별사탕이 따로 들어 있다","ko-건빵.txt","이럴 경우 사용하는 것이 동봉된 별사탕이다."),
 "누구나 아는 군대 간식이 해방 뒤 기계 다룰 줄 아는 단 한 사람에서 시작됐다")

add("포크",["fork"],"생활·상식","세계 음식·요리",
 L("서양 식탁에서 음식을 찍어 먹는 갈래진 식기","ko-포크.txt","포크(fork)는 음식을 집어 먹을 때 사용하는 식기이다."),
 [L("비잔틴 제국에서는 이미 4세기에 식탁용 포크가 흔히 쓰였다","en-Fork.txt","where they were in common use by the 4th century."),
  L("1004년 비잔틴 공주가 황금 포크를 베네치아에 가져오자 피에트로 다미아니는 이를 '허영'이라고 비난했다","en-Fork.txt","Damian condemned the fork as \"vanity\"."),
  L("신성로마제국 궁정은 손 대신 포크로 먹는 비잔틴 공주 테오파누를 보고 놀랐다고 한다","en-Fork.txt","because she was using a fork instead of her hands when she was eating.")],
 L("포크는 베네치아에서 처음 도입되어 유럽 전체로 전파됐다","ko-포크.txt","포크는 베네치아에서 처음 도입되어 나중에 유럽 전체로 전파되었다."),
 "손으로 먹던 유럽이 포크를 '허영'이라 욕했다 — 포크의 고향은 동로마였다",legend=False,care="테오파누 일화는 'some authors' 전언이라 '~라고 합니다'로")

add("안경",["eyeglasses","glasses"],"생활·상식","의복·패션",
 L("눈의 굴절 이상을 보정하거나 눈을 보호하려고 쓰는, 안경테와 안경알로 이루어진 기구","ko-안경.txt","안경(眼鏡)은 눈의 굴절 이상을 보정하거나, 눈을 보호하거나, 몸을 치장하기 위한 기구이다."),
 [L("가장 오래된 조상은 13세기 이탈리아의 팔이 없는 '읽기용 돌'이라 책 위에 손으로 들고 있어야 했다","en-Eyeglasses.txt","Due to the objects having no arms, wearers had to hold these magnifying spheres directly over their books."),
  L("귀에 거는 다리는 1700년대에야 발명됐다","en-Eyeglasses.txt","The familiar temple arms that hook over a wearer's ears were not invented until the 1700s."),
  L("초기 안경은 손잡이 쪽을 리벳으로 이은 돋보기 두 개로 코를 집어 고정했다","en-Eyeglasses.txt","Early frames for glasses consisted of two magnifying glasses riveted together by the handles so that they could grip the nose.")],
 L("시인 페트라르카는 편지에서 60세가 될 때까지 안경이 필요 없었다고 썼다","en-Eyeglasses.txt","Francesco Petrarca says in one of his letters that, until he was 60, he did not need glasses"),
 "안경이 400~500년 동안 귀에 걸리지 않았다")

add("가위바위보",["Rock paper scissors","rock-paper-scissors"],"한국","한국 전통문화·풍습",
 L("가위, 바위, 보 세 손 모양을 동시에 내어 상성으로 승부를 가르는 게임","ko-가위바위보.txt","가위바위보(문화어: 돌가위보, 영어: Rock Paper Scissors)는 2명 이상의 사람들이 ‘가위, 바위, 보’를 외치며 ‘보’를 외칠 때 동시에 각자 가위나 바위나 보를 내어 상성 관계에 따라 승부를 결정짓는 게임이다."),
 [L("명나라 책에는 이 놀이가 한나라 때 군벌들이 했던 것이라고 적혀 있다","en-Rock paper scissors.txt","who wrote that the game dated back to the time of the Han dynasty, where it was played by warlords."),
  L("일본에는 엄지 개구리 · 새끼손가락 민달팽이 · 검지 뱀이 서로 이기는 '벌레 주먹'이 먼저 들어왔다","en-Rock paper scissors.txt","In mushi-ken the \"frog\" (represented by the thumb) triumphs over the \"slug\" (represented by the little finger), which, in turn prevails over the \"snake\" (represented by the index finger), which triumphs over the \"frog\"."),
  L("영어 이름은 일본어 세 손짓 이름의 번역이다","en-Rock paper scissors.txt","The name \"rock paper scissors\" is simply a translation of the Japanese words for the three gestures involved in the game")],
 L("'로샹보'라는 이름이 로샹보 백작이 이 놀이를 했다는 이야기에서 왔다는 설은 근거 없는 전설이다","en-Rock paper scissors.txt","The legend that he played the game is apocryphal, as all evidence points to the game being brought to the United States later than 1910"),
 "누구나 하는 가위바위보의 조상은 개구리 · 뱀 · 민달팽이였다",care="기원은 중국 · 일본 — 분야(한국 전통 놀이)는 중앙에서 조정 가능 · 개구리 이야기는 벌레 주먹(무시켄) 사실이고 가위바위보 자체가 아니다")

add("형광펜",["하이라이터","Highlighter","Hi-Liter"],"기술·의학","발명·발견",
 L("강조하고 싶은 글 위에 덧칠해 눈에 띄게 하는 투명한 형광 잉크 필기구","ko-형광펜.txt","형광펜(영어: Highlighter, 일본어: 蛍光ペン, 중국어: 荧光笔)은 필기도구의 하나로, 강조하고 싶은 글 위에 덧칠해서 눈에 잘 띄게 한다."),
 [L("처음 개발한 사람은 미국 카터스 잉크 사의 사람이고 HI-LITER라는 상표로 출시됐다","ko-형광펜.txt","형광펜을 처음 개발한 사람은 미국의 Carter's Ink라는 회사의 프란시스 혼으로, 당시 HI-LITER라는 이름의 브랜드로 출시되었다."),
  L("가장 흔한 노란색은 피라닌에서 나온다","en-Highlighter.txt","A typical highlighter is fluorescent yellow, with the colour coming from pyranine."),
  L("복사할 때 노란색은 그림자가 생기지 않아 가장 좋다","en-Highlighter.txt","Yellow is the preferred colour to use when making a photocopy as it will not produce a shadow on the copy.")],
 L("형광 잉크는 검은 빛 아래에서 빛난다","en-Highlighter.txt","Being fluorescent, highlighter ink glows under black light."),
 "형광펜은 펠트 마커에서 뻗어 나온 발명품이고 노란색이 복사기에 안 찍힌다",care="ko 위키는 1962년 일본 · 혼 설, en 위키는 혼 1963 — 연도 단정 말 것")

add("이쑤시개",["toothpick"],"기술·의학","의학·건강 상식",
 L("이 사이에 낀 음식물을 빼내려고 쓰는 가늘고 뾰족한 막대","ko-이쑤시개.txt","이쑤시개는 이 사이에 낀 이물질을 제거하기 위해 사용하는 것으로"),
 [L("이쑤시개로 버드나무 가지를 쓰던 시절 이를 버드나무 가지라는 뜻의 양지(楊枝)라 불렀고, 이것이 이를 닦는 '양치'가 되었다","ko-이쑤시개.txt","이 때문에 이쑤시개를 버드나무 가지란 뜻의 양지(楊枝)라고 불렀으며, 양지는 시간이 지남에 따라 발음이 변형되어 오늘날에는 이를 닦는 것을 뜻하는 양치란 단어로 바뀌었다."),
  L("조지아에서 발견된 약 180만 년 전 호미닌 화석에 이쑤시개를 반복해서 쓴 흔적이 있다","en-Toothpick.txt","Hominin remains from Dmanisi, Georgia, dated to about 1.8 million years ago, bear lesions indicating the repeated use of a \"toothpick\"."),
  L("17세기 유럽에서는 보석 박힌 귀금속 사치품이었다","en-Toothpick.txt","In the 17th century, toothpicks were luxury objects and like jewelry, were artfully stylized using precious metal and set with expensive stones.")],
 L("치아 청소 도구 중 가장 오래된 도구다","en-Toothpick.txt","the toothpick is the oldest instrument for dental cleaning."),
 "양치라는 말의 뿌리가 이쑤시개 버드나무 가지다",care="양치 어원은 ko 위키 한 줄 — 표준국어대사전 '양치' 풀이로 중앙에서 확인 권장")

add("리모컨",["리모콘","원격 조정기","remote control"],"기술·의학","발명·발견",
 L("멀리서 TV 같은 기기를 조작하는 휴대용 장치","ko-리모컨.txt","전자공학에서 리모컨(← remote control, clicker, 문화어: 먼거리조종기) 또는 원격 조정기(遠隔調整機) 또는 클리커는 보통 무선 통신을 통해 멀리 떨어진 곳에서 다른 장치를 작동시키는 데 사용되는 전자 장치다."),
 [L("1950년 제니스의 첫 TV 리모컨 '레이지 본즈'는 전선으로 TV와 이어져 있었다","en-Remote control.txt","The remote, called Lazy Bones, was connected to the television by a wire."),
  L("1955년 무선 플래시매틱은 빛으로 작동했지만 다른 빛과 리모컨 빛을 구별하지 못했다","en-Remote control.txt","but the cell did not distinguish between light from the remote and light from other sources."),
  L("1956년 스페이스 커맨드는 버튼이 막대를 때려 초음파를 내서 '클리커'라 불렸다","en-Remote control.txt","When the user pushed a button on the remote control, it struck a bar and clicked, hence they were commonly called \"clickers\"")],
 L("초기 TV 리모컨(1956~1977년)은 초음파를 썼고 지금은 적외선 펄스를 쓴다","ko-리모컨.txt","초기 텔레비전 리모컨(1956~1977년)은 초음파 톤을 사용했다."),
 "처음 리모컨은 '딸깍' 소리로 채널을 바꿨다",sn="한국어 위키백과 표제어 '리모컨'을 따름 · 리모콘은 also")

add("메로나",["Melona"],"한국","한국 음식",
 L("빙그레가 1992년에 낸 연두색 막대 아이스크림","ko-메로나.txt","메로나(Melona)는 대한민국 빙그레에서 1992년에 출시한 막대 아이스크림이다."),
 [L("1991년 빙그레는 동남아 시장 조사 중 멜론에 주목했는데 당시 한국에서 멜론은 희귀한 과일이라 소비자에게 낯설었다","ko-메로나.txt","당시 한국에는 멜론이 희귀한 과일이어서 새로운 맛이라고 판단한 빙그레는 제품 개발에 나섰으나 소비자에겐 메론이 생소하여 '메론 맛'이 낯설 수밖에 없었다."),
  L("멜론과 맛이 비슷한 참외를 시식하며 개발했지만 향이 참외 향이라는 것은 잘못된 사실이다","ko-메로나.txt","그러나 참외를 참고만 했을 뿐, 메로나에 들어가는 향이 참외 향이라는 것은 잘못된 사실이다."),
  L("겨울이 비수기인 점을 노려 남반구 브라질로 2007년 진출했다","ko-메로나.txt","한편 빙그레는 아이스크림이 비수기인 겨울에도 매출을 올리기 위해 남반구의 브라질로 2007년 진출했다.")],
 L("미국에선 1995년부터, 브라질에선 2007년부터 팔렸고 16개국에서 판매된다","ko-메로나.txt","미국에선 1995년부터, 브라질에선 2007년부터 판매되기 시작했으며 16개국에서 판매된다."),
 "참외 맛이라는 소문이 있지만 아니고, 한겨울 브라질까지 갔다",sn="한국어 위키백과 표제어를 따름")

add("꼬깔콘",["Bugles","돈가리콘"],"한국","한국 음식",
 L("롯데가 1983년에 낸 옥수수 과자","ko-꼬깔콘.txt","꼬깔콘은 롯데웰푸드에서 1983년에 출시한 옥수수로 만든 과자이다."),
 [L("옥수수 영문명 'Corn' 을 붙여 이름이 만들어졌다","ko-꼬깔콘.txt","옥수수의 영문명인 'Corn' 을 붙여 '꼬깔콘'이라는 이름이 만들어졌다."),
  L("미국 제너럴 밀스와 기술 제휴로 개발했다","ko-꼬깔콘.txt","꼬깔콘은 1982년 5월 당시 롯데제과와 미국의 식품 기업 제너럴 밀스의 기술 제휴를 통해 개발되었다."),
  L("일본에는 거의 똑같은 과자 '돈가리콘'이 있고 영어권에서는 버글스로 팔린다","ko-꼬깔콘.txt","일본에서는 꼬깔콘과 거의 똑같은 과자인 돈가리콘을 제조하여 판매하고 있다. 영어권 국가에서는 버글스(Bugles)라는 이름으로 판매되고 있다.")],
 L("출시 이후 2022년 12월까지 누적 매출이 1조 5,650억 원이다","ko-꼬깔콘.txt","1983년 출시 이후 2022년 12월까지의 누적 매출은 1조 5,650억 원으로 집계되었다."),
 "손가락에 끼워 먹는 과자가 미국 과자 버글스와 같은 제품이었다",sn="한국어 위키백과 표제어를 따름")

add("죠리퐁",["조리퐁"],"한국","한국 음식",
 L("튀긴 밀쌀에 당액을 입힌 크라운제과의 과자","ko-조리퐁.txt","튀겨낸 밀쌀에 당액을 입힌 과자로"),
 [L("크라운제과 기술진이 뻥튀기의 원리에서 착안해 만들었다","ko-조리퐁.txt","크라운제과 기술진이 뻥튀기에서 제품 생성 원리에서 착안해서 만들었다."),
  L("2001년 라디오 '신해철의 고스트스테이션'의 사연으로 한 봉지 속 개수를 일일이 세는 놀이가 유행했다","ko-조리퐁.txt","2001년, '신해철의 고스트스테이션'이라는 라디오에서 청취자의 사연을 시작으로 한 봉지에 들어있는 죠리퐁의 개수를 일일이 세는 것에서 시작된 이후로"),
  L("이 유행은 고래밥 속 과자 종류나 콘택 600 알갱이 개수를 세는 글로 번졌다","ko-조리퐁.txt","이에 영향을 받아 고래밥에 들어있는 과자의 종류나 콘택 600에 들어있는 알갱이의 개수를 세었다는 글을 올리는 사람도 있었다.")],
 L("죠리퐁은 1972년에 출시됐다","ko-조리퐁.txt","죠리퐁은 1972년에 출시된 크라운제과의 과자이다."),
 "과자 개수를 세는 놀이가 2001년 한 라디오 사연에서 시작됐다",care="죠리퐁 괴담(성적 소문)은 쓰지 않음 · 개수 평균(1,647 · 1,393)은 서로 달라 쓰지 않음",sn="한국어 위키백과 문서가 '죠리퐁' · 흔한 표기 조리퐁은 also")

add("푸딩",["pudding"],"생활·상식","세계 음식·요리",
 L("식사 뒤에 나오는 달콤하고 부드러운 후식","ko-푸딩.txt","푸딩(pudding)은 주요 식사 후 제공되는 후식이거나"),
 [L("푸딩이라는 말은 '작은 소시지'를 뜻하는 라틴어 botellus에서 파생됐을 수 있는 프랑스어 boudin에서 왔다고 믿어진다","ko-푸딩.txt","푸딩이라는 단어는 프랑스어 boudin에서 유래했다고 믿어지며, 이는 라틴어 botellus에서 파생되었을 수 있다."),
  L("미국에서 디저트가 된 것은 원래 고기와 재료를 소시지처럼 찌거나 삶아 굳힌 짭짤한 요리에서 진화한 것이다","ko-푸딩.txt","푸딩이라는 용어가 원래 주로 세이보리 요리를 묘사하는 데 사용되었던 것에서 현대 미국에서 디저트를 의미하게 된 것은"),
  L("영국에서는 푸딩이 후식의 동의어로 쓰인다","ko-푸딩.txt","영국에서는 푸딩이 후식의 동의어로 사용된다.")],
 L("영국 · 아일랜드 등에서는 푸딩이 달콤한 것과 짭짤한 요리를 모두 가리킨다","ko-푸딩.txt","영국, 아일랜드 및 일부 영연방 국가에서는 푸딩이라는 단어가 달콤하고 세이보리한 요리를 모두 가리키는 데 사용된다."),
 "달콤한 디저트의 이름이 원래 작은 소시지였다")

add("만년필",["fountain pen"],"기술·의학","발명·발견",
 L("잉크를 몸통 속에 담아 두고 쓰는 펜","en-Fountain pen.txt","was provided with a pen that held ink in a reservoir, allowing it to be held upside-down without leaking."),
 [L("10세기 이집트의 칼리프가 손과 옷을 더럽히지 않는 펜을 요구해 잉크통이 든 펜을 받았다","en-Fountain pen.txt","demanded a pen that would not stain his hands or clothes"),
  L("레오나르도 다 빈치의 수첩에는 만년필로 보이는 단면 그림이 있고 글씨 농도가 일정해 실제로 썼다는 증거가 있다","en-Fountain pen.txt","There is compelling evidence that a working fountain pen was constructed and used during the Renaissance by artist and inventor Leonardo da Vinci."),
  L("1636년 독일 발명가는 깃촉 두 개로 한쪽을 잉크통으로 쓴 펜을 설명했다","en-Fountain pen.txt","described a pen made from two quills. One quill served as a reservoir for ink inside the other quill.")],
 L("1663년 일기 작가 새뮤얼 피프스는 잉크를 담아 다니는 은 펜을 받았다고 썼다","en-Fountain pen.txt","In 1663, the diarist Samuel Pepys wrote to have been given a silver pen \"to carry inke in\"."),
 "만년필의 시작은 10세기 칼리프의 '손 안 더러워지는 펜' 주문이었다",legend=False,care="레오나르도는 '증거가 있다고 본다' 정도로 · 실물은 남아 있지 않음")

add("스테이플러",["호치키스","stapler"],"기술·의학","발명·발견",
 L("얇은 금속 침(스테이플)으로 종이를 고정하는 장치","ko-스테이플러.txt","스테이플러(stapler) 또는 지철기(紙綴器)는 가는 금속 부품(스테이플)을 이용해 종이나 이와 유사한 재료를 고정시킬 수 있게 해주는 장치다."),
 [L("1841년 특허는 흔히 최초의 스테이플러로 알려졌지만 사실 핀을 포장하는 장치였다","en-Stapler.txt","which is often believed to be the first stapler. But their patent (September 30, 1841, Patent #2275) is for a device used for packaging pins."),
  L("1866년 조지 맥길이 구부러지는 황동 종이 고정침으로 특허를 얻었다","en-Stapler.txt","In 1866, George McGill received U.S. patent 56,587 for a small, bendable brass paper fastener that was a precursor to the modern staple."),
  L("그는 1876년 필라델피아 박람회에 이 발명을 선보였다","en-Stapler.txt","He showed his invention at the 1876 Centennial Exhibition in Philadelphia, Pennsylvania")],
 None,"최초의 스테이플러라는 통념이 사실은 핀 포장기였다",care="ko 위키의 '루이 15세 왕실 문양' 이야기는 en 위키와 달라 쓰지 않음 · '호치키스'는 상표에서 온 말이라 also 에만",sn="표준국어대사전 표제어 확인 필요")

out={"done":True,"chunk":"새재료-50","lane":"easy","grade":1,"items":items,
 "dropped":{"dupActive":50,"weakStory":4,"noSource":0,"other":2},"opened":30}
open("chunk-50.json","w",encoding="utf-8").write(json.dumps(out,ensure_ascii=False,indent=1))
print(len(items))
