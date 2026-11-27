import fs from 'fs';
const S = (f, q) => ({ f, q });
const items = [
{
  answer: '왕수', also: ['Aqua regia', '아쿠아 레기아'], major: '자연과학', mid: '화학·원소',
  core: ['왕수 ', S('ko:왕수', '진한 염산과 진한 질산을 3:1로 섞은 용액이다. 금이나 백금 등의 귀금속을 녹인다.')],
  coreText: '진한 염산과 진한 질산을 3:1로 섞은 용액으로, 금이나 백금 같은 귀금속도 녹인다.',
  story: [
    ['2차 세계대전 때 헝가리 화학자 헤베시가 독일인 노벨상 수상자 둘의 금 메달을 왕수에 녹여 나치의 압수를 피했다', S('ko:왕수', '헝가리의 화학자 죄르지 헤베시는 노벨 물리학상을 받은 독일인들인 막스 폰 라우에와 제임스 프랑크의 노벨상 메달을 왕수에 녹여서 나치가 압수해가는 것을 막았다.')],
    ['녹인 용액을 연구소 시약 선반에 다른 병들과 섞어 두었고, 전쟁이 끝난 뒤 금을 다시 뽑아 메달로 주조해 돌려주었다', S('ko:왕수', '헤베시는 노벨상 메달을 녹인 용액을 닐스 보어 연구소에 있는 자기 시약 선반에 보관했고, 백 개가량 되는 일반 화학 시약병 중 하나에 노벨상과 금이 들어있을 것이라고는 생각하지 못한 나치 병사들의 검열을 피할 수 있었다.')],
    ['만든 지 얼마 안 되면 효력을 잃어 쓸 때마다 새로 섞는다', S('ko:왕수', '하지만 시간이 지나면서 염화 니트로실이 증발함에 따라 왕수는 그 효력을 잃기 때문에, 사용할 때마다 새로 조제해서 사용한다.')],
  ],
  hint: ['이슬람 연금술사의 작품에서 처음 언급되었다', S('ko:왕수', '왕수는 무함마드 이븐 자카리야 알라지(854-925)와 같은 이슬람 연금술사의 작품에서 처음 언급되었고,')],
  legend: false, care: '', why: '금을 녹이는 액체가 전쟁 중 노벨상 메달을 나치에게서 숨겨 준 반전', hintRisk: false, spellNote: ''
},
{
  answer: '호문쿨루스', also: ['Homunculus', '호문클루스'], major: '인문·사회', mid: '신화',
  core: ['', S('ko:호문쿨루스', '유럽의 연금술사가 만들어 내는 인조인간, 및 만들어 내는 기술이다.')],
  coreText: '유럽 연금술사가 플라스크 안에서 만든다고 한 작은 인조인간(라틴어로 플라스크 속 작은 인간)',
  story: [
    ['르네상스 연금술사 파라켈수스의 책에 만드는 법이 나온다고 전한다', S('ko:호문쿨루스', '제법은 르네상스기의 연금술사 파라켈수스의 저작 De Natura Rerum (\'물의 본성에 대해\')에 의하면,')],
    ['파라켈수스는 성공했다고 여겨지지만 그가 죽은 뒤 다시 성공한 사람은 없었다고 한다', S('ko:호문쿨루스', '파라켈수스는 호문쿨루스의 생성에 성공했다고 여겨진다. 그러나, 그의 사후, 다시 성공한 사람은 없었다고 한다.')],
    ['태어날 때부터 모든 지식을 지녔고 플라스크 밖에서는 살 수 없다고 한다', S('ko:호문쿨루스', '호문쿨루스는 선천적으로 모든 지식을 몸에 걸치고 있다고 한다. 또 일설에 의하면 호문쿨루스는 플라스크 안에서 밖에 생존할 수 없다고 한다.')],
    ['괴테가 《파우스트》 제2부에 이 존재를 등장시켰다', S('ko:호문쿨루스', '18 - 19세기의 독일 문인 요한 볼프강 폰 괴테는 자신이 낳은 희곡 \'파우스트\' 제2부 제2막 중에서 이 호문쿨루스를 소재로 채택하고 있다.')],
  ],
  hint: ['플라스크 안에서만 살 수 있고 태어날 때부터 모든 지식을 안다고 전해지는 작은 존재', S('ko:호문쿨루스', '또 일설에 의하면 호문쿨루스는 플라스크 안에서 밖에 생존할 수 없다고 한다.')],
  legend: true, care: '재료(정액 · 대변 등)와 제조 과정은 쓰지 않는다. 뇌의 감각 지도를 뜻하는 "감각 호문쿨루스"와 구별(이 재료는 연금술 쪽). 출처는 위키백과 한 문서뿐 — 백과 둘째 출처 보강 권장', why: '연금술사가 플라스크에서 사람을 만들었다는 전설, 괴테 《파우스트》에도 등장', hintRisk: false, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '거울 신경 세포', also: ['거울신경세포', '거울 뉴런', '거울뉴런', 'Mirror neuron'], major: '자연과학', mid: '인체·해부',
  core: ['', S('ko:거울 신경 세포', '특정 운동을 직접 할 때나 동일한 운동을 수행하는 다른 개체를 관찰할 때에 모두 동일하게 활성화되는 신경세포를 말한다.')],
  coreText: '내가 어떤 동작을 할 때도, 남이 같은 동작을 하는 것을 볼 때도 똑같이 활성화되는 신경세포',
  story: [
    ['1980년대 이탈리아 파르마 대학 연구팀이 원숭이 실험 중에 처음 발견했다', S('ko:거울 신경 세포', '1980년대 이탈리아 파르마 대학의 신경생리학자 자코모 리촐라티와 그의 연구팀이 원숭이 실험중에 처음으로 발견하였다.')],
    ['간식을 건네며 원숭이를 관찰하다가, 연구원이 음식을 잡는 것을 보기만 해도 원숭이의 뇌가 반응하는 것을 알았다', S('ko:거울 신경 세포', '원숭이에게 간식을 건네며 반응을 관찰하던중에 연구원이 음식을 잡았을 때도 이를 지켜보던 원숭이의 대뇌피질중에 F5영역(인간뇌의 브로카)이 활성화된다는 것을 알게되었다.')],
    ['종이 찢는 모습을 보든 소리만 듣든 반응한다', S('ko:거울 신경 세포', '예컨대, 원숭이 뇌의 거울신경세포는 원숭이가 종이 조각을 찢을 때, 원숭이가 사람이 종이 찢는 것을 볼 때, 모습은 보이지 않지만 종이가 찢어지는 소리가 들릴 때 반응한다.')],
    ['스포츠에서는 머릿속으로 동작을 그려 보는 훈련에 응용한다', S('ko:거울 신경 세포', '스포츠 분야에서는 이런 거울뉴런의 특성을 응용하여 심적시연 등 심상훈련을 통하여 운동 능력을 향상시키는 훈련을 진행하고 있다.')],
  ],
  hint: ['원숭이가 종이를 찢을 때, 사람이 찢는 것을 볼 때, 찢어지는 소리만 들릴 때 모두 반응하는 세포', S('ko:거울 신경 세포', '모습은 보이지 않지만 종이가 찢어지는 소리가 들릴 때 반응한다.')],
  legend: false, care: '"자폐증의 원인" 같은 가설은 같은 문서가 "불확실"이라 쓴다 — 쓰지 않는다. 사람에게서 단일 세포 수준의 확인은 아직 없다는 점도 같은 문서에 있음', why: '남이 하는 걸 보기만 해도 내가 한 것처럼 반응하는 세포 — 간식을 건네다 우연히 발견', hintRisk: true, spellNote: '한국어 위키백과 표제어(띄어쓰기 형)를 따름 · 같은 문서가 "거울신경세포" "거울뉴런"도 병기'
},
{
  answer: '쿠루병', also: ['쿠루', 'Kuru', '웃음병'], major: '기술·의학', mid: '의학·건강 상식',
  core: ['', S('ko:쿠루병', '쿠루병(Kuru)은 프리온에 의해 발생하는 희귀한 신경 퇴행성 질환이다.')],
  coreText: '프리온이 일으키는 희귀한 신경 퇴행성 질환',
  story: [
    ['병이 포레족의 장례 식인 풍습을 통해 퍼졌다 — 죽은 가족을 먹는 것이 영혼을 해방시킨다고 믿었다', S('ko:쿠루병', '이 질병은 포레족의 장례 식인 풍습을 통해 포레족 사이에서 퍼졌다. 포레족은 죽은 가족 구성원을 먹는 것이 죽은 자의 영혼을 해방시키는 데 도움이 된다고 여겼고, 따라서 죽은 가족을 요리해서 먹었다.')],
    ['1957년경 절정에는 매년 약 200명이 이 병으로 숨졌다', S('ko:쿠루병', '발병률이 절정에 달했던 1957년경에는 매년 약 200명이 이 질병으로 사망했다.')],
    ['호주 정부의 금지로 1960년경 풍습이 거의 멈췄지만, 잠복이 50년 넘게 가능해 사망은 한동안 이어졌다', S('ko:쿠루병', '그러나 50년 이상 잠복할 수 있는 이 질병의 특성 때문에 사망률에는 한동안 변화가 없었다.')],
  ],
  hint: ['환자가 비정상적으로 웃음을 터뜨리는 증상 때문에 "웃음병"으로도 불린다', S('ko:쿠루병', '환자들이 비정상적으로 웃음을 터뜨리는 증상 때문에 "웃음병"으로도 알려져 있다.')],
  legend: false, care: '식인 풍습이 소재 — 질문 · 해설은 담담하게(병의 원인을 밝힌 이야기로). 문서 한 곳(위키백과)뿐 — 연 문서 주석에 MedlinePlus · UCL이 달려 있으나 직접 열지 않음', why: '병의 이름이 "떨림"인데 별명은 "웃음병" — 장례 풍습이 병을 퍼뜨렸다', hintRisk: false, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '파이어니어 금속판', also: ['파이오니어 금속판', '파이오니어 명판', '파이어니어 명판', 'Pioneer plaque'], major: '기술·의학', mid: '항공·우주 기술',
  core: ['', S('ko:파이어니어 금속판', '1972년과 1973년에 발사된 우주 탐사선 파이어니어 10호·11호에 장착된 금속판으로, 인류로부터의 메시지를 그림으로 적은 것이다.')],
  coreText: '1972~73년 발사된 탐사선 파이어니어 10호·11호에 실은, 인류의 메시지를 그림으로 새긴 금속판',
  story: [
    ['NASA가 계획을 승인하고 3주 동안 메시지를 준비하게 했다', S('ko:파이어니어 금속판', 'NASA는 이 계획을 승인해, 3주 동안 메시지를 준비하도록 하였다.')],
    ['칼 세이건이 프랭크 드레이크와 함께 설계했고, 남녀 그림은 세이건의 아내 린다가 준비했다', S('ko:파이어니어 금속판', '세이건은 프랭크 드레이크와 함께 금속판을 디자인하였고, 금속판에 새겨진 남녀 그림은 당시의 세이건의 아내 린다 세이건이 준비했다.')],
    ['수소의 21cm 파장을 길이 단위로 삼아, 그림 속 여성의 키가 8×21cm=168cm임을 보여 준다', S('ko:파이어니어 금속판', '이것은 21cm 수소선 파장을 단위로 이 여성의 키가 8×21cm=168cm라는 것을 보여주고있다.')],
    ['외계 생명이 발견할 가능성은 매우 낮다고 본다', S('ko:파이어니어 금속판', '이 금속판은 성간공간을 도는 일종의 보틀메일로서 만들어졌지만, 이것이 다른 지구외 지적 생명에 의해서 발견될 가능성은 매우 적다.')],
  ],
  hint: ['1977년 보이저 탐사선에는 이보다 더 복잡한 메시지를 담은 금제 음반이 실렸다', S('ko:파이어니어 금속판', '1977년에 발사된 보이저 탐사선에는, 이 파이어니어 금속판보다 더 복잡하고 상세한 메시지를 기록한 보이저 금제 음반이 탑재되어 있다.')],
  legend: false, care: '사람 그림의 신체 묘사 논란(성기 생략)은 쓰지 않는다. 문서 한 곳(위키백과)뿐', why: '외계인에게 보내는 우주 보틀메일 — 수소 파장으로 사람 키까지 알려 준다', hintRisk: true, spellNote: '한국어 위키백과 표제어(파이어니어)를 따름 · 국내 기사에는 "파이오니어 명판"도 많아 also 에 넣음'
},
{
  answer: '아라크네', also: ['Arachne'], major: '인문·사회', mid: '신화',
  core: ['', S('ko:아라크네', '아라크네는 그리스 신화에 등장하는 여인이다.')],
  coreText: '그리스 신화에서 베짜기와 자수의 명인이었다가 거미가 된 여인',
  story: [
    ['리디아의 염색 명인의 딸로 베짜기와 자수를 잘했다', S('ko:아라크네', '리디아의 염색의 명인 이드몬의 딸인 아라크네는 베짜기와 자수를 잘하였다.')],
    ['자신의 솜씨가 아테나 여신보다 낫다고 뽐내며 도전했다', S('ko:아라크네', '그녀는 자신의 솜씨가 아테나 여신보다 뛰어나다고 실력을 뽐내며, 아테나에게 도전한다.')],
    ['아테나가 영원히 실을 짓게 하려고 그녀를 거미로 만들었다', S('ko:아라크네', '아라크네를 불쌍히 여긴 아테나는 그녀가 영원히 실을 짓도록 하게 만들고자 아코니트 즙을 뿌려 그녀를 거미로 만들고, 그녀의 목에 매어있던 밧줄은 거미줄이 된다.')],
  ],
  hint: ['신들의 약점을 수놓은 직물로 여신을 이긴 인간', S('ko:아라크네', '아테나는 이 행동으로 인해 \'신이 인간에게 패배했다.\'고 공식적으로 인정하고 만다.')],
  legend: true, care: '자살 · 성적인 장면은 쓰지 않는다(직물 내용은 "신들을 웃음거리로 만든 그림" 정도). 출처는 위키백과 한 문서. 거미(Arachnida)와 이름 연결은 이 문서에 없음 — 쓰지 않는다', why: '거미의 기원 신화 — 솜씨 자랑이 영원히 실을 뽑는 몸이 되었다', hintRisk: false, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '통 속의 뇌', also: ['Brain in a vat', 'BIV', '통속의 뇌'], major: '인문·사회', mid: '철학·사상',
  core: ['', S('ko:통 속의 뇌', '철학에서 인식론 및 회의주의와 관련된 가장 유명하고 영향력 있는 사고 실험 중 하나이다.')],
  coreText: '몸에서 분리된 뇌가 영양액 통 속에서 컴퓨터가 보내는 신호만 받는다면 지금의 현실을 어떻게 확신하느냐고 묻는 사고 실험',
  story: [
    ['뇌를 영양액 통에 담고 신경을 슈퍼컴퓨터에 연결해 완벽한 일상을 느끼게 한다는 상상', S('ko:통 속의 뇌', '그 사람의 뇌는 몸에서 분리되어, 영양액이 가득 찬 통 속에 담겨 생명이 유지되고 있다.')],
    ['질문은 지금 이 순간 통 속의 뇌가 아니라고 100% 확신할 수 있느냐는 것', S('ko:통 속의 뇌', '통 속의 뇌 사고 실험은 "당신이 지금 이 순간, 통 속의 뇌가 아니라고 100% 확신할 수 있는가?"라는 근본적인 질문을 던진다.')],
    ['힐러리 퍼트넘이 1981년 저서에서 본격적으로 다뤄 철학계 핵심 논제가 되었다', S('ko:통 속의 뇌', '힐러리 퍼트넘이 1981년 저서 《이성, 진실 그리고 역사》의 첫 장에서 이 문제를 본격적으로 다루면서 철학계의 핵심 논제로 부상했다.')],
    ['정작 이 실험을 대중화한 퍼트넘 자신은 회의주의적 결론에 반대한다', S('ko:통 속의 뇌', '흥미롭게도, 이 사고 실험을 대중화한 힐러리 퍼트넘 자신은 이 회의주의적 결론에 반대한다.')],
  ],
  hint: ['플라톤의 동굴 죄수들은 벽에 비친 그림자만 보고 그것이 현실이라고 믿는다 — 이 실험의 원형으로 꼽힌다', S('ko:통 속의 뇌', '죄수들은 동굴 벽에 비친 그림자만을 보고 그것이 현실이라고 믿는다.')],
  legend: false, care: '영화 <매트릭스> 연결은 이 문서에서 확인하지 않음 — 쓰지 않는다. 출처는 위키백과 한 문서', why: '"지금 이 순간이 진짜인가" — 이 실험을 널리 알린 사람이 정작 결론에는 반대했다', hintRisk: true, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '프로타주', also: ['frottage'], major: '문화·예술', mid: '미술·화가',
  core: ['', S('ko:프로타주', '프로타주를 할 때 예술가는 파스텔이나 연필, 아니면 다른 드로잉 도구를 가지고 질감이 있는 표면 위에 탁본을 뜬다.')],
  coreText: '질감이 있는 표면 위에 종이를 대고 연필 등으로 문질러 무늬를 떠내는 기법(막스 에른스트가 발전시킴)',
  story: [
    ['1925년 막스 에른스트가 창시했다', S('ko:프로타주', '프로타주는 1925년 막스 에른스트가 창시했다.')],
    ['오래된 나무 바닥의 두드러진 결에서 영감을 받아 낯선 이미지를 연상했다', S('ko:프로타주', '에른스트는 판자의 결이 수년간 문질러지면서 두드러진 아주 오래된 나무바닥에서 영감을 받았다. 그는 나뭇결의 패턴에서 낯선 이미지를 연상했다.')],
    ['종이를 바닥에 놓고 부드러운 연필로 문질러 이미지를 잡아 두었다', S('ko:프로타주', '에른스트는 종이 몇 장을 바닥에 놓고 그 위를 부드러운 연필로 문질러 이러한 이미지들을 잡아두었다.')],
    ['탁본과 비슷하지만 결과가 우연적이고 사실상 무작위라는 점이 다르다', S('ko:프로타주', '프로타주는 우연적이고 사실상 무작위로 나온다는 점에서 다르다.')],
  ],
  hint: ['초현실주의의 "자동적" 창작 기법으로 꼽힌다', S('ko:프로타주', '막스 에른스트가 발전시킨 창작물의 초현실적이고 \'자동적\'인 기법을 말한다.')],
  legend: false, care: '출처는 위키백과 한 문서. 문서 첫 문장 일부가 표기 깨짐 — hint quote 는 원문을 다시 확인할 것', why: '바닥 나뭇결을 문질렀더니 낯선 그림이 나왔다 — 우연을 그림으로 쓴 초현실주의 기법', hintRisk: false, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '카르미나 부라나', also: ['Carmina Burana', '카르미나부라나'], major: '문화·예술', mid: '클래식 음악',
  core: ['', S('ko:카르미나 부라나', '254편의 시와 극문들로 이루어진 필사본으로, 대부분 11세기나 12세기의 작품이나 일부는 13세기의 것이다.')],
  coreText: '중세 방랑 학생 · 성직자들이 쓴 시와 노래 254편을 모은 필사본(1936년 카를 오르프가 24편에 곡을 붙여 합창 작품으로 유명)',
  story: [
    ['시와 노래 대부분이 가톨릭 교회를 풍자한 골리아르드(주로 학생인 성직자)의 작품으로 보인다', S('ko:카르미나 부라나', '대부분의 시와 노래는 가톨릭 교회를 풍자한 성직자들(주로 학생들)인 골리아르드의 작품으로 보인다.')],
    ['1803년 바이에른의 베네딕도회 수도원에서 발견되어 지금은 뮌헨의 주립 도서관에 있다', S('ko:카르미나 부라나', '이 모음집은 1803년 바이에른 베네딕트보이에른의 베네딕도회 수도원에서 발견되었으며, 현재는 뮌헨의 바이에른 주립 도서관에 소장되어 있다.')],
    ['1936년 카를 오르프가 24편에 곡을 붙였고 빠르게 인기를 얻어 클래식 레퍼토리의 주요 작품이 되었다', S('ko:카르미나 부라나', '의 24편의 시는 1936년 카를 오르프가')],
    ['첫 악장 "오 포르투나"는 수많은 영화에 쓰여 대중문화에서 가장 널리 알려진 작품 중 하나가 되었다', S('ko:카르미나 부라나', '시작과 끝을 장식하는 악장 "오 포르투나"는 수많은 영화에서 사용되어 대중문화에서 가장 널리 알려진 작품 중 하나가 되었다.')],
  ],
  hint: ['시작과 끝을 장식하는 "오 포르투나"는 수많은 영화에 쓰였다', S('ko:카르미나 부라나', '시작과 끝을 장식하는 악장 "오 포르투나"는 수많은 영화에서 사용되어 대중문화에서 가장 널리 알려진 작품 중 하나가 되었다.')],
  legend: false, care: '필사본(중세)과 오르프의 합창곡(1936)이 같은 이름 — 질문이 어느 쪽을 묻는지 하나로 고정할 것. "외설적" 내용은 쓰지 않는다. 오르프 24편 줄은 quote 조각이 짧으니 원문 확인', why: '수도원 서고에서 나온 방랑 학생들의 교회 풍자 노래 모음이 영화 음악의 단골이 되었다', hintRisk: true, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '허프먼 부호화', also: ['허프만 부호화', '허프먼 코딩', '허프만 코딩', '허프먼 부호', '허프만 부호', 'Huffman coding'], major: '기술·의학', mid: '컴퓨터·인터넷',
  core: ['', S('ko:허프먼 부호화', '데이터 문자의 등장 빈도에 따라서 다른 길이의 부호를 사용하는 알고리즘이다.')],
  coreText: '자주 나오는 문자에는 짧은 부호를, 드물게 나오는 문자에는 긴 부호를 주어 데이터를 줄이는 무손실 압축 알고리즘',
  story: [
    ['MIT 정보이론 수업에서 학생들은 기말시험 대신 학기 보고서를 고를 수 있었고, 교수 파노가 가장 효율적인 이진 부호 찾기를 과제로 냈다', S('en:Huffman_coding', 'Huffman and his MIT information theory classmates were given the choice of a term paper or a final exam.')],
    ['그 과제를 푼 학생 허프먼이 샤논과 함께 비슷한 부호를 만든 파노 본인을 앞질렀다', S('en:Huffman_coding', 'In doing so, Huffman outdid Fano, who had worked with Claude Shannon to develop a similar code.')],
    ['위에서 아래로 만든 샤논-파노 방식과 달리 아래에서 위로 트리를 쌓아 최적임을 보장했다', S('en:Huffman_coding', 'Building the tree from the bottom up guaranteed optimality, unlike the top-down approach of Shannon–Fano coding.')],
    ['1952년 당시 박사과정 학생이던 데이비드 허프먼이 논문으로 처음 발표했다', S('ko:허프먼 부호화', '1952년 당시 박사과정 학생이던 데이비드 허프먼이')],
  ],
  hint: ['적게 나오는 문자일수록 더 긴 부호를, 많이 나올수록 더 짧은 부호를 쓴다', S('ko:허프먼 부호화', '적게 나오는 문자일수록 더 긴 부호를 쓰고 많이 나올수록 더 짧은 부호를 쓴다.')],
  legend: false, care: '교수의 과제가 "아직 못 푼 문제"였다는 이야기는 이 문서 발췌로는 확인하지 않음 — 쓰지 않는다(기말시험 대신 보고서 선택까지만)', why: '기말시험 대신 고른 학기 보고서가 교수 본인의 방식을 이긴 압축 알고리즘이 되었다', hintRisk: true, spellNote: '한국어 위키백과 표제어("허프먼 부호화")를 따름 · "허프만 코딩"도 흔해 also 에 넣음'
},
{
  answer: '게 성운', also: ['Crab Nebula', 'M1', '메시에 1', 'NGC 1952', '게성운'], major: '자연과학', mid: '천문·우주',
  core: ['', S('ko:게 성운', '황소자리 방향에 있는 초신성 잔해이자 펄사풍 성운이다.')],
  coreText: '황소자리 방향에 있는 초신성 잔해 성운(메시에 목록 1번)',
  story: [
    ['1054년 낮에도 보일 만큼 밝은 새 별이 나타났다고 중국 문헌에 기록되어 있다', S('ko:게 성운', '중국의 문헌에는 1054년에 새로운 별이 발견되었는데, 낮에도 볼 수 있을만큼 밝았다고 한다.')],
    ['샤를 메시에가 이것을 혜성으로 착각했다가 움직이지 않는 것을 알고, 혜성과 헷갈리지 않으려고 목록을 만들어 첫 번째에 올렸다', S('ko:게 성운', '그는 게 성운을 밝은 혜성으로 여겼으나, 움직이지 않는 것을 알게 되었고, 혜성과 착각하지 않도록 하기 위해 새로운 목록(Messier Catalog)을 만들어 이 성운의 이름을 M1이라 하였다.')],
    ['1848년 윌리엄 파슨스가 형태가 게를 닮았다고 해서 이름 붙였다', S('ko:게 성운', '1848년, 윌리엄 파슨스(또는 로스 백작 3세)는 성운을 관측하고 형태가 게와 닮았다고 해서 게 성운이라고 이름 붙였다.')],
    ['남은 기록 덕분에 초신성 폭발과 연관된 최초의 천체가 되었다', S('ko:게 성운', '남아있는 기록 덕분에, 게 성운은 초신성 폭발과 관련된 최초의 천체가 될 수 있었다.')],
  ],
  hint: ['메시에가 혜성과 혼동하지 않으려고 만든 목록의 1번 천체', S('ko:게 성운', '혜성과 착각하지 않도록 하기 위해 새로운 목록(Messier Catalog)을 만들어 이 성운의 이름을 M1이라 하였다.')],
  legend: false, care: '발견 연도가 문서 안에서 1731(베비스)·1758(메시에 재발견)·1848/1842(이름)로 갈림 — 이름 유래는 연도 없이 "파슨스"만. 출처는 위키백과 한 문서', why: '혜성 사냥꾼이 혜성이 아닌 것을 가려내려다 만든 목록의 1번 — 천 년 전 낮에도 보인 폭발의 잔해', hintRisk: true, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '소년 십자군', also: ['Children\'s Crusade', '아동 십자군'], major: '인문·사회', mid: '서양사',
  core: ['', S('ko:소년 십자군', '소년 십자군(少年十字軍)은 1212년경 프랑스와 독일에서 일어난, 실패한 십자군 운동이다.')],
  coreText: '1212년경 프랑스와 독일에서 소년들이 중심이 되어 일어난, 실패한 십자군 운동',
  story: [
    ['교황 인노첸시오 3세의 승인을 받은 적이 없다', S('en:Children%27s_Crusade', 'Although it is called the Children\'s Crusade, it never received the papal approval from Pope Innocent III to be an actual crusade.')],
    ['독일 쪽을 이끈 양치기 니콜라스는 바다가 갈라져 성지로 들어가게 될 것이라고 말했다', S('en:Children%27s_Crusade', 'Nicholas said that the sea would open up before them just as the Lord had done for the Israelites and allow them to enter the Holy Land.')],
    ['프랑스 소년들은 마르세유 상인들에 의해 이집트로 노예로 팔렸다고 전한다', S('ko:소년 십자군', '프랑스의 소년들은 도중에 마르세유의 상인들에 의해서 이집트에 노예로 팔려버렸다.')],
    ['전해 오는 이야기는 실제 사건과 신화적 이야기가 섞인 것으로 보인다', S('en:Children%27s_Crusade', 'The traditional narrative is likely conflated from a mix of historical and mythical events, including the preaching of visions by a French boy and a German boy, an intention to peacefully convert Muslims in the Holy Land to Christianity, bands of children marching to Italy, and children being sold into slavery in Tunis.')],
  ],
  hint: ['독일 쪽을 이끈 라인란트의 양치기 니콜라스는 바다가 갈라지리라고 말했다', S('en:Children%27s_Crusade', 'Nicholas said that the sea would open up before them just as the Lord had done for the Israelites and allow them to enter the Holy Land.')],
  legend: true, care: '노예 · 사망 부분은 담담하게 · 구체 묘사 금지. 한국어 문서는 "이집트", 영어 문서는 "튀니지"로 갈림 — 판매 장소는 쓰지 말고 "노예로 팔렸다고 전한다" 정도. 전승이 섞여 있어 확정 표현 금지. "~십자군"(일반) 카드와는 다른 대상', why: '아이들이 바다가 갈라질 거라 믿고 성지로 걸었다는 중세의 비극 — 이야기 자체가 사실과 전설이 섞여 있다', hintRisk: true, spellNote: '한국어 위키백과 표제어를 따름'
},
{
  answer: '새빌 로', also: ['새빌로', 'Savile Row', '새빌 거리'], major: '생활·상식', mid: '의복·패션',
  core: ['', S('en:Savile_Row', 'Known principally for its traditional bespoke tailoring for men')],
  coreText: '런던의 거리로, 전통 맞춤 남성 양복 재단으로 유명한 곳',
  story: [
    ['"비스포크"라는 말이 여기서 시작되어 손으로 재단해 만든 양복을 뜻하게 되었다', S('en:Savile_Row', 'The term "bespoke" as applied to fine tailoring is understood to have originated in Savile Row, and came to mean a suit cut and made by hand.')],
    ['1846년 헨리 풀이 이 거리에 입구를 냈고, 그는 디너 재킷(턱시도)을 만든 사람으로 꼽힌다', S('en:Savile_Row', 'In 1846, Henry Poole, credited as creator of the dinner jacket or tuxedo, opened an entrance at 37 Savile Row from his late father\'s tailoring premises at 4 Old Burlington Street.')],
    ['비틀즈의 애플사가 3번지에 입주했고, 지붕 위에서 마지막 라이브 공연을 했다', S('en:Savile_Row', 'The Beatles\' final live performance, known as the "rooftop concert", was held on the roof of the building, on 30 January 1969')],
  ],
  hint: ['비틀즈가 마지막 라이브 공연을 한 옥상이 이 거리의 건물이다', S('en:Savile_Row', 'The Beatles\' final live performance, known as the "rooftop concert", was held on the roof of the building, on 30 January 1969')],
  legend: false, care: '"~로 알려진/유래한 것으로 이해된다(understood to have originated)" — 유래는 단정하지 않는다. 한국어 위키 문서가 매우 짧아 영어판을 출처로 씀', why: '"맞춤 양복(비스포크)"이라는 말의 고향이자 비틀즈 옥상 공연의 그 건물이 있는 거리', hintRisk: true, spellNote: '한국어 위키백과 표제어("새빌 로")를 따름 · 국내 기사는 "새빌로" "새빌 로우"도 씀 — also 에 일부'
},
{
  answer: '샤를 보네 증후군', also: ['샤를보네 증후군', 'Charles Bonnet syndrome', 'CBS'], major: '기술·의학', mid: '의학·건강 상식',
  core: ['', S('ko:샤를 보네 증후군', '실명한 사람이 두뇌의 시각 경로 손상으로 생생한 시각적 환각을 경험하는 현상을 말한다.')],
  coreText: '시력을 크게 잃은 사람이 뇌의 시각 경로 손상으로 생생한 환시를 보는 현상',
  story: [
    ['환각은 비자발적이며, 일반인이 장면을 상상할 때보다 훨씬 생생하다', S('ko:샤를 보네 증후군', '이 환각들은 비자발적이며, 일반인이 장면을 상상할 때보다 훨씬 생생하다.')],
    ['1760년 샤를 보네가 처음 기술했고 영어권 정신의학에는 1982년에야 이 이름이 소개되었다', S('en:Visual_release_hallucinations', 'First described by Charles Bonnet in 1760, the term Charles Bonnet syndrome was first introduced into English-speaking psychiatry in 1982.')],
    ['시력이 크게 떨어진 65세 이상 중 10~40%에서 나타난다고 보고되었다', S('en:Visual_release_hallucinations', 'Among older adults (> 65 years) with significant vision loss, the prevalence of Charles Bonnet syndrome has been reported to be between 10% and 40%')],
    ['정신 질환이 아니라 이 증후군임을 아는 것이 가장 큰 위안이 되는 치료로 보인다', S('en:Visual_release_hallucinations', 'For those experiencing CBS, knowing that they have this syndrome and not a mental illness seems to be the most comforting treatment so far, as it improves their ability to cope with the hallucinations.')],
  ],
  hint: ['눈이 안 보이게 된 사람이 정신 질환이 아님을 알게 되는 것만으로 위안을 얻는 현상', S('en:Visual_release_hallucinations', 'knowing that they have this syndrome and not a mental illness seems to be the most comforting treatment so far')],
  legend: false, care: '환각을 "정신 이상"으로 읽히지 않게 — 정신 질환이 아니라는 점을 해설에. 출처 둘(ko · en 위키). 영어판 문서 제목은 Visual release hallucinations', why: '시력을 잃은 뒤 오히려 생생한 환영이 보이는 병 — 이름은 이를 처음 기술한 박물학자에서', hintRisk: true, spellNote: '한국어 위키백과 표제어를 따름'
},
];

