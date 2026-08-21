import { chatJson, hasOpenAI } from './openai.js';

const PROFILE_FIELDS = [
  'selfCareGoals',
  'selfCareDifficultyReasons',
  'planChangeReasons',
  'difficultyAfterPlanChange',
  'availableFallbackMinutes',
  'preferredActivities',
  'preferredAtmospheres',
  'avoidAtmospheres',
  'preferredIntensity',
  'socialPreference',
  'aiStyle'
];

const MINIMUM_MISSING_SLOTS = [
  'selfCareGoals',
  'selfCareDifficultyReasons',
  'availableFallbackMinutes',
  'preferredActivities_or_preferredAtmospheres'
];

export const MAX_USER_ANSWERS = 6;

const DISPLAY_LABELS = {
  EXERCISE: '운동',
  RUNNING: '러닝',
  WALK: '산책',
  DIET: '식사 관리',
  MENTAL_HEALTH: '마음 돌보기',
  STRESS_RELIEF: '스트레스 해소',
  FATIGUE: '피로',
  TIME_SHORTAGE: '시간 부족',
  OVERTIME: '야근',
  UNEXPECTED_SCHEDULE: '갑작스러운 일정',
  SOCIAL_COMMITMENT: '약속이나 회식',
  WEATHER: '날씨',
  GIVE_UP_ACTIVITY: '활동을 포기하는 것',
  QUIET: '조용한 곳',
  CROWDED: '붐비는 곳'
};

export async function onboardingTurn(payload) {
  const context = payload?.context ?? {};
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const profile = payload?.profile ?? {};

  if (hasOpenAI()) {
    const style = context.aiStyle === 'T'
      ? 'T 스타일: 구체적이고 실용적이며 사실 기반으로 짧게 말한다.'
      : 'F 스타일: 공감적이고 부드럽게 격려하되 실행 내용은 구체적으로 말한다.';
    const system = [
      '너는 DODAM의 담이야. 사용자의 자기관리 성향을 자연스러운 대화로 파악한다.',
      '고정된 질문 목록을 순서대로 묻지 말고, 이전 대화와 이미 채워진 profile을 보고 가장 자연스러운 다음 질문이나 반응을 만든다.',
      '한 번의 사용자 답변에서 근거가 충분한 여러 profile field를 동시에 추출할 수 있다.',
      '확실하지 않은 값은 추측하지 말고 extractedProfilePatch의 해당 값을 null로 둔다.',
      style,
      'missingSlots는 아직 충분한 근거가 없는 정보만 포함한다. 사용자가 이미 답한 정보는 다시 missing으로 표시하지 않는다.',
      '반드시 JSON Schema에 맞는 JSON만 반환한다.'
    ].join('\n');
    const result = await chatJson(
      system,
      JSON.stringify({ context, profile, messages }),
      ONBOARDING_SCHEMA,
      0.4,
      {
        operation: 'onboardingTurn',
        validate: (value) => sanitizeTurn(value, profile, context, messages)
      }
    );
    if (result) return { ...result, fallback: false };
  }

  return fallbackOnboardingTurn({ context, profile, messages });
}

function sanitizeTurn(value, profile = {}, context = {}, messages = []) {
  if (!value || typeof value !== 'object' || typeof value.assistantMessage !== 'string') return null;
  if (!value.assistantMessage.trim() || value.assistantMessage.length > 2000) return null;
  if (!value.extractedProfilePatch || typeof value.extractedProfilePatch !== 'object') return null;
  if (!Array.isArray(value.missingSlots) || typeof value.completed !== 'boolean') return null;

  const patch = {};
  for (const field of PROFILE_FIELDS) {
    const valueForField = value.extractedProfilePatch[field];
    if (valueForField !== null && valueForField !== undefined) {
      if (Array.isArray(valueForField) && valueForField.length === 0) continue;
      patch[field] = valueForField;
    }
  }
  if (patch.preferredIntensity != null && !['LOW', 'MEDIUM', 'HIGH'].includes(patch.preferredIntensity)) return null;
  if (patch.socialPreference != null && !['SOLO', 'SOCIAL', 'ANY'].includes(patch.socialPreference)) return null;
  if (patch.aiStyle != null && !['T', 'F'].includes(patch.aiStyle)) return null;
  if (patch.availableFallbackMinutes != null) {
    const { min, max } = patch.availableFallbackMinutes;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 1440 || min > max) return null;
  }
  for (const field of PROFILE_FIELDS.filter((item) => !['availableFallbackMinutes', 'preferredIntensity', 'socialPreference', 'aiStyle'].includes(item))) {
    if (patch[field] != null && (!Array.isArray(patch[field]) || patch[field].some((item) => typeof item !== 'string'))) return null;
  }
  const merged = mergeProfile(profile, patch);
  const missingSlots = missingSlotsFor(merged);
  const userAnswerCount = messages.filter((message) => message.role === 'USER').length;
  const assistantMessage = missingSlots.length === 0
    ? completionMessage(merged, context)
    : userAnswerCount >= MAX_USER_ANSWERS
      ? finalRequiredQuestion(missingSlots, merged)
      : value.assistantMessage.trim();
  return {
    assistantMessage,
    extractedProfilePatch: patch,
    missingSlots,
    completed: missingSlots.length === 0
  };
}

