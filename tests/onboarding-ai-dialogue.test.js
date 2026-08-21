import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackOnboardingTurn, onboardingTurn } from '../ai-service/onboarding.js';

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

test('fallback extracts multiple activities from one natural Korean answer', () => {
  const result = fallbackOnboardingTurn({
    context: { aiStyle: 'F' },
    profile: { selfCareGoals: ['STRESS_RELIEF'] },
    messages: [{ role: 'USER', content: '차 한 잔 하면서 책 읽고 음악 들으면 힐링돼.' }]
  });

  assert.deepEqual(result.extractedProfilePatch.preferredActivities, ['TEA', 'READING', 'MUSIC']);
});

test('six user answers cap AI questioning to the remaining required profile fields', async () => {
  const result = await withMockedOpenAI(
    async () => responseWithContent(JSON.stringify({
      assistantMessage: '선택 사항을 더 알려주세요.',
      extractedProfilePatch: {},
      missingSlots: ['avoidAtmospheres'],
      completed: false
    })),
    () => onboardingTurn({
      context: { aiStyle: 'T' },
      profile: { selfCareGoals: ['STRESS_RELIEF'] },
      messages: Array.from({ length: 6 }, (_, index) => [
        { role: 'ASSISTANT', content: `질문 ${index + 1}` },
        { role: 'USER', content: `답변 ${index + 1}` }
      ]).flat()
    })
  );

  assert.match(result.assistantMessage, /마지막으로/);
  assert.deepEqual(result.missingSlots, [
    'selfCareDifficultyReasons',
    'availableFallbackMinutes',
    'preferredActivities_or_preferredAtmospheres'
  ]);
  assert.equal(result.completed, false);
});