const url = (f) => {
  const [lang, name] = f.split(':');
  return lang === 'ko' ? 'https://ko.wikipedia.org/wiki/' + name.replace(/ /g, '_') : 'https://en.wikipedia.org/wiki/' + name;
};
const cache = {};
const text = (f) => {
  const [lang, name] = f.split(':');
  const p = 's/' + (lang === 'en' ? 'en_' : '') + decodeURIComponent(name === undefined ? '' : name).replace(/%27/g, '%27') + '.txt';
  const path = lang === 'en' ? 's/en_' + name + '.txt' : 's/' + name + '.txt';
  return (cache[f] ??= fs.readFileSync(path, 'utf8'));
};
let bad = 0;
const chk = (s) => {
  const ok = text(s.f).includes(s.q);
  if (!ok) { bad++; console.log('MISSING', s.f, '::', s.q.slice(0, 70)); }
  return { text: null, url: url(s.f), quote: s.q };
};
const out = items.map((it, i) => {
  const key = 'n' + (5601 + i);
  const core = { text: it.coreText, ...chk(it.core[1]) , text2: undefined };
  core.text = it.coreText; delete core.text2;
  const mk = (t, s) => { const o = chk(s); return { text: t, url: o.url, quote: o.quote }; };
  return {
    key, answer: it.answer, also: it.also, spelling: '?', major: it.major, mid: it.mid, gradeGuess: 4,
    core: { text: it.coreText, url: core.url, quote: core.quote },
    story: it.story.map(([t, s]) => mk(t, s)),
    hintIdea: it.hint ? mk(it.hint[0], it.hint[1]) : null,
    legend: it.legend, care: it.care, why: it.why, hintRisk: it.hintRisk, spellNote: it.spellNote,
  };
});
console.log('items', out.length, 'bad', bad);
if (process.argv[2] === 'write' && bad === 0) {
  const doc = { done: true, chunk: '새재료-56', lane: 'hard', grade: 4, items: out,
    dropped: { dupActive: 86, weakStory: 10, noSource: 4, other: 0 }, opened: 36 };
  fs.writeFileSync('../chunk-56.json', JSON.stringify(doc, null, 2));
  console.log('written');
}
