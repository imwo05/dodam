import { ApiError } from '../../lib/errors.js';

export const INTENSITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);
export const SOCIAL_PREFERENCES = new Set(['SOLO', 'SOCIAL', 'ANY']);

export const PERSONALIZATION_FIELDS = [
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

export function emptyPersonalizationProfile() {
  return {
    selfCareGoals: [],
    selfCareDifficultyReasons: [],
    planChangeReasons: [],
    difficultyAfterPlanChange: [],
    availableFallbackMinutes: null,
    preferredActivities: [],
    preferredAtmospheres: [],
    avoidAtmospheres: [],
    preferredIntensity: null,
    socialPreference: null,
    aiStyle: 'F'
  };
}

export function normalizePersonalizationPatch(input, { strict = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(body)) {
    if (!PERSONALIZATION_FIELDS.includes(key)) {
      if (strict) throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', `알 수 없는 personalization field: ${key}`);
      continue;
    }
    if (key === 'availableFallbackMinutes') {
      out[key] = normalizeMinutes(body[key]);
    } else if (key === 'preferredIntensity') {
      out[key] = normalizeEnum(body[key], INTENSITIES, key, { nullable: true });
    } else if (key === 'socialPreference') {
      out[key] = normalizeEnum(body[key], SOCIAL_PREFERENCES, key, { nullable: true });
    } else if (key === 'aiStyle') {
      out[key] = normalizeEnum(body[key], new Set(['T', 'F']), key);
    } else {
      out[key] = normalizeStringArray(body[key], key);
    }
  }
  return out;
}

export function mergePersonalizationProfile(existing, patch) {
  const current = existing ?? {};
  const next = patch ?? {};
  return {
    ...emptyPersonalizationProfile(),
    ...current,
    ...next,
    selfCareGoals: mergeStringArray(current.selfCareGoals, next.selfCareGoals),
    selfCareDifficultyReasons: mergeStringArray(current.selfCareDifficultyReasons, next.selfCareDifficultyReasons),
    planChangeReasons: mergeStringArray(current.planChangeReasons, next.planChangeReasons),
    difficultyAfterPlanChange: mergeStringArray(current.difficultyAfterPlanChange, next.difficultyAfterPlanChange),
    preferredActivities: mergeStringArray(current.preferredActivities, next.preferredActivities),
    preferredAtmospheres: mergeStringArray(current.preferredAtmospheres, next.preferredAtmospheres),
    avoidAtmospheres: mergeStringArray(current.avoidAtmospheres, next.avoidAtmospheres)
  };
}

export function profileForResponse(profile) {
  return {
    ...emptyPersonalizationProfile(),
    ...(profile ?? {}),
    selfCareGoals: [...(profile?.selfCareGoals ?? [])],
    selfCareDifficultyReasons: [...(profile?.selfCareDifficultyReasons ?? [])],
    planChangeReasons: [...(profile?.planChangeReasons ?? [])],
    difficultyAfterPlanChange: [...(profile?.difficultyAfterPlanChange ?? [])],
    preferredActivities: [...(profile?.preferredActivities ?? [])],
    preferredAtmospheres: [...(profile?.preferredAtmospheres ?? [])],
    avoidAtmospheres: [...(profile?.avoidAtmospheres ?? [])]
  };
}

export function missingRequiredSlots(profile, legacyProfile = null) {
  const current = profileForResponse(profile);
  const missing = [];
  if (!current.selfCareGoals.length) missing.push('selfCareGoals');
  if (!current.selfCareDifficultyReasons.length
    && !current.planChangeReasons.length
    && !current.difficultyAfterPlanChange.length) {
    missing.push('selfCareDifficultyReasons');
  }
  if (!current.availableFallbackMinutes) missing.push('availableFallbackMinutes');
  if (!current.preferredActivities.length && !current.preferredAtmospheres.length) {
    missing.push('preferredActivities_or_preferredAtmospheres');
  }
  return missing;
}

function mergeStringArray(existing, patch) {
  return [...new Set([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(patch) ? patch : [])])];
}

export function canCompleteProfile(profile, legacyProfile = null) {
  return missingRequiredSlots(profile, legacyProfile).length === 0;
}

function normalizeStringArray(value, field) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', `${field}는 최대 20개의 문자열 배열이어야 합니다.`);
  }
  return [...new Set(value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.length > 100) {
      throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', `${field}의 값이 올바르지 않습니다.`);
    }
    return item.trim();
  }))];
}

function normalizeMinutes(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object') {
    throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', 'availableFallbackMinutes가 올바르지 않습니다.');
  }
  const min = integer(value.min, 'availableFallbackMinutes.min');
  const max = integer(value.max, 'availableFallbackMinutes.max');
  if (min > max) throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', 'fallback 시간 범위가 올바르지 않습니다.');
  return { min, max };
}

function normalizeEnum(value, allowed, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const normalized = String(value).toUpperCase();
  if (!allowed.has(normalized)) throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', `${field} 값이 올바르지 않습니다.`);
  return normalized;
}

function integer(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1440) {
    throw new ApiError(422, 'INVALID_AI_PROFILE_PATCH', `${field}가 올바르지 않습니다.`);
  }
  return number;
}
