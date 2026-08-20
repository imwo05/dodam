import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';

function planPlaces(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `regen_${index + 1}`,
    name: `Regeneration ${index + 1}`,
    activityType: 'WALK',
    primaryCategory: 'WALK',
    latitude: 37.5 + index / 1000,
    longitude: 127 + index / 1000,
    durationMinutes: 10,
    status: 'ACTIVE'
  }));
}

function repositoriesFor(places) {
  return {
    adapterName: 'test',
    profile: { async getSelfCareProfile() { return null; } },
    place: {
      async list() { return places; },
      async getById(id) { return places.find((place) => place.id === id) ?? null; }
    }
  };
}

async function withServer({ places = planPlaces(), aiClient }, fn) {
  const server = createApp({
    store: createStore(),
    repositories: repositoriesFor(places),
    aiClient,
    jwtSecret: 'planb-regeneration-test'
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

function data(response) {
  return response.body.data;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createUser(base) {
  const suffix = `regen_${Math.random().toString(36).slice(2, 10)}`;
  const response = await request(base, '/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Regeneration test',
      username: suffix,
      email: `${suffix}@example.com`,
      password: 'Password123!',
      age: 30
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return data(response);
}

function recommendationInput() {
  return {
    date: '2026-09-15',
    startTime: '13:00',
    endTime: '14:00',
    selfCareCategory: 'WALK',
    condition: 'NORMAL',
    continuityMode: 'AUTO',
    location: null
  };
}

function placeIds(response) {
  return data(response).course.stops.map((stop) => stop.place.id);
}

test('regenerate excludes current Place IDs before sending candidates to AI and replaces the course', async () => {
  const aiPayloads = [];
  const aiClient = {
    async planBPlan(payload) {
      aiPayloads.push(payload);
      return { selectedExperienceIds: [payload.candidates[0].id] };
    }
  };

  await withServer({ aiClient }, async (base) => {
    const user = await createUser(base);
    const first = await request(base, '/plan-b/recommendations', {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify(recommendationInput())
    });
    assert.equal(first.status, 201, JSON.stringify(first));
    const firstPlaceIds = placeIds(first);

    const regenerated = await request(base, `/plan-b/${data(first).sessionId}/regenerate`, {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify({ excludePlaceIds: firstPlaceIds })
    });
    assert.equal(regenerated.status, 200, JSON.stringify(regenerated));
    const regeneratedPlaceIds = placeIds(regenerated);

    assert.deepEqual(aiPayloads[1].candidates.map((candidate) => candidate.id).filter((id) => firstPlaceIds.includes(id)), []);
    assert.equal(regeneratedPlaceIds.some((id) => firstPlaceIds.includes(id)), false);
    assert.notDeepEqual(regeneratedPlaceIds, firstPlaceIds);
  });
});

test('deterministic fallback cannot reselect excluded Place IDs', async () => {
  const aiClient = { async planBPlan() { throw new Error('AI unavailable'); } };
  await withServer({ aiClient }, async (base) => {
    const user = await createUser(base);
    const first = await request(base, '/plan-b/recommendations', {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify(recommendationInput())
    });
    assert.equal(first.status, 201, JSON.stringify(first));
    const firstPlaceIds = placeIds(first);

    const regenerated = await request(base, `/plan-b/${data(first).sessionId}/regenerate`, {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify({ excludePlaceIds: firstPlaceIds })
    });
    assert.equal(regenerated.status, 200, JSON.stringify(regenerated));
    assert.equal(placeIds(regenerated).some((id) => firstPlaceIds.includes(id)), false);
  });
});

test('regenerate reports candidate exhaustion instead of silently reusing the prior course', async () => {
  const aiClient = {
    async planBPlan(payload) {
      return { selectedExperienceIds: [payload.candidates[0].id] };
    }
  };
  await withServer({ places: planPlaces(1), aiClient }, async (base) => {
    const user = await createUser(base);
    const first = await request(base, '/plan-b/recommendations', {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify(recommendationInput())
    });
    assert.equal(first.status, 201, JSON.stringify(first));

    const exhausted = await request(base, `/plan-b/${data(first).sessionId}/regenerate`, {
      method: 'POST',
      headers: auth(user.accessToken),
      body: JSON.stringify({ excludePlaceIds: placeIds(first) })
    });
    assert.equal(exhausted.status, 409, JSON.stringify(exhausted));
    assert.equal(exhausted.body.error.code, 'NO_UNSEEN_CANDIDATE_EXPERIENCE');
    assert.equal(exhausted.body.error.details.reason, 'EXCLUDED_CANDIDATES_EXHAUSTED');
  });
});
