import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { retrieveCandidates } from '../src/modules/plan-b/candidate-retriever.js';
import { normalizePlanBLocation } from '../src/modules/plan-b/location.js';
import { createDistanceProvider } from '../src/modules/plan-b/distance-provider.js';
import { createRouteProvider } from '../src/modules/plan-b/route-provider.js';

function providers() {
  return {
    routeProvider: createRouteProvider(),
    distanceProvider: createDistanceProvider()
  };
}

function planContext(currentLocation, overrides = {}) {
  return {
    selfCareCategory: 'WALK',
    condition: 'NORMAL',
    continuityMode: 'AUTO',
    currentLocation,
    availableWindow: { usableMinutes: 40 },
    personalization: {},
    ...overrides
  };
}

function testPlaces() {
  return [
    {
      id: 'near', name: 'Near walk', activityType: 'WALK', primaryCategory: 'WALK',
      latitude: 37.5, longitude: 127.0, durationMinutes: 15, status: 'ACTIVE'
    },
    {
      id: 'far', name: 'Far walk', activityType: 'WALK', primaryCategory: 'WALK',
      latitude: 38.5, longitude: 128.0, durationMinutes: 15, status: 'ACTIVE'
    }
  ];
}

async function retrieveWithLocation(location, places = testPlaces(), overrides = {}) {
  return retrieveCandidates({
    store: createStore(),
    placeRepository: { async list() { return places; } },
    planContext: planContext(location, overrides),
    ...providers()
  });
}

async function withServer(fn, options = {}) {
  const server = createApp({ jwtSecret: 'planb-null-location-test', ...options });
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
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json()
  };
}

function data(response) {
  return response.body?.data;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createUser(base) {
  const suffix = `pb_loc_${Math.random().toString(36).slice(2, 10)}`;
  const response = await request(base, '/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Plan B location test',
      username: suffix,
      email: `${suffix}@example.com`,
      password: 'Password123!',
      age: 30
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return data(response);
}

function recommendationInput(location) {
  const input = {
    date: '2026-09-15',
    startTime: '13:00',
    endTime: '15:00',
    selfCareCategory: 'CUSTOM',
    customCategory: '가볍게 쉬기',
    condition: 'NORMAL',
    continuityMode: 'AUTO'
  };
  if (location !== undefined) input.location = location;
  return input;
}

test('Plan B location normalization accepts only finite numeric coordinate pairs', () => {
  for (const location of [
    null,
    undefined,
    '',
    { latitude: null, longitude: null },
    { latitude: 37.5, longitude: null },
    { latitude: null, longitude: 127.0 },
    { latitude: Number.NaN, longitude: 127.0 },
    { latitude: Number.POSITIVE_INFINITY, longitude: 127.0 }
  ]) {
    assert.equal(normalizePlanBLocation(location), null, JSON.stringify(location));
  }

  assert.deepEqual(normalizePlanBLocation({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
  assert.deepEqual(normalizePlanBLocation({ latitude: 37.5, longitude: 127.0 }), { latitude: 37.5, longitude: 127.0 });
});

test('candidate retrieval skips location filters when geolocation is unavailable', async () => {
  for (const location of [null, undefined, { latitude: null, longitude: null }, { latitude: 37.5, longitude: null }, { latitude: null, longitude: 127.0 }]) {
    const candidates = await retrieveWithLocation(location);
    assert.deepEqual(new Set(candidates.map((candidate) => candidate.id)), new Set(['near', 'far']));
    assert.ok(candidates.every((candidate) => Number.isFinite(candidate.travelFromCurrentMinutes)));
    assert.ok(candidates.every((candidate) => Number.isFinite(candidate.requiredMinutes)));
  }
});

test('candidate retrieval does not call location providers without geolocation', async () => {
  const candidates = await retrieveCandidates({
    store: createStore(),
    placeRepository: { async list() { return testPlaces(); } },
    planContext: planContext({ latitude: null, longitude: null }),
    routeProvider: { getTravelTime() { throw new Error('route provider should be skipped'); } },
    distanceProvider: {
      getDistanceKm() { throw new Error('distance provider should be skipped'); },
      isWithinRadius() { throw new Error('radius provider should be skipped'); }
    }
  });
  assert.equal(candidates.length, 2);
});

test('valid zero and Seoul coordinates preserve radius and travel filtering', async () => {
  const zeroPlaces = [
    { id: 'zero_near', name: 'Zero near', activityType: 'WALK', primaryCategory: 'WALK', latitude: 0, longitude: 0, durationMinutes: 15, status: 'ACTIVE' },
    { id: 'zero_far', name: 'Zero far', activityType: 'WALK', primaryCategory: 'WALK', latitude: 1, longitude: 1, durationMinutes: 15, status: 'ACTIVE' }
  ];
  const zeroCandidates = await retrieveWithLocation({ latitude: 0, longitude: 0 }, zeroPlaces);
  assert.deepEqual(zeroCandidates.map((candidate) => candidate.id), ['zero_near']);
  assert.equal(zeroCandidates[0].travelFromCurrentMinutes, 0);

  const seoulCandidates = await retrieveWithLocation({ latitude: 37.5, longitude: 127.0 });
  assert.deepEqual(seoulCandidates.map((candidate) => candidate.id), ['near']);
  assert.ok(seoulCandidates[0].travelFromCurrentMinutes >= 0);
});

test('non-location hard constraints still apply without geolocation', async () => {
  const places = [
    { id: 'valid', name: 'Valid walk', activityType: 'WALK', primaryCategory: 'WALK', latitude: 37.5, longitude: 127.0, durationMinutes: 15, intensity: 'LOW', status: 'ACTIVE' },
    { id: 'inactive', name: 'Inactive walk', activityType: 'WALK', primaryCategory: 'WALK', latitude: 37.5, longitude: 127.0, durationMinutes: 15, status: 'INACTIVE' },
    { id: 'wrong_category', name: 'Diet place', activityType: 'DIET', primaryCategory: 'DIET', latitude: 37.5, longitude: 127.0, durationMinutes: 15, status: 'ACTIVE' },
    { id: 'too_long', name: 'Long walk', activityType: 'WALK', primaryCategory: 'WALK', latitude: 37.5, longitude: 127.0, durationMinutes: 100, status: 'ACTIVE' },
    { id: 'too_intense', name: 'Hard walk', activityType: 'WALK', primaryCategory: 'WALK', latitude: 37.5, longitude: 127.0, durationMinutes: 15, intensity: 'HIGH', status: 'ACTIVE' }
  ];
  const candidates = await retrieveWithLocation(null, places, { condition: 'VERY_TIRED' });
  assert.deepEqual(candidates.map((candidate) => candidate.id), ['valid']);
});

test('Plan B request with null or omitted location returns candidates and serializes the requested date', async () => {
  await withServer(async (base) => {
    const user = await createUser(base);
    for (const location of [{ latitude: null, longitude: null }, undefined, null]) {
      const response = await request(base, '/plan-b/recommendations', {
        method: 'POST',
        headers: auth(user.accessToken),
        body: JSON.stringify(recommendationInput(location))
      });
      assert.equal(response.status, 201, JSON.stringify(response));
      assert.equal(data(response).date, '2026-09-15');
      assert.ok(data(response).course.stops.length > 0);
      assert.ok(data(response).course.stops.every((stop) => Number.isFinite(stop.travelMinutes)));
    }
  });
});