export function fallbackOnboardingTurn({ context, profile, messages }) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'USER')?.content ?? '';
  const extractedProfilePatch = extractFallbackPatch(lastUserMessage);
  const merged = mergeProfile(profile, extractedProfilePatch);
  const missingSlots = missingSlotsFor(merged);
  const completed = messages.length > 0 && missingSlots.length === 0;
  const userAnswerCount = messages.filter((message) => message.role === 'USER').length;
  const assistantMessage = messages.length === 0
    ? initialFallbackMessage(merged, missingSlots)
    : completed
      ? completionMessage(merged, context)
      : userAnswerCount >= MAX_USER_ANSWERS
        ? finalRequiredQuestion(missingSlots, merged)
      : nextFallbackQuestion(missingSlots, merged, messages);
  return {
    assistantMessage: avoidImmediateRepeat(assistantMessage, merged, messages),
    extractedProfilePatch,
    missingSlots,
    completed,
    fallback: true
  };
}

// Explicitly isolated, deterministic fallback. It is not used when OpenAI returns a valid turn.
function extractFallbackPatch(text) {
  const value = String(text);
  const patch = {};
  const add = (field, item) => {
    patch[field] = [...new Set([...(patch[field] ?? []), item])];
  };

  if (/스트레스|불안|마음이 힘들|번아웃/.test(value)) add('selfCareGoals', 'STRESS_RELIEF');
  if (/운동|헬스|근력/.test(value)) {
    add('selfCareGoals', 'EXERCISE');
    add('preferredActivities', 'EXERCISE');
  }
  if (/러닝|달리|조깅|뛰/.test(value)) {
    add('selfCareGoals', 'RUNNING');
    add('preferredActivities', 'RUNNING');
  }
  if (/산책|걷/.test(value)) {
    add('selfCareGoals', 'WALK');
    add('preferredActivities', 'WALK');
  }
  if (/식단|식사|끼니|다이어트/.test(value)) {
    add('selfCareGoals', 'DIET');
    add('preferredActivities', 'DIET');
  }
  if (/명상|호흡|마음챙김/.test(value)) {
    add('selfCareGoals', 'MENTAL_HEALTH');
    add('preferredActivities', 'MENTAL_HEALTH');
  }
  if (/차\s*한\s*잔|차를|차와|차랑/.test(value)) add('preferredActivities', 'TEA');
  if (/책|독서/.test(value)) add('preferredActivities', 'READING');
  if (/음악/.test(value)) add('preferredActivities', 'MUSIC');

  if (/야근|잔업|늦게 퇴근/.test(value)) add('planChangeReasons', 'OVERTIME');
  if (/약속|회식|사람을 만나|친구/.test(value)) add('planChangeReasons', 'SOCIAL_COMMITMENT');
  if (/비가|비 오|날씨/.test(value)) add('planChangeReasons', 'WEATHER');
  if (/갑자기|예상 못|일정이 바뀌|일정이 생기/.test(value)) add('planChangeReasons', 'UNEXPECTED_SCHEDULE');
  if (/시간이 없|바빠|촉박|늦어/.test(value)) {
    add('planChangeReasons', 'TIME_SHORTAGE');
    add('selfCareDifficultyReasons', 'TIME_SHORTAGE');
  }
  if (/피곤|피로|지쳐|기운이 없/.test(value)) add('selfCareDifficultyReasons', 'FATIGUE');
  if (/동기가 없|귀찮|의욕이 없/.test(value)) add('selfCareDifficultyReasons', 'LOW_MOTIVATION');
  if (/포기|못 하|못해|중단|그만|미뤄/.test(value)) add('difficultyAfterPlanChange', 'GIVE_UP_ACTIVITY');

  if (/가볍|저강도|부담 없|짧게/.test(value)) patch.preferredIntensity = 'LOW';
  else if (/세게|고강도|강하게/.test(value)) patch.preferredIntensity = 'HIGH';

  if (/조용|차분|한적|고요/.test(value)) add('preferredAtmospheres', 'QUIET');
  if (/밖|야외|공원/.test(value)) add('preferredAtmospheres', 'OUTDOOR');
  if (/붐비|시끄럽|복잡|사람이 많/.test(value)) add('avoidAtmospheres', 'CROWDED');
  if (/혼자|혼자서/.test(value)) patch.socialPreference = 'SOLO';
  if (/같이|친구|사람들과/.test(value)) patch.socialPreference = 'SOCIAL';
  const range = value.match(/(\d{1,3})\s*(?:~|-|에서)\s*(\d{1,3})\s*분/);
  const single = value.match(/(\d{1,3})\s*분/);
  if (range) patch.availableFallbackMinutes = { min: Number(range[1]), max: Number(range[2]) };
  else if (single) patch.availableFallbackMinutes = { min: Number(single[1]), max: Number(single[1]) };
  return patch;
}

