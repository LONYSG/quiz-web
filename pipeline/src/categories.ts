// =============================================================================
// 카테고리 트리 (작업 C / R011)
//
// ★★ 이 파일이 중복 검사의 기준이고, 생성 요청의 입력이다.
//   건우가 뺄 것·추가할 것을 지정할 수 있어야 하므로 **한 곳에 모았다.**
//   enabled: false 로 두면 생성 대상에서 빠진다. 삭제하지 않는다 —
//   지운 카테고리로 이미 만든 문제가 고아가 되기 때문이다.
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★ 이 목록을 만들면서 적용한 규칙 하나 (C-1 판단의 핵심)
//
//   **중분류는 하나의 주제 축으로만 나눈다.**
//   같은 대상을 다른 축(인물 / 유물 / 명작 / 기록)으로 다시 묶는 중분류를
//   만들지 않는다.
//
//   ★ 건우가 든 예가 정확히 이 문제였다 —
//     "훈민정음을 만든 왕?"  (한국사 > 조선 전기)
//     "한글을 창제한 왕?"    (한국 문화유산 > 기록유산)
//     같은 정답(세종대왕)인데 중분류가 달라 중복 검사를 빠져나간다.
//
//   ★ 그런데 이것은 **중분류 검사의 결함이 아니라 카테고리 목록의 결함이다.**
//     "한국 문화유산" 이라는 중분류가 존재하는 순간, 조선 시대 유물 문제는
//     한국사에도 문화유산에도 **합법적으로** 들어갈 수 있다.
//     어느 계층에서 검사하든 이 목록으로는 막을 수 없다.
//   → 그래서 문화유산·유적을 **시대 소분류로 흡수**했다. 아래 kr-history 를 보라.
//     ("한국 전통문화·풍습" 은 남겼다. 풍습은 시대 축이 아니라 독립된 주제 축이다.)
//
//   같은 이유로 초안의 다음 중분류를 없앴다.
//     · 인물(위인·현대 유명인) → ★ 정답이 인물인 문제는 거의 모든 중분류에서 나온다.
//       화가는 미술, 왕은 한국사, 발명가는 발명·발견에 넣는다.
//       인물을 중분류로 두면 같은 문제가 두 곳에 합법적으로 존재할 수 있다.
//     · 건축·유적 → 유적을 떼어내고 **건축**(양식·건축가·건축물)만 남겼다.
//       유적 문제는 해당 시대의 역사 중분류로 간다.
// ─────────────────────────────────────────────────────────────────────────────
//
// ★ 소분류는 **생성 단위**다. 중복 검사 단위가 아니다 (C-1 참조).
//   규모를 늘릴 때는 소분류당 목표를 올리지 않고 **트리를 넓힌다.**
//   소분류당 목표를 올리면 같은 소재가 반복되어 중복이 난다.
// =============================================================================

/** 대분류. ★ 게임 화면에 표시하는 계층이다 (C-5 판단) */
export interface MajorCategory {
  key: string;
  nameKo: string;
  /** DB categories 테이블의 기존 key 와 대응. null 이면 신설이 필요하다 */
  legacyKey: string | null;
  sortOrder: number;
}

/** 중분류. ★ 중복 검사의 기준 계층이다 (C-1 판단) */
export interface MidCategory {
  key: string;
  nameKo: string;
  major: string;
  /** ★ 생성 단위. 이 안에서 골고루 뽑는다 */
  subs: string[];
  /**
   * ★ 인접 중분류와의 경계. 프롬프트에 그대로 넣는다.
   *   경계를 글로 적어두지 않으면 모델이 같은 문제를 두 카테고리에서 만든다.
   */
  boundary?: string;
  /** false 면 생성 대상에서 제외한다. 건우가 켜고 끈다 */
  enabled: boolean;
  /** ★ 건우가 이번 라운드에 반드시 봐야 한다고 지정한 분야 */
  mustSample?: boolean;
}

export const MAJORS: MajorCategory[] = [
  { key: 'korea', nameKo: '한국', legacyKey: null, sortOrder: 10 },
  { key: 'humanities', nameKo: '인문·사회', legacyKey: 'history', sortOrder: 20 },
  { key: 'science', nameKo: '자연과학', legacyKey: 'science', sortOrder: 30 },
  { key: 'tech', nameKo: '기술·의학', legacyKey: 'tech', sortOrder: 40 },
  { key: 'arts', nameKo: '문화·예술', legacyKey: 'art', sortOrder: 50 },
  { key: 'sports', nameKo: '스포츠·게임', legacyKey: 'sports', sortOrder: 60 },
  { key: 'life', nameKo: '생활·상식', legacyKey: 'general', sortOrder: 70 },
];

