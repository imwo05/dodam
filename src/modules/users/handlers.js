import { ApiError } from '../../lib/errors.js';
import { assertRequiredString, assertUsername } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';
import { serializeUser } from '../auth/handlers.js';

export async function getMe(context) {
  const user = requireAuth(context);
  return { data: serializeUser(user) };
}

export async function patchMe(context) {
  const user = requireAuth(context);
  const patch = {};

  if (context.body.username !== undefined) {
    const username = assertUsername(context.body.username);
    if (username.toLowerCase() !== user.username.toLowerCase() && context.store.isUsernameTaken(username)) {
      throw new ApiError(409, 'DUPLICATED_USERNAME', '이미 사용 중인 아이디입니다.');
    }
    patch.username = username;
  }
  if (context.body.name !== undefined) {
    patch.name = assertRequiredString(context.body.name, 'name', { min: 1, max: 30 });
  }
  if (context.body.profileImageUrl !== undefined) {
    patch.profileImageUrl =
      context.body.profileImageUrl === null
        ? null
        : assertRequiredString(context.body.profileImageUrl, 'profileImageUrl', { min: 1, max: 2048 });
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', '수정할 값이 필요합니다.');
  }

  const updated = context.store.updateUser(user.id, patch);
  return { data: serializeUser(updated), message: '프로필이 수정되었습니다.' };
}
