// OpenAI REST wrapper (SDK-free; relies on Node 20+ global fetch).
// The key is read at call time so ai-service/env.js can load .env first.

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';

// The previous production value was 10 seconds. Fifteen seconds is a modest
// increase for transient demo/runtime latency while keeping each attempt well
// below the 20-second ceiling; one retry can still be made for transient errors.
export const OPENAI_TIMEOUT_MS = 15_000;

const OPENAI_ERROR_CODES = Object.freeze({
  HTTP: 'OPENAI_HTTP_ERROR',
  TIMEOUT: 'OPENAI_TIMEOUT',
  NETWORK: 'OPENAI_NETWORK_ERROR',
  PARSE: 'OPENAI_PARSE_ERROR',
  SCHEMA: 'OPENAI_SCHEMA_ERROR'
});

export { OPENAI_ERROR_CODES };

class OpenAIRequestError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'OpenAIRequestError';
    this.code = code;
    this.status = Number.isInteger(details.status) ? details.status : undefined;
    this.type = details.type;
    this.errorCode = details.errorCode;
  }
}

function key() {
  return process.env.OPENAI_API_KEY || '';
}

export function hasOpenAI() {
  return Boolean(key());
}

export async function embed(text) {
  const k = key();
  if (!k) return null;

  return requestWithRetry('embeddings', async () => {
    const data = await requestJson('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: createTimeoutSignal(),
      body: JSON.stringify({ model: EMBED_MODEL, input: text || 'no content' })
    });
    return data?.data?.[0]?.embedding ?? null;
  });
}

export async function chat(system, user, temperature = 0.5) {
  const k = key();
  if (!k) return null;

  return requestWithRetry('chat', async () => {
    const data = await requestJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: createTimeoutSignal(),
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  });
}

// `options.validate` is an internal hook used by onboarding and Plan B. It
// returns the existing sanitized value on success and records a schema error
// without changing the public null/fallback contract on failure.
export async function chatJson(system, user, schema, temperature = 0.4, options = {}) {
  const k = key();
  if (!k) return null;

  const operation = options.operation || 'chatJson';
  return requestWithRetry(operation, async () => {
    const data = await requestJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: createTimeoutSignal(),
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'plan_b_plan',
            strict: true,
            schema
          }
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new OpenAIRequestError(OPENAI_ERROR_CODES.PARSE);
    }

    let value;
    try {
      value = JSON.parse(content);
    } catch {
      throw new OpenAIRequestError(OPENAI_ERROR_CODES.PARSE);
    }

    // A response that parsed as JSON but fails the existing sanitizer is not
    // retried: it is an accepted model response, and regenerating it could
    // change onboarding/Plan B behavior without evidence that a retry helps.
    if (typeof options.validate === 'function') {
      let sanitized = null;
      try {
        sanitized = options.validate(value);
      } catch {
        sanitized = null;
      }
      if (sanitized == null) throw new OpenAIRequestError(OPENAI_ERROR_CODES.SCHEMA);
      return sanitized;
    }

    return value;
  });
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw classifyThrownError(error);
  }

  if (!response.ok) throw await httpError(response);

  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw new OpenAIRequestError(OPENAI_ERROR_CODES.TIMEOUT);
    throw new OpenAIRequestError(OPENAI_ERROR_CODES.PARSE);
  }
}

async function httpError(response) {
  const metadata = await safeHttpErrorMetadata(response);
  return new OpenAIRequestError(OPENAI_ERROR_CODES.HTTP, {
    status: response.status,
    type: metadata.type,
    errorCode: metadata.errorCode
  });
}

async function safeHttpErrorMetadata(response) {
  let body;
  try {
    if (typeof response.text === 'function') {
      body = JSON.parse(await response.text());
    } else if (typeof response.json === 'function') {
      body = await response.json();
    }
  } catch {
    return {};
  }

  const error = body?.error;
  return {
    type: safeErrorField(error?.type),
    errorCode: safeErrorField(error?.code)
  };
}

function requestWithRetry(operation, request) {
  return runFirstAttempt();

  async function runFirstAttempt() {
    try {
      return await request();
    } catch (cause) {
      const error = classifyThrownError(cause);
      if (!isRetryable(error)) {
        logFailure(operation, error, 1, false);
        return null;
      }

      logFailure(operation, error, 1, true);
      return runSecondAttempt();
    }
  }

  async function runSecondAttempt() {
    try {
      return await request();
    } catch (cause) {
      const error = classifyThrownError(cause);
      logFailure(operation, error, 2, false);
      return null;
    }
  }
}

function classifyThrownError(error) {
  if (error instanceof OpenAIRequestError) return error;
  if (isAbortError(error)) return new OpenAIRequestError(OPENAI_ERROR_CODES.TIMEOUT);
  return new OpenAIRequestError(OPENAI_ERROR_CODES.NETWORK);
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR';
}

function isRetryable(error) {
  return error.code === OPENAI_ERROR_CODES.TIMEOUT ||
    error.code === OPENAI_ERROR_CODES.NETWORK ||
    (error.code === OPENAI_ERROR_CODES.HTTP && (error.status === 429 || error.status >= 500));
}

function logFailure(operation, error, attempt, retrying) {
  const metadata = {
    operation,
    classification: error.code,
    attempt
  };
  if (Number.isInteger(error.status)) metadata.status = error.status;
  if (error.type) metadata.type = error.type;
  if (error.errorCode) metadata.errorCode = error.errorCode;
  if (retrying) metadata.retrying = true;
  console.warn('[ai-service] OpenAI request failure', metadata);
}

function safeErrorField(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  const currentKey = key();
  if (!normalized || (currentKey && normalized.includes(currentKey))) return undefined;
  return /^[A-Za-z0-9._-]{1,64}$/.test(normalized) ? normalized : undefined;
}

function createTimeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(OPENAI_TIMEOUT_MS);
  }
  return undefined;
}
