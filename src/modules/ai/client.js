// 통합 AI 클라이언트. ai-service 의 엔드포인트를 호출한다.
//  - analyzeConcern: POST {base}/analyze-concern
//  - planBPlan:      POST {base}/plan-b
//  - planBReasons:   POST {base}/plan-b-reasons (legacy compatibility)
// ai-service 가 없거나 실패하면 null 반환 → 호출부에서 로컬 폴백.
export function buildAiClient({ baseUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
  const base =
    baseUrl ||
    (process.env.AI_RECOMMENDATION_API_URL
      ? process.env.AI_RECOMMENDATION_API_URL.replace(/\/recommend\/?$/, '')
      : process.env.AI_BASE_URL || null);

  async function call(path, payload) {
    if (!base || typeof fetchImpl !== 'function') return null;
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    isConfigured() {
      return Boolean(base);
    },
    async analyzeConcern(content) {
      return call('/analyze-concern', { content });
    },
    async planBReasons(payload) {
      return call('/plan-b-reasons', payload);
    },
    async planBPlan(payload) {
      return call('/plan-b', payload);
    },
    async onboardingTurn(payload) {
      return call('/onboarding-turn', payload);
    }
  };
}