export const MIDS: MidCategory[] = [
  // ───────────────────────────────────────────────────────── 한국
  {
    key: 'kr-history', nameKo: '한국사', major: 'korea', enabled: true,
    subs: ['삼국·통일신라', '고려', '조선 전기', '조선 후기', '개항기·일제강점기', '대한민국 현대'],
    boundary:
      '★ 인물·유물·문화유산·사건을 모두 해당 시대 소분류에 넣는다. ' +
      '문화유산을 따로 묶지 않는다 (훈민정음 문제는 "조선 전기" 다).',
  },
  {
    key: 'kr-geo', nameKo: '한국 지리', major: 'korea', enabled: true,
    subs: ['행정구역·도시', '산·강·호수', '섬·해안', '지역 특산·별칭'],
    boundary: '역사적 사건이 일어난 장소를 묻는 문제는 한국사로 보낸다.',
  },
  {
    key: 'kr-lit', nameKo: '한국 문학', major: 'korea', enabled: true,
    subs: ['고전 문학', '근대 문학', '현대 소설', '시', '작가·문학상'],
  },
  {
    key: 'kr-tradition', nameKo: '한국 전통문화·풍습', major: 'korea', enabled: true,
    subs: ['명절·세시풍속', '전통 의식주', '민속놀이', '국악·전통 예술', '관혼상제'],
    boundary: '특정 시대의 제도·사건은 한국사로 보낸다. 여기는 지금도 이어지는 풍습이다.',
  },
  {
    key: 'kr-music', nameKo: '한국 대중음악', major: 'korea', enabled: true,
    subs: ['1990년대 이전 가요', '1990~2000년대 가요', '아이돌·K팝', '노래 제목·가사'],
  },
  {
    key: 'kr-screen', nameKo: '한국 영화·드라마', major: 'korea', enabled: true,
    subs: ['한국 영화', '한국 드라마', '감독·배우', '흥행·수상 기록'],
  },
  {
    key: 'kr-tv', nameKo: '한국 방송·예능', major: 'korea', enabled: true,
    subs: ['예능 프로그램', '방송인·MC', '유행어', '광고'],
    boundary: '★ 지금 방영 중인 것에 의존하는 문제를 만들지 않는다 (시간이 지나면 답이 바뀐다).',
  },
  {
    key: 'kr-food', nameKo: '한국 음식', major: 'korea', enabled: true,
    subs: ['밥·국·찌개', '김치·반찬', '분식·길거리 음식', '향토 음식', '떡·한과·전통 음료'],
  },
  {
    key: 'kr-language', nameKo: '한국어·한글', major: 'korea', enabled: true,
    subs: ['한글 자모·맞춤법', '순우리말', '속담·관용어', '사자성어', '높임말·어법'],
    boundary:
      '★ 초안의 "언어·어원·속담" 을 한국어와 세계 언어로 쪼갠 것이다. ' +
      '한글 창제 자체는 한국사로 보낸다.',
  },

  // ───────────────────────────────────────────────────────── 인문·사회
  {
    key: 'world-history-west', nameKo: '서양사', major: 'humanities', enabled: true,
    subs: ['고대 그리스·로마', '중세 유럽', '르네상스·대항해', '근대 유럽·혁명', '20세기 서양'],
    boundary: '★ 초안의 "세계사" 를 셋으로 쪼갠 것이다. 전쟁 자체는 전쟁·군사사로 보낸다.',
  },
  {
    key: 'world-history-east', nameKo: '동양사', major: 'humanities', enabled: true,
    subs: ['중국 왕조', '일본사', '인도·동남아', '중동·이슬람 세계'],
    boundary: '한국사는 별도 중분류다.',
  },
  {
    key: 'war-history', nameKo: '전쟁·군사사', major: 'humanities', enabled: true,
    subs: ['고대·중세 전쟁', '제1차 세계대전', '제2차 세계대전', '냉전 이후', '무기·군사 용어'],
  },
  {
    key: 'myth', nameKo: '신화', major: 'humanities', enabled: true,
    subs: ['그리스·로마 신화', '북유럽 신화', '이집트·메소포타미아 신화', '동양·기타 신화'],
    boundary: '★ 지금도 신앙되는 종교의 경전·교리는 종교·경전 상식으로 보낸다.',
  },
  {
    key: 'religion', nameKo: '종교·경전 상식', major: 'humanities', enabled: true, mustSample: true,
    subs: ['기독교·성경', '불교', '이슬람', '기타 종교·종파', '종교 의식·상징'],
    boundary: '★ 교리의 우열이나 진위를 묻지 않는다. 명칭·인물·용어 등 사실만 묻는다.',
  },
  {
    key: 'philosophy', nameKo: '철학·사상', major: 'humanities', enabled: true, mustSample: true,
    subs: ['고대 철학', '근대 철학', '현대 철학', '동양 사상', '철학 용어·명제'],
  },
  {
    key: 'psychology', nameKo: '심리학 상식', major: 'humanities', enabled: true, mustSample: true,
    subs: ['심리 현상·효과', '발달·성격 이론', '심리학자·유명 실험', '정신 건강 용어'],
  },
  {
    key: 'economy', nameKo: '경제·금융 상식', major: 'humanities', enabled: true,
    subs: ['경제 개념·지표', '화폐·환율', '금융 상품·시장', '기업·경영 용어', '경제사'],
    boundary: '★ 현재 시세·순위에 의존하는 문제를 만들지 않는다.',
  },
  {
    key: 'politics', nameKo: '정치·법 상식', major: 'humanities', enabled: true,
    subs: ['정치 체제·기구', '선거·의회', '헌법·법 개념', '국제기구·조약', '법률 용어'],
    boundary: '★ 현직자를 묻지 않는다 ("현재 대통령은?" 금지).',
  },
  {
    key: 'society', nameKo: '사회 제도', major: 'humanities', enabled: true,
    subs: ['교육 제도', '복지·의료 제도', '인구·통계 개념', '사회학 개념'],
  },
  {
    key: 'world-geo', nameKo: '세계 지리·국가·수도', major: 'humanities', enabled: true,
    subs: ['국가·수도', '대륙·바다', '랜드마크·지형', '국경·영토', '도시 별칭'],
    boundary: '자연 지형의 생성 원리는 지구과학으로 보낸다.',
  },

  // ───────────────────────────────────────────────────────── 자연과학
  {
    key: 'physics', nameKo: '물리', major: 'science', enabled: true,
    subs: ['역학·운동', '전기·자기', '빛·소리·파동', '열·에너지', '현대 물리'],
    boundary: '★ "누가 처음 발견했는가" 는 발명·발견으로 보낸다. 여기는 개념 내용이다.',
  },
  {
    key: 'chemistry', nameKo: '화학·원소', major: 'science', enabled: true,
    subs: ['원소 기호', '주기율표', '화합물·분자', '화학 반응', '실생활 화학'],
  },
  {
    key: 'biology', nameKo: '생물학', major: 'science', enabled: true,
    subs: ['세포·유전', '분류·진화', '생태계', '미생물·바이러스', '식물 생리'],
    boundary: '★ 초안의 "생물·인체" 를 둘로 쪼갠 것이다. 사람 몸은 인체·해부로 보낸다.',
  },
  {
    key: 'human-body', nameKo: '인체·해부', major: 'science', enabled: true,
    subs: ['뼈·근육', '장기·순환', '감각기관', '신경·뇌', '혈액·면역'],
    boundary: '질병·치료는 의학·건강 상식으로 보낸다. 여기는 정상 구조와 기능이다.',
  },
  {
    key: 'animals', nameKo: '동물', major: 'science', enabled: true,
    subs: ['포유류', '조류', '어류·해양 생물', '곤충·절지동물', '파충류·양서류', '동물 행동·기록'],
  },
  {
    key: 'plants', nameKo: '식물', major: 'science', enabled: true,
    subs: ['나무', '꽃·꽃말', '작물·과일', '식물 이름의 유래'],
  },
  {
    key: 'earth', nameKo: '지구과학·기상', major: 'science', enabled: true,
    subs: ['지질·암석', '화산·지진', '대기·기상', '해양', '기후 변화'],
  },
  {
    key: 'astronomy', nameKo: '천문·우주', major: 'science', enabled: true,
    subs: ['태양계', '별·별자리', '은하·우주론', '우주 현상·관측'],
    boundary: '로켓·탐사선 기술은 항공·우주 기술로 보낸다.',
  },
  {
    key: 'math', nameKo: '수학·수 상식', major: 'science', enabled: true,
    subs: ['수와 연산', '도형·기하', '확률·통계', '수학 기호·용어', '단위·측정', '유명한 수·정리'],
    boundary:
      '★ 초안의 "단위·측정" 을 여기 소분류로 흡수했다. ' +
      '중분류로 두면 중복 없이 낼 수 있는 문제가 금방 고갈된다.',
  },

  // ───────────────────────────────────────────────────────── 기술·의학
  {
    key: 'medicine', nameKo: '의학·건강 상식', major: 'tech', enabled: true,
    subs: ['질병', '증상·진단', '의약품·백신', '영양·비타민', '응급처치'],
    boundary: '★ 진단이나 처방을 조언하는 형태로 쓰지 않는다. 명칭·용어 사실만 묻는다.',
  },
  {
    key: 'computer', nameKo: '컴퓨터·인터넷', major: 'tech', enabled: true,
    subs: ['하드웨어', '소프트웨어·운영체제', '프로그래밍 용어', '네트워크·인터넷', '정보 보안'],
    boundary: '★ 현재 점유율·최신 버전에 의존하는 문제를 만들지 않는다.',
  },
  {
    key: 'invention', nameKo: '발명·발견', major: 'tech', enabled: true,
    subs: ['산업혁명기 발명', '근현대 발명', '과학적 발견', '노벨상·과학자'],
    boundary: '★ "누가 처음 만들었는가/발견했는가" 만 여기서 묻는다.',
  },
  {
    key: 'transport', nameKo: '자동차·교통', major: 'tech', enabled: true,
    subs: ['자동차 구조·용어', '자동차 브랜드·역사', '철도', '선박', '도로·교통 체계'],
  },
  {
    key: 'aerospace', nameKo: '항공·우주 기술', major: 'tech', enabled: true,
    subs: ['항공기', '항공사·공항', '로켓·발사체', '유인 우주 탐사', '인공위성·탐사선'],
  },
  {
    key: 'energy', nameKo: '에너지·환경 기술', major: 'tech', enabled: true,
    subs: ['발전 방식', '재생 에너지', '자원·연료', '환경 협약·오염'],
    boundary: '★ 초안에 없던 분야다. 넓을수록 좋다는 지시에 따라 추가했다.',
  },
  {
    key: 'material', nameKo: '재료·건설 기술', major: 'tech', enabled: true,
    subs: ['금속·합금', '플라스틱·신소재', '건설 공법', '토목 구조물'],
    boundary: '★ 초안에 없던 분야다. 건축 양식·건축가는 건축 중분류로 보낸다.',
  },

  // ───────────────────────────────────────────────────────── 문화·예술
  {
    key: 'art', nameKo: '미술·화가', major: 'arts', enabled: true,
    subs: ['서양 회화', '조각', '한국·동양 미술', '미술 사조', '미술관·유명 작품'],
  },
  {
    key: 'classical', nameKo: '클래식 음악', major: 'arts', enabled: true,
    subs: ['작곡가', '작품·악곡', '오페라', '음악 형식·용어'],
  },
  {
    key: 'popular-music', nameKo: '팝·록 음악', major: 'arts', enabled: true,
    subs: ['1960~70년대', '1980~90년대', '2000년대 이후', '밴드·아티스트', '힙합·일렉트로닉'],
    boundary: '한국 가요는 한국 대중음악으로 보낸다.',
  },
  {
    key: 'music-theory', nameKo: '음악 이론·악기', major: 'arts', enabled: true,
    subs: ['악보·기호', '음계·화성', '관현악기', '건반·타악기', '세계 전통 악기'],
    boundary: '★ 초안에 없던 분야다. 작곡가·작품과 지식 유형이 다르다.',
  },
  {
    key: 'world-cinema', nameKo: '세계 영화', major: 'arts', enabled: true,
    subs: ['할리우드 고전', '현대 할리우드', '유럽·아시아 영화', '감독', '배우', '영화상'],
  },
  {
    key: 'animation', nameKo: '애니메이션', major: 'arts', enabled: true, mustSample: true,
    subs: ['일본 애니메이션', '디즈니·픽사', '서양 애니메이션', '성우·제작사'],
  },
  {
    key: 'comics', nameKo: '만화·웹툰', major: 'arts', enabled: true,
    subs: ['일본 만화', '미국 코믹스·히어로', '한국 만화·웹툰', '만화 캐릭터'],
    boundary: '★ 초안에 없던 분야다. 애니메이션과 원작 만화는 매체가 다르다.',
  },
  {
    key: 'world-lit', nameKo: '세계 문학', major: 'arts', enabled: true,
    subs: ['고전(고대~18세기)', '19세기 소설', '20세기 문학', '시·희곡', '작가·문학상'],
    boundary: '★ 초안에 한국 문학만 있고 세계 문학이 빠져 있었다. 가장 큰 누락이었다.',
  },
  {
    key: 'theatre', nameKo: '공연·연극·뮤지컬', major: 'arts', enabled: true,
    subs: ['연극 고전', '뮤지컬 작품', '무용·발레', '공연 용어·유명 극장'],
    boundary: '★ 초안에 없던 분야다.',
  },
  {
    key: 'architecture', nameKo: '건축', major: 'arts', enabled: true,
    subs: ['건축 양식', '건축가', '유명 건축물', '한국 건축'],
    boundary: '★ 초안의 "건축·유적" 에서 유적을 뗐다. 유적 문제는 해당 시대 역사로 간다.',
  },
  {
    key: 'design-photo', nameKo: '사진·디자인', major: 'arts', enabled: true, mustSample: true,
    subs: ['사진 기술·용어', '사진가·유명 사진', '그래픽 디자인', '산업 디자인', '타이포그래피·색채'],
  },

  // ───────────────────────────────────────────────────────── 스포츠·게임
  {
    key: 'football', nameKo: '축구', major: 'sports', enabled: true,
    subs: ['규칙', '월드컵', '유럽 리그', 'K리그·아시아', '선수·감독'],
    boundary: '★ 현재 소속팀·현재 순위를 묻지 않는다.',
  },
  {
    key: 'baseball', nameKo: '야구', major: 'sports', enabled: true,
    subs: ['규칙', 'KBO', 'MLB', '선수·기록'],
    boundary: '★ 현재 소속팀·현재 순위를 묻지 않는다.',
  },
  {
    key: 'olympic', nameKo: '올림픽·국제대회', major: 'sports', enabled: true,
    subs: ['하계 올림픽', '동계 올림픽', '종목·규정', '기록·메달'],
  },
  {
    key: 'ball-sports', nameKo: '농구·배구·기타 구기', major: 'sports', enabled: true,
    subs: ['농구', '배구', '테니스', '골프', '탁구·배드민턴'],
    boundary:
      '★ 초안의 "격투기·기타 종목" 을 둘로 쪼갠 것이다. ' +
      '"기타" 라는 이름의 중분류는 중복 검사 단위로 쓸 수 없다 — ' +
      '서로 무관한 종목이 한 통에 들어가면 같은 정답이 무의미하게 충돌한다.',
  },
  {
    key: 'combat-athletics', nameKo: '격투기·육상·수영', major: 'sports', enabled: true,
    subs: ['격투기·복싱', '태권도·유도·씨름', '육상', '수영·수상 종목', '동계 종목'],
  },
  {
    key: 'board-game', nameKo: '보드게임·카드게임', major: 'sports', enabled: true,
    subs: ['바둑·장기', '체스', '화투·카드', '보드게임', '퍼즐'],
  },
  {
    key: 'esports', nameKo: 'e스포츠·비디오게임', major: 'sports', enabled: true, mustSample: true,
    subs: ['고전 게임(1980~90년대)', '콘솔 게임', 'PC·온라인 게임', 'e스포츠 대회·선수', '게임 용어'],
    boundary:
      '★ 한국에서 널리 알려진 게임만 다룬다. ' +
      '특정 게임의 내부 수치나 조연 이름을 묻지 않는다 (R010에서 실제로 문제가 된 유형이다).',
  },

  // ───────────────────────────────────────────────────────── 생활·상식
  {
    key: 'world-food', nameKo: '세계 음식·요리', major: 'life', enabled: true,
    subs: ['아시아 음식', '유럽 음식', '아메리카 음식', '조리법·조리 도구', '향신료·재료'],
    boundary: '한국 음식은 별도 중분류다.',
  },
  {
    key: 'drinks', nameKo: '술·음료', major: 'life', enabled: true,
    subs: ['와인', '위스키·증류주', '맥주', '전통주', '커피·차'],
  },
  {
    key: 'brands', nameKo: '브랜드·기업', major: 'life', enabled: true,
    subs: ['기업 창업·역사', '로고·상징', '상표가 된 상품명', '기업 국적'],
    boundary: '★ 현재 매출·시가총액 순위를 묻지 않는다.',
  },
  {
    key: 'world-language', nameKo: '세계 언어·어원', major: 'life', enabled: true,
    subs: ['외래어 어원', '라틴어·그리스어 어근', '문자 체계', '세계 언어 분포', '외국어 표현'],
  },
  {
    key: 'symbols', nameKo: '기호·상징·표지', major: 'life', enabled: true,
    subs: ['국기·국장', '교통 표지', '색의 상징', '기호·아이콘', '별자리·십이지'],
    boundary:
      '★ 초안의 "색·기호·상징" 과 "교통 표지·생활 규칙" 을 합친 것이다. ' +
      '둘 다 "약속된 기호를 아는가" 라는 같은 지식 유형이고 각각은 너무 좁았다.',
  },
  {
    key: 'calendar', nameKo: '절기·기념일·축제', major: 'life', enabled: true,
    subs: ['세계 명절·축제', '국제 기념일', '달력·역법', '계절·절기'],
    boundary: '한국 명절은 한국 전통문화·풍습으로 보낸다.',
  },
  {
    key: 'fashion', nameKo: '의복·패션', major: 'life', enabled: true,
    subs: ['의류 명칭', '패션 브랜드·디자이너', '복식사', '액세서리·소재'],
    boundary: '★ 초안에 없던 분야다.',
  },
  {
    key: 'daily-rule', nameKo: '생활 규칙·안전', major: 'life', enabled: true,
    subs: ['재난·안전 수칙', '생활 법규', '우편·번호 체계', '신고·응급 번호'],
  },
  {
    key: 'pets-garden', nameKo: '반려동물·원예', major: 'life', enabled: true,
    subs: ['개 품종', '고양이 품종', '반려동물 관리', '화초·원예'],
    boundary: '★ 초안에 없던 분야다. 야생 동물은 동물 중분류로 보낸다.',
  },
];

