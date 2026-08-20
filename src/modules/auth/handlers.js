import { ApiError } from '../../lib/errors.js';
import { hashPassword, verifyPassword, createTokenId } from '../../lib/security.js';
import {
  assertAge,
  assertEmail,
  assertPassword,
  assertRequiredString,
  assertUsername
} from '../../lib/validation.js';
import { requireAuth } from './service.js';

export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    age: user.age,
    profileImageUrl: user.profileImageUrl,
    aiStyle: user.aiStyle === 'T' ? 'T' : 'F',
    onboardingCompleted: user.onboardingCompleted
  };
}

export async function signup({ body, store, auth }) {
  const name = assertRequiredString(body.name, 'name', { min: 1, max: 30 });
  const username = assertUsername(body.username);
  const password = assertPassword(body.password);
  const email = assertEmail(body.email);
  const age = body.age === undefined || body.age === null ? null : assertAge(body.age);

  if (store.isUsernameTaken(username)) {
    throw new ApiError(409, 'DUPLICATED_USERNAME', '이미 사용 중인 아이디입니다.');
  }
  if (store.isEmailTaken(email)) {
    throw new ApiError(409, 'DUPLICATED_EMAIL', '이미 가입된 이메일입니다.');
  }

  const user = store.createUser({ name, username, email, age, passwordHash: hashPassword(password) });
  const { accessToken } = auth.issueTokenPair(user.id);

  return {
    status: 201,
    data: { user: serializeUser(user), accessToken }
  };
}

export async function login({ body, store, auth }) {
  const username = assertRequiredString(body.username, 'username', { min: 1, max: 30 });
  const password = assertRequiredString(body.password, 'password', { min: 1, max: 100 });
  const user = store.findUserByUsername(username);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  const { accessToken } = auth.issueTokenPair(user.id);

  return {
    data: {
      accessToken,
      user: { id: user.id, username: user.username },
      onboardingCompleted: user.onboardingCompleted
    }
  };
}

export async function logout(context) {
  const user = requireAuth(context);
  context.auth.revokeUserRefreshTokens(user.id);
  return { status: 204 };
}

export async function usernameRecovery({ body, store }) {
  const email = assertEmail(body.email);
  const user = store.findUserByEmail(email);
  // 보안상 존재 여부를 노출하지 않되, 데모 편의로 마스킹된 아이디 반환
  const maskedUsername = user ? maskUsername(user.username) : null;
  return { data: { maskedUsername } };
}

export async function passwordResetRequest({ body, store }) {
  const username = assertRequiredString(body.username, 'username', { min: 1, max: 30 });
  const email = assertEmail(body.email);
  const user = store.findUserByUsername(username);

  let token = null;
  if (user && user.email.toLowerCase() === email) {
    token = createTokenId();
    store.createPasswordResetToken(user.id, token, Date.now() + 1000 * 60 * 30);
  }
  // 데모: 실제로는 이메일 발송. 여기선 토큰을 바로 반환.
  return { data: { requested: true, resetToken: token }, message: '비밀번호 재설정 안내를 보냈습니다.' };
}

export async function passwordResetConfirm({ body, store }) {
  const token = assertRequiredString(body.token, 'token', { min: 1 });
  const newPassword = assertPassword(body.newPassword);
  const record = store.consumePasswordResetToken(token);

  if (!record || record.expiresAt < Date.now()) {
    throw new ApiError(400, 'INVALID_RESET_TOKEN', '유효하지 않거나 만료된 토큰입니다.');
  }

  store.updateUser(record.userId, { passwordHash: hashPassword(newPassword) });
  return { data: { reset: true }, message: '비밀번호가 변경되었습니다.' };
}

function maskUsername(username) {
  if (username.length <= 2) return `${username[0] ?? ''}*`;
  return `${username.slice(0, 2)}${'*'.repeat(Math.max(1, username.length - 2))}`;
}