function missingSlotsFor(profile) {
  return MINIMUM_MISSING_SLOTS.filter((slot) => {
    if (slot === 'selfCareGoals') return !profile.selfCareGoals?.length;
    if (slot === 'selfCareDifficultyReasons') {
      return !profile.selfCareDifficultyReasons?.length
        && !profile.planChangeReasons?.length
        && !profile.difficultyAfterPlanChange?.length;
    }
    if (slot === 'availableFallbackMinutes') return !profile.availableFallbackMinutes;
    return !profile.preferredActivities?.length && !profile.preferredAtmospheres?.length;
  });
}

function mergeProfile(profile, patch) {
  const current = profile ?? {};
  const next = patch ?? {};
  const arrayFields = [
    'selfCareGoals',
    'selfCareDifficultyReasons',
    'planChangeReasons',
    'difficultyAfterPlanChange',
    'preferredActivities',
    'preferredAtmospheres',
    'avoidAtmospheres'
  ];
  const merged = { ...current, ...next };
  for (const field of arrayFields) {
    merged[field] = [...new Set([
      ...(Array.isArray(current[field]) ? current[field] : []),
      ...(Array.isArray(next[field]) ? next[field] : [])
    ])];
  }
  return merged;
}

function finalRequiredQuestion(missingSlots, profile) {
  if (missingSlots.length === 1) return questionForSlot(missingSlots[0], profile);
  return `마지막으로 ${missingSlots.map((slot) => questionForSlot(slot, profile)).join(' ')} 한 번에 알려주실 수 있을까요?`;
}

function initialFallbackMessage(profile, missingSlots) {
  const opening = '일정이 바뀌어도 실제로 할 수 있는 자기관리 방법을 찾으려고 몇 가지만 물어볼게요.';
  return `${opening} ${nextFallbackQuestion(missingSlots, profile, [])}`;
}

function nextFallbackQuestion(missingSlots, profile, messages) {
  const recentAssistantMessages = messages
    .filter((message) => message.role === 'ASSISTANT')
    .slice(-6)
    .map((message) => String(message.content ?? ''));
  const nextSlot = missingSlots.find((slot) => !askedConcept(recentAssistantMessages, slot));
  if (!nextSlot) return contextualContinuation(profile, messages);
  return questionForSlot(nextSlot, profile);
}

function questionForSlot(slot, profile) {
  if (slot === 'selfCareGoals') {
    return profile.planChangeReasons?.length || profile.difficultyAfterPlanChange?.length
      ? '그런 날에도 가능하면 놓치고 싶지 않은 건 뭐예요?'
      : '요즘 가장 챙기고 싶은 건 뭐예요?';
  }
  if (slot === 'selfCareDifficultyReasons') {
    const goal = displayFirst(profile.selfCareGoals, '자기관리');
    return `${goal}을 이어가기 어려워지는 건 보통 어떤 때예요?`;
  }
  if (slot === 'availableFallbackMinutes') {
    return profile.planChangeReasons?.length || profile.difficultyAfterPlanChange?.length
      ? '그럴 때 완전히 쉬는 것보다 짧게라도 할 수 있다면, 몇 분 정도가 부담 없을까요?'
      : '계획이 바뀐 날에도 부담 없이 쓸 수 있는 시간은 몇 분쯤일까요?';
  }
  if (slot === 'preferredActivities_or_preferredAtmospheres') {
    const time = formatMinutes(profile.availableFallbackMinutes);
    return time
      ? `${time} 정도라면 몸을 움직이는 게 좋아요, 조용히 쉬는 게 좋아요?`
      : '짧은 시간에 편하게 할 수 있는 활동이나 분위기는 어떤 쪽이에요?';
  }
  return '자기관리에 대해 조금 더 알려주실 수 있을까요?';
}

