// 자기관리 고민 텍스트 → 카테고리 분류 + 요약.
// aiClient 있으면 AI 분석, 없으면 키워드 휴리스틱으로 폴백.

const KEYWORD_MAP = [
  { category: 'DIET', words: ['식사', '식단', '밥', '먹', '끼니', '영양', '다이어트'] },
  { category: 'EXERCISE', words: ['운동', '헬스', '근력', '웨이트', '피트니스'] },
  { category: 'RUNNING', words: ['러닝', '달리', '조깅', '뛰'] },
  { category: 'WALK', words: ['산책', '걷', '워킹'] },
  { category: 'MENTAL_HEALTH', words: ['스트레스', '마음', '멘탈', '불안', '우울', '지쳐', '번아웃', '쉬'] }
];

export async function analyzeConcern(content, aiClient) {
  if (aiClient?.analyzeConcern) {
    try {
      const result = await aiClient.analyzeConcern(content);
      if (result && Array.isArray(result.categories)) return result;
    } catch {
      /* 폴백으로 */
    }
  }
  return heuristic(content);
}

function heuristic(content) {
  const text = String(content);
  const categories = [];
  for (const { category, words } of KEYWORD_MAP) {
    if (words.some((w) => text.includes(w))) categories.push(category);
  }
  if (categories.length === 0) categories.push('WALK');

  const labelMap = {
    DIET: '식사',
    EXERCISE: '운동',
    RUNNING: '러닝',
    WALK: '산책',
    MENTAL_HEALTH: '마음 관리'
  };
  const labels = categories.map((c) => labelMap[c]).join('과 ');
  const summary = /시간|바쁘|없어|퇴근|야근/.test(text)
    ? `시간 부족으로 ${labels}을(를) 자주 놓치는 경향이 있습니다.`
    : `${labels} 쪽에서 자기관리 고민이 있는 것으로 보입니다.`;

  return { categories, summary };
}
