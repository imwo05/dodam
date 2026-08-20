import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';
import { analyzeConcern } from './concern.js';
import { normalizePersonalizationPatch } from '../onboarding/profile.js';

const CATEGORIES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);

function validateProfile(body, { partial = false } = {}) {
  const out = {};
  const need = (field) => !partial || body[field] !== undefined;

  if (need('purpose')) out.purpose = assertRequiredString(body.purpose, 'purpose', { min: 1, max: 300 });
  if (need('weeklyTargetCount')) out.weeklyTargetCount = assertPositiveInt(body.weeklyTargetCount, 'weeklyTargetCount', 21);
  if (need('availableMinutes')) out.availableMinutes = assertPositiveInt(body.availableMinutes, 'availableMinutes', 1440);
  if (need('residentialRegion')) out.residentialRegion = assertRequiredString(body.residentialRegion, 'residentialRegion', { min: 1, max: 50 });
  if (body.lifeRegion !== undefined) out.lifeRegion = body.lifeRegion === null ? null : assertRequiredString(body.lifeRegion, 'lifeRegion', { min: 1, max: 50 });
  if (body.aiStyle !== undefined) {
    const style = String(body.aiStyle).toUpperCase();
    if (!['T', 'F'].includes(style)) throw new ApiError(422, 'VALIDATION_ERROR', 'aiStyle은 T 또는 F여야 합니다.');
    out.aiStyle = style;
  }
  if (need('planChangeReasons')) {
    if (!Array.isArray(body.planChangeReasons)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'planChangeReasons는 배열이어야 합니다.');
    }
    out.planChangeReasons = body.planChangeReasons.map((r) => assertRequiredString(r, 'planChangeReasons[]', { min: 1, max: 50 }));
  }
  Object.assign(out, normalizePersonalizationPatch(body));
  return out;
}

export async function putSelfCareProfile(context) {
  const user = requireAuth(context);
  const profile = validateProfile(context.body);
  const saved = context.store.setSelfCareProfile(user.id, profile);
  return { data: saved, message: '자기관리 프로필이 저장되었습니다.' };
}

export async function getSelfCareProfile(context) {
  const user = requireAuth(context);
  const profile = context.store.getSelfCareProfile(user.id);
  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', '자기관리 프로필이 없습니다.');
  return { data: profile };
}

export async function patchSelfCareProfile(context) {
  const user = requireAuth(context);
  const existing = context.store.getSelfCareProfile(user.id);
  if (!existing) throw new ApiError(404, 'PROFILE_NOT_FOUND', '자기관리 프로필이 없습니다.');
  const patch = validateProfile(context.body, { partial: true });
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', '수정할 값이 필요합니다.');
  }
  const saved = context.store.setSelfCareProfile(user.id, patch);
  return { data: saved, message: '자기관리 프로필이 수정되었습니다.' };
}

export async function postConcern(context) {
  const user = requireAuth(context);
  const content = assertRequiredString(context.body.content, 'content', { min: 1, max: 1000 });

  const analysis = await analyzeConcern(content, context.aiClient);
  context.store.setConcern(user.id, { content, analysis });

  return { data: { content, analysis } };
}

function assertPositiveInt(value, field, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > max) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 1~${max} 사이의 정수여야 합니다.`);
  }
  return n;
}

export { CATEGORIES };
