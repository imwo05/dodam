import { ApiError, isApiError } from './errors.js';

const MAX_BODY_BYTES = 1024 * 1024;

export async function parseJsonBody(req) {
  if (!['POST', 'PATCH', 'PUT'].includes(req.method)) {
    return {};
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '요청 본문이 너무 큽니다.');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'JSON 형식이 올바르지 않습니다.');
  }
}

export function sendSuccess(res, status, data, message = null) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: true, data, message }));
}

export function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

export function sendError(res, error) {
  const apiError = isApiError(error)
    ? error
    : new ApiError(500, 'INTERNAL_SERVER_ERROR', '서버 오류가 발생했습니다.');

  if (!isApiError(error)) {
    console.error(error);
  }

  res.writeHead(apiError.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message
      }
    })
  );
}
