// OpenAI REST 래퍼 (SDK 없이 fetch로 직접 호출 → 의존성 0)
// Node 20+ 의 global fetch 사용.
// ⚠️ 키는 "호출 시점"에 process.env 에서 읽는다 (loadEnv 이후 보장).

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';

function key() {
  return process.env.OPENAI_API_KEY || '';
}

export function hasOpenAI() {
  return Boolean(key());
}

export async function embed(text) {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
      body: JSON.stringify({ model: EMBED_MODEL, input: text || 'no content' })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function chat(system, user, temperature = 0.5) {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function chatJson(system, user, schema, temperature = 0.4) {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
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
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
  } catch {
    return null;
  }
}
