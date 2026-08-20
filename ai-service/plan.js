// DODAM AI: onboarding concern analysis and structured Plan B reasoning.
// OpenAI failure or missing credentials always returns a deterministic fallback.
import { chat as openaiChat, chatJson, hasOpenAI } from './openai.js';

const CATEGORIES = ['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH'];
const DAMI_STATES = ['SCHEDULE_CHECK', 'EXERCISE', 'EATING', 'MEDITATION', 'WALKING', 'RESTING', 'DEFAULT'];

export async function analyzeConcern(payload) {
  const content = String(payload.content ?? '');

  if (hasOpenAI()) {
    const sys = `너는 자기관리 코치야. 사용자의 고민에서 관련 카테고리와 한 줄 요약을 뽑아라.
카테고리는 ${CATEGORIES.join(', ')} 중에서만 골라. 반드시 이 JSON만 출력:
{"categories":["DIET"],"summary":"..."}`;
    const raw = await openaiChat(sys, content, 0.4);
    const parsed = safeParse(raw);
    if (parsed && Array.isArray(parsed.categories)) {
      const categories = parsed.categories.filter((category) => CATEGORIES.includes(category));
      return { categories: categories.length ? categories : ['WALK'], summary: String(parsed.summary ?? '') };
    }
  }
  return heuristicConcern(content);
}

