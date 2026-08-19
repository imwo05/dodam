import { ApiError } from '../../lib/errors.js';
import { createTokenId, signJwt, verifyJwt } from '../../lib/security.js';

export function buildAuthService({
  store,
  jwtSecret,
  accessTokenTtlSeconds,
  refreshTokenTtlSeconds,
  now = () => new Date()
}) {
  function issueTokenPair(userId) {
    const issuedAt = now();
    const refreshTokenId = createTokenId();
    const accessToken = signJwt(
      { sub: userId, type: 'access' },
      jwtSecret,
      accessTokenTtlSeconds,
      issuedAt
    );
    const refreshToken = signJwt(
      { sub: userId, type: 'refresh', jti: refreshTokenId },
      jwtSecret,
      refreshTokenTtlSeconds,
      issuedAt
    );

    store.addRefreshToken({
      jti: refreshTokenId,
      userId,
      expiresAt: new Date(issuedAt.getTime() + refreshTokenTtlSeconds * 1000).toISOString(),
      revokedAt: null,
      createdAt: issuedAt.toISOString()
    });

    return { accessToken, refreshToken };
  }

  function verifyAccessToken(token) {
    try {
      const payload = verifyJwt(token, jwtSecret, now());
      if (payload.type !== 'access') {
        throw new Error('Not an access token');
      }

      const user = store.findUserById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', '인증이 필요합니다.');
    }
  }

  function rotateRefreshToken(refreshToken) {
    let payload;
    try {
      payload = verifyJwt(refreshToken, jwtSecret, now());
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'refreshToken이 유효하지 않습니다.');
    }

    if (payload.type !== 'refresh' || !payload.jti) {
      throw new ApiError(401, 'UNAUTHORIZED', 'refreshToken이 유효하지 않습니다.');
    }

    const tokenRecord = store.findRefreshToken(payload.jti);
    if (!tokenRecord || tokenRecord.revokedAt || new Date(tokenRecord.expiresAt) < now()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'refreshToken이 유효하지 않습니다.');
    }

    const user = store.findUserById(payload.sub);
    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'refreshToken이 유효하지 않습니다.');
    }

    store.revokeRefreshToken(payload.jti);
    return issueTokenPair(user.id);
  }

  return {
    issueTokenPair,
    verifyAccessToken,
    rotateRefreshToken,
    revokeUserRefreshTokens: store.revokeRefreshTokensForUser
  };
}

export function requireAuth(context) {
  const header = context.req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'UNAUTHORIZED', '인증이 필요합니다.');
  }

  return context.auth.verifyAccessToken(token);
}

// 토큰 있으면 유저 반환, 없거나 잘못됐으면 null (공개 엔드포인트용)
export function optionalAuth(context) {
  const header = context.req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return context.auth.verifyAccessToken(token);
  } catch {
    return null;
  }
}