// -----------------------------------------------------------------------------
// 조회 함수
// -----------------------------------------------------------------------------

export function enabledMids(): MidCategory[] {
  return MIDS.filter((m) => m.enabled);
}

export function findMid(key: string): MidCategory | undefined {
  return MIDS.find((m) => m.key === key);
}

export function findMajor(key: string): MajorCategory | undefined {
  return MAJORS.find((m) => m.key === key);
}

/** "대분류 > 중분류 > 소분류" 표기 */
export function categoryPath(midKey: string, sub?: string): string {
  const mid = findMid(midKey);
  if (!mid) return midKey;
  const major = findMajor(mid.major);
  const head = `${major?.nameKo ?? mid.major} > ${mid.nameKo}`;
  return sub ? `${head} > ${sub}` : head;
}

/**
 * ★ 생성 순서. 한도가 부족할 때를 전제로 정렬한다 (D-2 (가)(나)).
 *
 *   1) mustSample 인 중분류를 맨 앞에 둔다 — 건우가 반드시 봐야 하는 분야다
 *   2) 나머지는 대분류를 **번갈아** 돈다 — 중간에 429 로 끊겨도
 *      7개 대분류가 골고루 포함된다
 *
 * ★ 대분류 순서대로 나열하면 앞의 두 대분류만 채우고 끝난다. 그것을 피한다.
 */
export function generationOrder(): MidCategory[] {
  const pool = enabledMids();
  const must = pool.filter((m) => m.mustSample);
  const rest = pool.filter((m) => !m.mustSample);

  const byMajor = new Map<string, MidCategory[]>();
  for (const m of rest) {
    const arr = byMajor.get(m.major) ?? [];
    arr.push(m);
    byMajor.set(m.major, arr);
  }
  const lanes = MAJORS.map((mj) => byMajor.get(mj.key) ?? []);

  const roundRobin: MidCategory[] = [];
  for (let i = 0; ; i += 1) {
    let pushed = false;
    for (const lane of lanes) {
      const item = lane[i];
      if (item) {
        roundRobin.push(item);
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return [...must, ...roundRobin];
}

/** 통계 요약 (문서·보고용) */
export function treeStats(): { majors: number; mids: number; subs: number; enabled: number } {
  const subs = MIDS.reduce((n, m) => n + m.subs.length, 0);
  return { majors: MAJORS.length, mids: MIDS.length, subs, enabled: enabledMids().length };
}
