import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const key = scryptSync(password, salt, KEY_LENGTH).toString('base64url');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password, passwordHash) {
  const [algorithm, salt, storedKey] = String(passwordHash).split('$');
  if (algorithm !== 'scrypt' || !salt || !storedKey) return false;

  const derivedKey = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString('base64url'));
  const storedBuffer = Buffer.from(storedKey);

  if (derivedKey.length !== storedBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

export function signJwt(payload, secret, ttlSeconds, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeJson(header);
  const encodedBody = encodeJson(body);
  const signature = hmac(`${encodedHeader}.${encodedBody}`, secret);

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyJwt(token, secret, now = new Date()) {
  const parts = String(token).split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  const [encodedHeader, encodedBody, signature] = parts;
  const expectedSignature = hmac(`${encodedHeader}.${encodedBody}`, secret);

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8'));
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) {
    throw new Error('Expired token');
  }

  return payload;
}

export function createTokenId() {
  return randomUUID();
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function hmac(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
