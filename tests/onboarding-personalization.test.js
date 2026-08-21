import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { retrieveCandidates } from '../src/modules/plan-b/candidate-retriever.js';
import { createDistanceProvider } from '../src/modules/plan-b/distance-provider.js';
import { createRouteProvider } from '../src/modules/plan-b/route-provider.js';
import { fallbackOnboardingTurn } from '../ai-service/onboarding.js';

async function withServer(aiClient, fn) {
  const server = createApp({ aiClient, jwtSecret: 'test-secret' });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    return await fn('http://127.0.0.1:' + address.port + '/api/v1');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  const body = await response.json();
  return { status: response.status, body };
}

function data(response) {
  return response.body.data;
}

async function createUser(base) {
  const suffix = Math.random().toString(36).slice(2, 14);
  const response = await request(base, '/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test User',
      username: 'test_' + suffix,
      email: 'test_' + suffix + '@example.com',
      password: 'Password123!',
      age: 30
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return { token: data(response).accessToken, user: data(response).user };
}

function auth(token) {
  return { Authorization: 'Bearer ' + token };
}

function profilePatch(overrides = {}) {
  return {
    selfCareGoals: ['STRESS_RELIEF'],
    selfCareDifficultyReasons: ['FATIGUE'],
    planChangeReasons: ['OVERTIME'],
    difficultyAfterPlanChange: ['GIVE_UP_ACTIVITY'],
    availableFallbackMinutes: { min: 20, max: 30 },
    preferredActivities: ['WALK'],
    preferredAtmospheres: ['QUIET'],
    avoidAtmospheres: ['CROWDED'],
    preferredIntensity: 'LOW',
    socialPreference: 'SOLO',
    aiStyle: 'T',
    ...overrides
  };
}

function validPlan(candidateId) {
  return {
    reframedGoal: { originalGoal: 'goal', newGoal: 'small goal', reason: 'reason' },
    selectedExperienceIds: [candidateId],
    courseConcept: 'simple course',
    summary: 'summary',
    stopReasons: [{ placeId: candidateId, reason: 'fits' }],
    damiState: 'WALKING'
  };
}

test('one answer can fill multiple onboarding slots and later turns receive history', async () => {
  const seen = [];
  const aiClient = {
    async onboardingTurn(payload) {
      seen.push(payload.messages);
      return {
        assistantMessage: '다음으로 가능한 시간을 알려주세요.',
        extractedProfilePatch: profilePatch(),
        missingSlots: [],
        completed: false
      };
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '야근하면 피곤해서 운동을 포기해요.' })
    });
    await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '20분 정도 조용한 곳에서 혼자 하고 싶어요.' })
    });
    assert.ok(seen.some((messages) => messages.length >= 3));
  });
});

test('filled slots are removed from missingSlots and profile patches merge', async () => {
  const aiClient = {
    async onboardingTurn() {
      return {
        assistantMessage: '좋아요.',
        extractedProfilePatch: { selfCareGoals: ['WALK'] },
        missingSlots: ['selfCareGoals', 'availableFallbackMinutes'],
        completed: false
      };
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    await request(base, '/users/me/self-care-profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        purpose: '기분 전환',
        weeklyTargetCount: 3,
        availableMinutes: 60,
        residentialRegion: '서울',
        planChangeReasons: ['BUSY'],
        aiStyle: 'T'
      })
    });
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    const response = await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '산책을 하고 싶어요.' })
    });
    assert.equal(data(response).profile.purpose, '기분 전환');
    assert.equal(data(response).profile.aiStyle, 'T');
    assert.ok(!data(response).missingSlots.includes('selfCareGoals'));
  });
});

test('invalid structured onboarding output is not applied to the profile', async () => {
  const aiClient = {
    async onboardingTurn() {
      return {
        assistantMessage: 'invalid',
        extractedProfilePatch: { preferredIntensity: 'UNSAFE' },
        missingSlots: [],
        completed: false
      };
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    const response = await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '알 수 없는 응답' })
    });
    assert.equal(response.status, 200);
    assert.equal(data(response).aiFallback, true);
    assert.equal(data(response).profile.preferredIntensity, null);
  });
});

