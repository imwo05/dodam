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

const SLOT_LABELS = new Set([
  'selfCareGoals',
  'selfCareDifficultyReasons',
  'planChangeReasons',
  'difficultyAfterPlanChange',
  'availableFallbackMinutes',
  'preferredActivities',
  'preferredAtmospheres',
  'avoidAtmospheres',
  'preferredIntensity',
  'socialPreference'
]);

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
      0.4
    );
    const sanitized = sanitizeTurn(result);
    if (sanitized) return { ...sanitized, fallback: false };
  }

  return fallbackOnboardingTurn({ context, profile, messages });
}

function sanitizeTurn(value) {
  if (!value || typeof value !== 'object' || typeof value.assistantMessage !== 'string') return null;
  if (!value.assistantMessage.trim() || value.assistantMessage.length > 2000) return null;
  if (!value.extractedProfilePatch || typeof value.extractedProfilePatch !== 'object') return null;
  if (!Array.isArray(value.missingSlots) || typeof value.completed !== 'boolean') return null;

  const patch = {};
  for (const field of PROFILE_FIELDS) {
    const valueForField = value.extractedProfilePatch[field];
    if (valueForField !== null && valueForField !== undefined) patch[field] = valueForField;
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
  return {
    assistantMessage: value.assistantMessage.trim(),
    extractedProfilePatch: patch,
    missingSlots: value.missingSlots.filter((slot) => SLOT_LABELS.has(slot)),
    completed: value.completed
  };
}

function fallbackOnboardingTurn({ context, profile, messages }) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'USER')?.content ?? '';
  const extractedProfilePatch = extractFallbackPatch(lastUserMessage);
  const merged = { ...profile, ...extractedProfilePatch };
  const missingSlots = missingSlotsFor(merged);
  const assistantMessage = messages.length === 0
    ? '요즘, 나를 위해 가장 챙기고 싶은 건 무엇인가요?'
    : missingSlots.length
      ? nextFallbackQuestion(missingSlots[0])
      : (context.aiStyle === 'T'
        ? '현재 답변을 바탕으로 실행 가능한 Plan B를 연결할 수 있습니다.'
        : '알겠어요. 지금까지 말씀해주신 내용을 바탕으로 무리 없이 이어갈 방법을 찾아볼게요.');
  return {
    assistantMessage,
    extractedProfilePatch,
    missingSlots,
    completed: false,
    fallback: true
  };
}

// Explicitly isolated, deterministic fallback. It is not used when OpenAI returns a valid turn.
function extractFallbackPatch(text) {
  const value = String(text);
  const patch = {};
  if (/스트레스|불안|마음/.test(value)) patch.selfCareGoals = ['STRESS_RELIEF'];
  if (/야근|잔업|늦게 퇴근/.test(value)) patch.planChangeReasons = ['OVERTIME'];
  if (/피곤|피로|지쳐|기운이 없/.test(value)) patch.selfCareDifficultyReasons = ['FATIGUE'];
  if (/포기|못 하|중단|그만/.test(value)) patch.difficultyAfterPlanChange = ['GIVE_UP_ACTIVITY'];
  if (/운동|헬스|근력/.test(value)) patch.preferredActivities = ['EXERCISE'];
  if (/산책|걷/.test(value)) patch.preferredActivities = ['WALK'];
  if (/조용|차분/.test(value)) patch.preferredAtmospheres = ['QUIET'];
  if (/붐비|시끄럽|복잡/.test(value)) patch.avoidAtmospheres = ['CROWDED'];
  if (/혼자|혼자서/.test(value)) patch.socialPreference = 'SOLO';
  if (/같이|친구|사람들과/.test(value)) patch.socialPreference = 'SOCIAL';
  if (/가볍|저강도|부담 없/.test(value)) patch.preferredIntensity = 'LOW';
  const range = value.match(/(\d{1,3})\s*(?:~|-|에서)\s*(\d{1,3})\s*분/);
  const single = value.match(/(\d{1,3})\s*분/);
  if (range) patch.availableFallbackMinutes = { min: Number(range[1]), max: Number(range[2]) };
  else if (single) patch.availableFallbackMinutes = { min: Number(single[1]), max: Number(single[1]) };
  return patch;
}

function missingSlotsFor(profile) {
  const missing = [];
  if (!profile.selfCareGoals?.length) missing.push('selfCareGoals');
  if (!profile.selfCareDifficultyReasons?.length && !profile.difficultyAfterPlanChange?.length) missing.push('selfCareDifficultyReasons');
  if (!profile.availableFallbackMinutes) missing.push('availableFallbackMinutes');
  if (!profile.preferredActivities?.length && !profile.preferredAtmospheres?.length) missing.push('preferredActivities_or_preferredAtmospheres');
  return missing;
}

function nextFallbackQuestion(slot) {
  return {
    selfCareGoals: '요즘 나를 위해 가장 챙기고 싶은 것은 무엇인가요?',
    selfCareDifficultyReasons: '자기관리를 이어가기 어려운 순간에는 보통 어떤 일이 있나요?',
    availableFallbackMinutes: '계획이 바뀐 날에도 부담 없이 쓸 수 있는 시간은 어느 정도인가요?',
    preferredActivities_or_preferredAtmospheres: '그 시간에 편하게 할 수 있는 활동이나 분위기는 어떤 쪽인가요?'
  }[slot] ?? '자기관리에 대해 조금 더 알려주실 수 있을까요?';
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
