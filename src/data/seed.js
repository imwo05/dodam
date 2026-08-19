// DODAM 시드 데이터
// 시드 유저: 장소 등록자 겸 신규 유저의 기본 이웃으로 사용 (로그인 불가한 고스트 계정)
const IMG = 'https://placehold.co/600x400?text=DODAM';

export const seedUsers = [
  { id: 'usr_900', name: '담이', username: 'dodam', email: 'dodam@seed.app', passwordHash: 'x', age: null, profileImageUrl: null, onboardingCompleted: true, isNeighborSeed: false, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'usr_901', name: '유진', username: 'yujin', email: 'yujin@seed.app', passwordHash: 'x', age: 27, profileImageUrl: null, onboardingCompleted: true, isNeighborSeed: true, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'usr_902', name: '민서', username: 'minseo', email: 'minseo@seed.app', passwordHash: 'x', age: 24, profileImageUrl: null, onboardingCompleted: true, isNeighborSeed: true, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'usr_903', name: '도현', username: 'dohyun', email: 'dohyun@seed.app', passwordHash: 'x', age: 30, profileImageUrl: null, onboardingCompleted: true, isNeighborSeed: true, createdAt: '2026-07-01T00:00:00.000Z' }
];

// 카테고리: EXERCISE / DIET / WALK / RUNNING / MENTAL_HEALTH
export const placesSeed = [
  {
    id: 'plc_001', creatorId: 'usr_901', name: '청계천 산책로', address: '서울 종로구 청계천로',
    latitude: 37.5696, longitude: 126.9784, activityType: 'WALK', durationMinutes: 30,
    description: '도심에서 가볍게 걸을 수 있는 산책로', tip: '저녁보다 평일 오후가 한적합니다.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_002', creatorId: 'usr_902', name: '연어 포케집', address: '서울 종로구 삼일대로',
    latitude: 37.5701, longitude: 126.9829, activityType: 'DIET', durationMinutes: 20,
    description: '저칼로리 연어 포케가 맛있는 집', tip: '점심에는 웨이팅이 있어요. 12시 전 추천.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_003', creatorId: 'usr_901', name: '낙산공원 러닝코스', address: '서울 종로구 낙산길',
    latitude: 37.5802, longitude: 127.0074, activityType: 'RUNNING', durationMinutes: 40,
    description: '야경 보며 뛰기 좋은 성곽길 러닝코스', tip: '해질녘에 가면 노을이 예뻐요.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_004', creatorId: 'usr_903', name: '동네 헬스장', address: '서울 관악구 관악로',
    latitude: 37.4784, longitude: 126.9516, activityType: 'EXERCISE', durationMinutes: 60,
    description: '1일 이용권 되는 동네 헬스장', tip: '샤워실이 깨끗해요.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_005', creatorId: 'usr_902', name: '조용한 명상 카페', address: '서울 종로구 북촌로',
    latitude: 37.5826, longitude: 126.9830, activityType: 'MENTAL_HEALTH', durationMinutes: 45,
    description: '차 마시며 마음을 가라앉히기 좋은 조용한 공간', tip: '2층 창가 자리가 제일 조용해요.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_006', creatorId: 'usr_903', name: '서울숲 산책길', address: '서울 성동구 뚝섬로',
    latitude: 37.5445, longitude: 127.0374, activityType: 'WALK', durationMinutes: 35,
    description: '넓은 도심 공원, 가볍게 걷기 좋아요', tip: '사슴 방사장 쪽이 한적합니다.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_007', creatorId: 'usr_901', name: '샐러드 브런치집', address: '서울 마포구 와우산로',
    latitude: 37.5540, longitude: 126.9250, activityType: 'DIET', durationMinutes: 25,
    description: '든든한 샐러드 브런치', tip: '포장하면 5분이면 나와요.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'plc_008', creatorId: 'usr_902', name: '한강 러닝 트랙', address: '서울 영등포구 여의동로',
    latitude: 37.5285, longitude: 126.9330, activityType: 'RUNNING', durationMinutes: 30,
    description: '강바람 맞으며 뛰는 한강 트랙', tip: '저녁엔 조명이 켜져서 안전해요.',
    imageUrls: [IMG], createdAt: '2026-07-02T00:00:00.000Z'
  }
];