test('AI outage continues onboarding with contextual fallback and preserves profile extraction', async () => {
  const aiClient = {
    async onboardingTurn() {
      return null;
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    const initialAssistant = data(conversation).assistantMessage.content;
    assert.match(initialAssistant, /일정이 바뀌어도 실제로 할 수 있는 자기관리 방법/);
    assert.doesNotMatch(initialAssistant, /잠시 후 다시|안전하게 저장/);

    const first = await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '야근하면 운동을 포기해요.' })
    });
    assert.equal(first.status, 200);
    const firstData = data(first);
    assert.equal(firstData.aiFallback, true);
    assert.equal(firstData.canComplete, false);
    assert.deepEqual(firstData.profile.selfCareGoals, ['EXERCISE']);
    assert.deepEqual(firstData.profile.planChangeReasons, ['OVERTIME']);
    assert.deepEqual(firstData.profile.difficultyAfterPlanChange, ['GIVE_UP_ACTIVITY']);
    assert.doesNotMatch(firstData.assistantMessage.content, /잠시 후 다시|안전하게 저장/);

    const second = await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '20~30분 정도면 괜찮아요.' })
    });
    assert.equal(second.status, 200);
    const secondData = data(second);
    assert.equal(secondData.aiFallback, true);
    assert.deepEqual(secondData.profile.availableFallbackMinutes, { min: 20, max: 30 });
    assert.equal(secondData.canComplete, true);
    assert.notEqual(firstData.assistantMessage.content, secondData.assistantMessage.content);
    assert.doesNotMatch(secondData.assistantMessage.content, /잠시 후 다시|안전하게 저장/);
  });
});

test('four-answer Korean flow accumulates profile, completes, and keeps one assistant message per turn', async () => {
  const aiClient = {
    async onboardingTurn(payload) {
      return fallbackOnboardingTurn(payload);
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    const answers = [
      '스트레스를 덜 받고 싶어요.',
      '계획이 틀어지면 그냥 다 포기하게 돼.',
      '30분 정도.',
      '차 한 잔 하면서 책 읽고 음악 들으면 힐링돼.'
    ];
    let lastResponse = conversation;
    for (const content of answers) {
      lastResponse = await request(base, '/onboarding/conversations/' + id + '/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content })
      });
      assert.equal(lastResponse.status, 200);
    }

    const result = data(lastResponse);
    assert.equal(result.canComplete, true);
    assert.deepEqual(result.missingSlots, []);
    assert.deepEqual(result.profile.selfCareGoals, ['STRESS_RELIEF']);
    assert.deepEqual(result.profile.difficultyAfterPlanChange, ['GIVE_UP_ACTIVITY']);
    assert.deepEqual(result.profile.availableFallbackMinutes, { min: 30, max: 30 });
    assert.deepEqual(result.profile.preferredActivities, ['TEA', 'READING', 'MUSIC']);
    assert.equal(result.profile.preferredIntensity, null);
    assert.equal(result.profile.socialPreference, null);
    assert.doesNotMatch(result.assistantMessage.content, /몇 분|시간은.*부담/);

    const history = await request(base, '/onboarding/conversations/' + id, { headers });
    const messages = data(history).messages;
    const assistantMessages = messages.filter((message) => message.role === 'ASSISTANT');
    assert.equal(assistantMessages.length, answers.length + 1);
    assert.equal(new Set(assistantMessages.map((message) => message.id)).size, assistantMessages.length);
  });
});

