// DODAM AI: 자기관리 고민 분석 + Plan B 추천 이유 생성.
// OpenAI 키 있으면 LLM, 없으면 휴리스틱 폴백.
import { chat as openaiChat, hasOpenAI } from './openai.js';

const CATEGORIES = ['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH'];

// ---------- 고민 분석 ----------
export async function analyzeConcern(payload) {
  const content = String(payload.content ?? '');

  if (hasOpenAI()) {
    const sys = `너는 자기관리 코치야. 사용자의 고민에서 관련 카테고리와 한 줄 요약을 뽑아라.
카테고리는 ${CATEGORIES.join(', ')} 중에서만 골라. 반드시 이 JSON만 출력:
{"categories":["DIET"],"summary":"..."}`;
    const raw = await openaiChat(sys, content, 0.4);
    const parsed = safeParse(raw);
    if (parsed && Array.isArray(parsed.categories)) {
      const categories = parsed.categories.filter((c) => CATEGORIES.includes(c));
      return { categories: categories.length ? categories : ['WALK'], summary: String(parsed.summary ?? '') };
    }
  }
  return heuristicConcern(content);
}

function heuristicConcern(text) {
  const map = [
    { c: 'DIET', w: ['식사', '식단', '밥', '먹', '끼니', '다이어트'] },
    { c: 'EXERCISE', w: ['운동', '헬스', '근력'] },
    { c: 'RUNNING', w: ['러닝', '달리', '조깅', '뛰'] },
    { c: 'WALK', w: ['산책', '걷'] },
    { c: 'MENTAL_HEALTH', w: ['스트레스', '마음', '멘탈', '불안', '우울', '지쳐', '번아웃'] }
  ];
  const categories = map.filter((m) => m.w.some((w) => text.includes(w))).map((m) => m.c);
  if (!categories.length) categories.push('WALK');
  const summary = /시간|바쁘|없어|퇴근|야근/.test(text)
    ? '시간 부족으로 자기관리를 자주 놓치는 경향이 있습니다.'
    : '자기관리를 이어가고 싶은 마음이 보입니다.';
  return { categories, summary };
}

// ---------- Plan B 추천 이유 ----------
// payload: { situation:{condition,continuityMode,availableMinutes}, places:[{placeId,name,category,durationMinutes,distanceRank}] }
export async function planBReasons(payload) {
  const situation = payload.situation ?? {};
  const places = Array.isArray(payload.places) ? payload.places : [];

  if (hasOpenAI() && places.length) {
    const sys = `너는 자기관리 도우미 '담이'야. 사용자의 컨디션/남은시간을 고려해
각 장소를 왜 추천하는지 한 문장씩 다정하게 써줘. 전체 한줄 요약도.
반드시 이 JSON만 출력:
{"summary":"...","reasons":[{"placeId":"plc_001","reason":"..."}]}`;
    const user = JSON.stringify({ situation, places });
    const raw = await openaiChat(sys, user, 0.6);
    const parsed = safeParse(raw);
    if (parsed && Array.isArray(parsed.reasons)) {
      return { summary: String(parsed.summary ?? ''), reasons: parsed.reasons };
    }
  }
  return heuristicReasons(situation, places);
}

function heuristicReasons(situation, places) {
  const tired = situation.condition === 'TIRED' || situation.condition === 'VERY_TIRED';
  const summary = tired
    ? '현재 컨디션과 남은 시간을 고려해 부담 없이 이어갈 수 있는 장소를 골랐어요.'
    : '남은 시간 안에 기분 좋게 다녀올 수 있는 장소를 골랐어요.';
  const catText = {
    WALK: '부담 없이 걸을 수 있어요.',
    DIET: '짧은 시간 안에 식사를 챙길 수 있어요.',
    RUNNING: '가볍게 몸을 움직이기 좋아요.',
    EXERCISE: '집중해서 운동하기 좋아요.',
    MENTAL_HEALTH: '마음을 가라앉히기 좋아요.'
  };
  const reasons = places.map((p) => ({
    placeId: p.placeId,
    reason:
      (tired && (p.category === 'WALK' || p.category === 'MENTAL_HEALTH')
        ? '피곤한 상태에서도 '
        : '현재 위치에서 가까워 ') + (catText[p.category] ?? '가볍게 다녀오기 좋아요.')
  }));
  return { summary, reasons };
}

function safeParse(text) {
  if (!text) return null;
  try {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}