function askedConcept(messages, slot) {
  const patterns = {
    selfCareGoals: /가장 챙기고 싶은|놓치고 싶지 않은/,
    selfCareDifficultyReasons: /이어가기 어려|어려워지는|어떤 때/,
    availableFallbackMinutes: /몇 분|시간은.*부담|시간은.*현실/,
    preferredActivities_or_preferredAtmospheres: /몸을 움직이는|조용히 쉬|활동이나 분위기/
  };
  return messages.some((message) => patterns[slot]?.test(message));
}

function contextualContinuation(profile, messages) {
  const goal = displayFirst(profile.selfCareGoals, '자기관리');
  const time = formatMinutes(profile.availableFallbackMinutes);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'USER')?.content ?? '';
  if (time) return `${time} 정도가 현실적이군요. 그 시간에 ${goal}을 이어가려면 어떤 방식이 가장 편할까요?`;
  if (/모르|잘 모르|아직/.test(String(lastUserMessage))) {
    return `${goal}을 놓치지 않으면서도 무리하지 않는 방법부터 찾아볼게요. 아주 짧게 시작한다면 어떤 게 괜찮을까요?`;
  }
  return `${goal}을 챙기고 싶군요. 계획이 어긋난 날에도 이어갈 수 있는 방법을 함께 골라볼까요?`;
}

function avoidImmediateRepeat(message, profile, messages) {
  const lastAssistantMessage = [...messages].reverse().find((item) => item.role === 'ASSISTANT')?.content;
  if (lastAssistantMessage !== message) return message;
  const goal = displayFirst(profile.selfCareGoals, '자기관리');
  return `${goal}을 이어갈 기준은 잡혔어요. 이 기준으로 현실적인 대안을 찾아볼게요.`;
}

function completionMessage(profile, context) {
  const goal = displayFirst(profile.selfCareGoals, '자기관리');
  const time = formatMinutes(profile.availableFallbackMinutes) ?? '짧은 시간';
  const setting = profile.preferredAtmospheres?.length
    ? displayFirst(profile.preferredAtmospheres, '편한 곳')
    : profile.socialPreference === 'SOLO'
      ? '혼자'
      : profile.socialPreference === 'SOCIAL'
        ? '누군가와 함께'
        : '편한 방식으로';
  const disruption = displayFirst(profile.planChangeReasons, null);
  const prefix = disruption ? `${disruption}로 계획이 바뀌어도` : '계획이 바뀌어도';
  if (context.aiStyle === 'T') {
    return `${prefix} ${goal}을 이어가고, ${time} 정도 ${setting} 할 수 있는 대안이 현실적이겠어요. 이 기준으로 찾아볼게요.`;
  }
  return `${prefix} ${goal}은 이어가고 싶고, ${time} 정도 ${setting} 할 수 있으면 괜찮겠어요. 이 기준으로 무리 없는 방법을 찾아볼게요.`;
}

function displayFirst(values, fallback) {
  const value = Array.isArray(values) ? values.find(Boolean) : values;
  return value ? (DISPLAY_LABELS[value] ?? String(value).toLowerCase()) : fallback;
}

function formatMinutes(value) {
  if (!value || !Number.isInteger(value.min) || !Number.isInteger(value.max)) return null;
  return value.min === value.max ? `${value.min}분` : `${value.min}~${value.max}분`;
}

const nullableStringArray = { type: ['array', 'null'], items: { type: 'string' } };
const ONBOARDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'extractedProfilePatch', 'missingSlots', 'completed'],
  properties: {
    assistantMessage: { type: 'string' },
    extractedProfilePatch: {
      type: 'object',
      additionalProperties: false,
      required: PROFILE_FIELDS,
      properties: {
        selfCareGoals: nullableStringArray,
        selfCareDifficultyReasons: nullableStringArray,
        planChangeReasons: nullableStringArray,
        difficultyAfterPlanChange: nullableStringArray,
        availableFallbackMinutes: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['min', 'max'],
          properties: {
            min: { type: 'integer', minimum: 1, maximum: 1440 },
            max: { type: 'integer', minimum: 1, maximum: 1440 }
          }
        },
        preferredActivities: nullableStringArray,
        preferredAtmospheres: nullableStringArray,
        avoidAtmospheres: nullableStringArray,
        preferredIntensity: { anyOf: [{ type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, { type: 'null' }] },
        socialPreference: { anyOf: [{ type: 'string', enum: ['SOLO', 'SOCIAL', 'ANY'] }, { type: 'null' }] },
        aiStyle: { anyOf: [{ type: 'string', enum: ['T', 'F'] }, { type: 'null' }] }
      }
    },
    missingSlots: { type: 'array', items: { type: 'string' } },
    completed: { type: 'boolean' }
  }
};
