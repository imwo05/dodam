import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { retrieveCandidates } from '../src/modules/plan-b/candidate-retriever.js';
import { createDistanceProvider } from '../src/modules/plan-b/distance-provider.js';
import { createRouteProvider } from '../src/modules/plan-b/route-provider.js';

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
