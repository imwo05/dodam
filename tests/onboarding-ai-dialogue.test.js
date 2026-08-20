import assert from 'node:assert/strict';
import test from 'node:test';
import { onboardingTurn } from '../ai-service/onboarding.js';

function responseWithContent(content) {
  return {
    ok: true,
    async json() {
      return { choices: [{ message: { content } }] };
    }
  };
}

async function withMockedOpenAI(fetchImpl, fn) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousWarn = console.warn;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = fetchImpl;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
}

test('transient onboarding timeout retries once and returns the live response', async () => {
  let calls = 0;
  const result = await withMockedOpenAI(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    return responseWithContent(JSON.stringify({
      assistantMessage: '좋아요. 다음으로 가능한 시간을 알려주세요.',
      extractedProfilePatch: { selfCareGoals: ['EXERCISE'] },
      missingSlots: ['availableFallbackMinutes'],
      completed: false
    }));
  }, () => onboardingTurn({ context: { aiStyle: 'T' }, profile: {}, messages: [] }));

  assert.equal(calls, 2);
  assert.equal(result.fallback, false);
  assert.match(result.assistantMessage, /가능한 시간을/);
});

test('two consecutive OpenAI failures continue with different deterministic turns and preserve extraction', async () => {
  let calls = 0;
  const initial = await withMockedOpenAI(async () => {
    calls += 1;
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  }, () => onboardingTurn({ context: { aiStyle: 'F' }, profile: {}, messages: [] }));

  const first = await withMockedOpenAI(async () => {
    calls += 1;
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  }, () => onboardingTurn({
    context: { aiStyle: 'F' },
    profile: {},
    messages: [
      { role: 'ASSISTANT', content: initial.assistantMessage },
      { role: 'USER', content: '야근하면 운동을 포기해요.' }
    ]
  }));

  const second = await withMockedOpenAI(async () => {
    calls += 1;
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  }, () => onboardingTurn({
    context: { aiStyle: 'F' },
    profile: first.extractedProfilePatch,
    messages: [
      { role: 'ASSISTANT', content: initial.assistantMessage },
      { role: 'USER', content: '야근하면 운동을 포기해요.' },
      { role: 'ASSISTANT', content: first.assistantMessage },
      { role: 'USER', content: '20~30분 정도면 괜찮아요.' }
    ]
  }));

  assert.equal(calls, 6);
  assert.notEqual(first.assistantMessage, second.assistantMessage);
  assert.ok(!first.assistantMessage.includes('잠시 후 다시'));
  assert.ok(!second.assistantMessage.includes('잠시 후 다시'));
  assert.deepEqual(second.extractedProfilePatch.availableFallbackMinutes, { min: 20, max: 30 });
  assert.equal(second.completed, true);
});