test('optional AI missing slots never block backend completion', async () => {
  const aiClient = {
    async onboardingTurn() {
      return {
        assistantMessage: '좋아요. 이제 준비됐어요.',
        extractedProfilePatch: profilePatch({
          selfCareDifficultyReasons: [],
          difficultyAfterPlanChange: [],
          preferredActivities: ['TEA'],
          preferredAtmospheres: [],
          avoidAtmospheres: [],
          preferredIntensity: null,
          socialPreference: null
        }),
        missingSlots: ['difficultyAfterPlanChange', 'avoidAtmospheres', 'preferredIntensity', 'socialPreference'],
        completed: false
      };
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    const conversation = await request(base, '/onboarding/conversations', {
      method: 'POST',
      headers,
      body: '{}'
    });
    const id = data(conversation).conversation.id;
    const response = await request(base, '/onboarding/conversations/' + id + '/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '준비됐어요.' })
    });
    assert.equal(response.status, 200);
    assert.equal(data(response).canComplete, true);
    assert.deepEqual(data(response).missingSlots, []);
  });
});

test('Plan B receives saved personalization and hard constraints remain authoritative', async () => {
  let planPayload = null;
  const aiClient = {
    async planBPlan(payload) {
      planPayload = payload;
      return validPlan(payload.candidates[0].id);
    }
  };
  await withServer(aiClient, async (base) => {
    const { token } = await createUser(base);
    const headers = auth(token);
    await request(base, '/users/me/self-care-profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        purpose: '회복',
        weeklyTargetCount: 3,
        availableMinutes: 60,
        residentialRegion: '서울',
        planChangeReasons: ['OVERTIME'],
        ...profilePatch()
      })
    });
    const response = await request(base, '/plan-b/recommendations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        date: '2026-08-20',
        startTime: '09:00',
        endTime: '10:00',
        condition: 'TIRED',
        continuityMode: 'EASY',
        location: { latitude: 37.5696, longitude: 126.9784 }
      })
    });
    assert.equal(response.status, 201);
    assert.equal(planPayload.context.personalization.preferredAtmospheres[0], 'QUIET');
    assert.equal(planPayload.context.personalization.aiStyle, 'T');
  });

  const store = createStore();
  store.createPlace({
    creatorId: 'usr_900',
    name: 'Quiet short',
    address: '서울',
    primaryCategory: 'WALK',
    activityType: 'WALK',
    durationMinutes: 15,
    description: 'short',
    tags: ['QUIET'],
    latitude: 37.5696,
    longitude: 126.9784
  });
  store.createPlace({
    creatorId: 'usr_900',
    name: 'Crowded long',
    address: '서울',
    primaryCategory: 'WALK',
    activityType: 'WALK',
    durationMinutes: 100,
    description: 'long',
    tags: ['CROWDED'],
    latitude: 37.5696,
    longitude: 126.9784
  });
  const candidates = retrieveCandidates({
    store,
    planContext: {
      selfCareCategory: 'WALK',
      condition: 'NORMAL',
      continuityMode: 'AUTO',
      currentLocation: { latitude: 37.5696, longitude: 126.9784 },
      availableWindow: { usableMinutes: 40 },
      personalization: { preferredAtmospheres: ['QUIET'], avoidAtmospheres: ['CROWDED'] }
    },
    routeProvider: createRouteProvider(),
    distanceProvider: createDistanceProvider()
  });
  assert.equal(candidates[0].name, 'Quiet short');
  assert.ok(!candidates.some((candidate) => candidate.name === 'Crowded long'));
});

test('T/F changes wording only and does not change hard-eligible candidates', () => {
  const store = createStore();
  const base = {
    selfCareCategory: 'WALK',
    condition: 'NORMAL',
    continuityMode: 'AUTO',
    currentLocation: { latitude: 37.5696, longitude: 126.9784 },
    availableWindow: { usableMinutes: 40 }
  };
  const providers = {
    routeProvider: createRouteProvider(),
    distanceProvider: createDistanceProvider()
  };
  const t = retrieveCandidates({ store, planContext: { ...base, personalization: { aiStyle: 'T' } }, ...providers });
  const f = retrieveCandidates({ store, planContext: { ...base, personalization: { aiStyle: 'F' } }, ...providers });
  assert.deepEqual(t.map((candidate) => candidate.id), f.map((candidate) => candidate.id));
});
