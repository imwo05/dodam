import { ApiError } from './errors.js';

const MBTI_TYPES = new Set([
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP'
]);

export function assertRequiredString(value, field, options = {}) {
  if (typeof value !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 문자열이어야 합니다.`);
  }

  const trimmed = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 ${min}~${max}자여야 합니다.`);
  }

  return trimmed;
}

export function assertEmail(value) {
  const email = assertRequiredString(value, 'email', { min: 5, max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'email 형식이 올바르지 않습니다.');
  }
  return email;
}

export function assertPassword(value) {
  const password = assertRequiredString(value, 'password', { min: 8, max: 100 });
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'password는 영문과 숫자를 포함해야 합니다.');
  }
  return password;
}

export function assertUsername(value) {
  const username = assertRequiredString(value, 'username', { min: 3, max: 20 });
  if (!/^[A-Za-z0-9_]+$/.test(username)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'username은 영문/숫자/밑줄만 사용할 수 있습니다.');
  }
  return username;
}

export function assertAge(value) {
  const age = Number(value);
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'age는 1~120 사이의 정수여야 합니다.');
  }
  return age;
}

export function normalizeProfilePatch(body) {
  const patch = {};

  if (body.nickname !== undefined) {
    patch.nickname = assertRequiredString(body.nickname, 'nickname', { min: 2, max: 20 });
  }

  if (body.age !== undefined) {
    if (!Number.isInteger(body.age) || body.age < 1 || body.age > 120) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'age는 1~120 사이의 정수여야 합니다.');
    }
    patch.age = body.age;
  }

  if (body.mbti !== undefined) {
    const mbti = assertRequiredString(body.mbti, 'mbti', { min: 4, max: 4 }).toUpperCase();
    if (!MBTI_TYPES.has(mbti)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'mbti 값이 올바르지 않습니다.');
    }
    patch.mbti = mbti;
  }

  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.length > 10) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'interests는 최대 10개의 문자열 배열이어야 합니다.');
    }

    patch.interests = body.interests.map((interest) =>
      assertRequiredString(interest, 'interests[]', { min: 1, max: 20 })
    );
  }

  if (body.profileImageUrl !== undefined) {
    patch.profileImageUrl =
      body.profileImageUrl === null
        ? null
        : assertRequiredString(body.profileImageUrl, 'profileImageUrl', { min: 1, max: 2048 });
  }

  if (body.region !== undefined) {
    patch.region = assertRequiredString(body.region, 'region', { min: 1, max: 100 });
  }

  if (body.goal !== undefined) {
    patch.goal =
      body.goal === null ? null : assertRequiredString(body.goal, 'goal', { min: 1, max: 200 });
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', '수정할 프로필 값이 필요합니다.');
  }

  return patch;
}