export async function planBPlan(payload) {
  const context = payload.context ?? {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const maxStops = maxStopsFor(context.availableWindow?.availableMinutes ?? 0);
  if (!candidates.length) return null;

  if (hasOpenAI()) {
    const styleInstruction = context.aiStyle === 'T'
      ? 'aiStyle T: 사실 기반, 구체적이고 간결한 표현을 사용한다.'
      : 'aiStyle F: 지지적이고 안심시키며 격려하는 표현을 사용하되 실행 내용은 구체적으로 쓴다.';
    const system = `너는 자기관리 도우미 '담이'야. Plan B 후보 중에서 현재 상황에 맞는 코스를 고른다.
후보에 있는 id만 selectedExperienceIds와 stopReasons.placeId에 사용한다.
시간을 계산하거나 이동시간을 수정하지 않는다. 선택할 후보 수는 최대 ${maxStops}개이며, 무조건 최대 개수를 채우지 않는다.
personalization을 사용해 사용자가 실제로 실행할 가능성이 높은 후보를 우선 고려하되, 시간·거리·안전·카테고리 hard constraint를 절대 우회하지 않는다.
${styleInstruction}
반드시 제공된 JSON schema에 맞는 구조화된 JSON만 반환한다.`;
    const result = await chatJson(system, JSON.stringify({ context, candidates }), PLAN_B_SCHEMA, 0.4);
    const sanitized = sanitizePlan(result, context, candidates, maxStops);
    if (sanitized) return sanitized;
  }

  return fallbackPlan(context, candidates, maxStops);
}

// Legacy endpoint retained for existing non-Plan-B callers.
export async function planBReasons(payload) {
  const result = await planBPlan({
    context: { condition: payload.situation?.condition, availableWindow: { availableMinutes: payload.situation?.availableMinutes } },
    candidates: (payload.places ?? []).map((place) => ({
      id: place.placeId,
      name: place.name,
      categories: [place.category],
      durationMinutes: place.durationMinutes
    }))
  });
  return {
    summary: result?.summary ?? '',
    reasons: result?.stopReasons ?? []
  };
}

function fallbackPlan(context, candidates, maxStops) {
  const selected = candidates.slice(0, Math.min(maxStops, candidates.length));
  const category = context.brokenPlan?.category ?? selected[0]?.categories?.[0] ?? 'WALK';
  return {
    reframedGoal: {
      originalGoal: String(context.originalGoal ?? '자기관리 이어가기'),
      newGoal: fallbackNewGoal(context),
      reason: context.aiStyle === 'T'
        ? '현재 컨디션과 남은 시간을 기준으로 실행 가능한 수준으로 조정했습니다.'
        : '현재 컨디션과 남은 시간을 고려해 실천 가능한 수준으로 조정했어요.'
    },
    selectedExperienceIds: selected.map((candidate) => candidate.id),
    courseConcept: context.condition === 'TIRED' || context.condition === 'VERY_TIRED'
      ? (context.aiStyle === 'T' ? '저강도 회복 루틴' : '부담을 낮춘 회복 루틴')
      : (context.aiStyle === 'T' ? '실행 가능한 자기관리 루틴' : '짧고 현실적인 자기관리 루틴'),
    summary: context.condition === 'TIRED' || context.condition === 'VERY_TIRED'
      ? (context.aiStyle === 'T' ? '현재 컨디션에 맞는 저강도 코스를 구성했습니다.' : '오늘은 무리하지 않고 현재 컨디션에 맞춰 이어가 볼게요.')
      : (context.aiStyle === 'T' ? '남은 시간과 buffer 안에서 실행 가능한 코스입니다.' : '남은 시간 안에서 실천 가능한 Plan B를 구성했어요.'),
    stopReasons: selected.map((candidate) => ({
      placeId: candidate.id,
      reason: category === 'WALK' || category === 'MENTAL_HEALTH'
        ? (context.aiStyle === 'T' ? '현재 컨디션에서 수행 가능한 강도입니다.' : '부담 없이 현재 컨디션에 맞춰 이어갈 수 있어요.')
        : (context.aiStyle === 'T' ? '남은 시간 안에 수행할 수 있습니다.' : '남은 시간 안에서 현실적으로 실천할 수 있어요.')
    })),
    damiState: damiStateFor(category)
  };
}

function sanitizePlan(value, context, candidates, maxStops) {
  if (!value || typeof value !== 'object') return null;
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const selected = Array.isArray(value.selectedExperienceIds)
    ? [...new Set(value.selectedExperienceIds.map(String))].filter((id) => allowed.has(id)).slice(0, maxStops)
    : [];
  const reasons = Array.isArray(value.stopReasons)
    ? value.stopReasons
        .filter((reason) => reason && allowed.has(String(reason.placeId)))
        .map((reason) => ({ placeId: String(reason.placeId), reason: String(reason.reason ?? '') }))
    : [];
  if (!value.reframedGoal || typeof value.reframedGoal !== 'object') return null;
  return {
    reframedGoal: {
      originalGoal: String(value.reframedGoal.originalGoal ?? context.originalGoal ?? ''),
      newGoal: String(value.reframedGoal.newGoal ?? ''),
      reason: String(value.reframedGoal.reason ?? '')
    },
    selectedExperienceIds: selected,
    courseConcept: String(value.courseConcept ?? ''),
    summary: String(value.summary ?? ''),
    stopReasons: reasons,
    damiState: DAMI_STATES.includes(value.damiState) ? value.damiState : damiStateFor(context.brokenPlan?.category)
  };
}

function heuristicConcern(text) {
  const map = [
    { category: 'DIET', words: ['식사', '식단', '밥', '먹', '끼니', '다이어트'] },
    { category: 'EXERCISE', words: ['운동', '헬스', '근력'] },
    { category: 'RUNNING', words: ['러닝', '달리', '조깅', '뛰'] },
    { category: 'WALK', words: ['산책', '걷'] },
    { category: 'MENTAL_HEALTH', words: ['스트레스', '마음', '멘탈', '불안', '우울', '지쳐', '번아웃'] }
  ];
  const categories = map.filter((item) => item.words.some((word) => text.includes(word))).map((item) => item.category);
  if (!categories.length) categories.push('WALK');
  const summary = /시간|바쁘|없어|퇴근|야근/.test(text)
    ? '시간 부족으로 자기관리를 자주 놓치는 경향이 있습니다.'
    : '자기관리를 이어가고 싶은 마음이 보입니다.';
  return { categories, summary };
}

function maxStopsFor(availableMinutes) {
  if (availableMinutes < 30) return 1;
  if (availableMinutes < 90) return 2;
  return 3;
}

function fallbackNewGoal(context) {
  if (context.condition === 'TIRED' || context.condition === 'VERY_TIRED') return '오늘은 무리하지 않고 가볍게 자기관리를 이어가기';
  return `${context.originalGoal ?? '자기관리'}를 남은 시간에 맞게 이어가기`;
}

function damiStateFor(category) {
  if (category === 'EXERCISE' || category === 'RUNNING') return 'EXERCISE';
  if (category === 'DIET') return 'EATING';
  if (category === 'MENTAL_HEALTH') return 'MEDITATION';
  if (category === 'WALK') return 'WALKING';
  return 'DEFAULT';
}

function safeParse(text) {
  if (!text) return null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start === -1 || end === -1 ? null : JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const PLAN_B_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reframedGoal', 'selectedExperienceIds', 'courseConcept', 'summary', 'stopReasons', 'damiState'],
  properties: {
    reframedGoal: {
      type: 'object',
      additionalProperties: false,
      required: ['originalGoal', 'newGoal', 'reason'],
      properties: {
        originalGoal: { type: 'string' },
        newGoal: { type: 'string' },
        reason: { type: 'string' }
      }
    },
    selectedExperienceIds: { type: 'array', items: { type: 'string' } },
    courseConcept: { type: 'string' },
    summary: { type: 'string' },
    stopReasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['placeId', 'reason'],
        properties: { placeId: { type: 'string' }, reason: { type: 'string' } }
      }
    },
    damiState: { type: 'string', enum: DAMI_STATES }
  }
};
