import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { createInMemoryPlaceRepository, createSupabasePlaceRepository } from '../src/data/repositories/index.js';
import { buildSeedPlaces, loadPlaceSource } from '../src/data/place-source.js';
import { retrieveCandidates } from '../src/modules/plan-b/candidate-retriever.js';
import { createDistanceProvider } from '../src/modules/plan-b/distance-provider.js';
import { createRouteProvider } from '../src/modules/plan-b/route-provider.js';

async function withServer(fn) {
  const server = createApp({ jwtSecret: 'place-test-secret' });
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
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function data(response) {
  return response.body?.data;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createUser(base, label) {
  const suffix = `${label}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await request(base, '/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: label,
      username: suffix,
      email: `${suffix}@example.com`,
      password: 'Password123!',
      age: 30
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response));
  return { token: data(response).accessToken, user: data(response).user };
}

test('Place seed source parses the authoritative points, segments, experiences, and references', () => {
  const source = loadPlaceSource();
  assert.equal(source.points.length, 306);
  assert.equal(source.segments.length, 3);
  assert.equal(source.experiences.length, 306);
  const pointIds = new Set(source.points.map((point) => point.place_id));
  const segmentIds = new Set(source.segments.map((segment) => segment.segment_id));
  assert.ok(source.segments.every((segment) => pointIds.has(segment.start_place_id) && pointIds.has(segment.end_place_id)));
  assert.ok(source.experiences.every((experience) => pointIds.has(experience.place_id)));
  assert.ok(source.experiences.every((experience) => !experience.segment_id || segmentIds.has(experience.segment_id)));
});

test('Place seed import is deterministic and idempotent in the in-memory adapter', async () => {
  const store = createStore();
  const repository = createInMemoryPlaceRepository(store);
  const { places } = buildSeedPlaces(loadPlaceSource());
  for (const place of places) await repository.upsertSeed(place);
  for (const place of places) await repository.upsertSeed(place);
  const imported = (await repository.list({ includeInactive: true })).filter((place) => place.source === 'SEED');
  assert.equal(imported.length, 309);
  assert.equal(new Set(imported.map((place) => place.id)).size, 309);
  assert.equal(imported.filter((place) => place.geometryType === 'POINT').length, 306);
  assert.equal(imported.filter((place) => place.geometryType === 'SEGMENT').length, 3);
  assert.ok(imported.every((place) => place.creatorId === null));
});

test('Place API supports POINT and SEGMENT detail, map bounds, search, saved places, and My Places ownership', async () => {
  await withServer(async (base) => {
    const owner = await createUser(base, 'place_owner');
    const other = await createUser(base, 'place_other');
    const point = await request(base, '/places', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        name: 'Quiet point',
        address: '서울 서초구 테스트길',
        activityType: 'WALK',
        description: 'A point place',
        atmosphereTags: ['QUIET'],
        point: { latitude: 37.49, longitude: 127.01 }
      })
    });
    assert.equal(point.status, 201, JSON.stringify(point));
    assert.equal(data(point).geometryType, 'POINT');
    assert.deepEqual(data(point).geometry.point, { latitude: 37.49, longitude: 127.01 });

    const segment = await request(base, '/places', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({
        name: 'Quiet segment',
        address: '서울 서초구 테스트길',
        activityType: 'WALK',
        description: 'A segment place',
        durationMinutes: 20,
        startPoint: { latitude: 37.48, longitude: 127.00 },
        endPoint: { latitude: 37.50, longitude: 127.02 }
      })
    });
    assert.equal(segment.status, 201, JSON.stringify(segment));
    assert.equal(data(segment).geometryType, 'SEGMENT');
    assert.equal(data(segment).geometry.start.latitude, 37.48);
    assert.equal(data(segment).geometry.end.longitude, 127.02);

    const map = await request(base, '/places/map?swLat=37.47&swLng=126.99&neLat=37.51&neLng=127.03');
    assert.ok(data(map).places.some((place) => place.id === data(point).id));
    assert.ok(data(map).places.some((place) => place.id === data(segment).id && place.geometryType === 'SEGMENT'));

    const search = await request(base, '/places/search?keyword=Quiet');
    assert.deepEqual(new Set(data(search).places.map((place) => place.id)), new Set([data(point).id, data(segment).id]));

    const saved = await request(base, `/places/${data(point).id}/save`, { method: 'POST', headers: auth(owner.token) });
    assert.equal(saved.status, 200);
    const detail = await request(base, `/places/${data(point).id}`, { headers: auth(owner.token) });
    assert.equal(data(detail).isSaved, true);
    const savedList = await request(base, '/users/me/saved-places', { headers: auth(owner.token) });
    assert.ok(data(savedList).places.some((place) => place.id === data(point).id));

    const mine = await request(base, '/users/me/places', { headers: auth(owner.token) });
    assert.deepEqual(new Set(data(mine).places.map((place) => place.id)), new Set([data(point).id, data(segment).id]));

    const forbidden = await request(base, `/places/${data(point).id}`, {
      method: 'PATCH',
      headers: auth(other.token),
      body: JSON.stringify({ name: 'stolen' })
    });
    assert.equal(forbidden.status, 403);
    const forbiddenDelete = await request(base, `/places/${data(point).id}`, {
      method: 'DELETE',
      headers: auth(other.token)
    });
    assert.equal(forbiddenDelete.status, 403);
  });
});

test('CandidateRetriever reads repository Places and keeps atmosphere/intensity preferences soft', async () => {
  const places = [
    {
      id: 'repo_quiet', name: 'Quiet', activityType: 'WALK', primaryCategory: 'WALK',
      latitude: 37.5, longitude: 127.0, durationMinutes: 15, tags: ['QUIET'], intensity: 'LOW', status: 'ACTIVE'
    },
    {
      id: 'repo_unknown', name: 'Unknown', activityType: 'WALK', primaryCategory: 'WALK',
      latitude: 37.5, longitude: 127.0, durationMinutes: 15, tags: [], intensity: null, status: 'ACTIVE'
    },
    {
      id: 'repo_avoid', name: 'Crowded', activityType: 'WALK', primaryCategory: 'WALK',
      latitude: 37.5, longitude: 127.0, durationMinutes: 15, tags: ['CROWDED'], intensity: 'HIGH', status: 'ACTIVE'
    }
  ];
  const candidates = await retrieveCandidates({
    store: createStore(),
    placeRepository: { async list() { return places; } },
    planContext: {
      selfCareCategory: 'WALK',
      condition: 'TIRED',
      continuityMode: 'AUTO',
      currentLocation: { latitude: 37.5, longitude: 127.0 },
      availableWindow: { usableMinutes: 30 },
      personalization: { preferredAtmospheres: ['QUIET'], avoidAtmospheres: ['CROWDED'], preferredIntensity: 'LOW' }
    },
    routeProvider: createRouteProvider(),
    distanceProvider: createDistanceProvider()
  });
  assert.equal(candidates[0].id, 'repo_quiet');
  assert.ok(candidates.some((candidate) => candidate.id === 'repo_unknown'));
  assert.ok(!candidates.some((candidate) => candidate.id === 'repo_avoid'));
  assert.equal(candidates.find((candidate) => candidate.id === 'repo_unknown').intensity, null);
});

test('Supabase Place repository persists and reads POINT and SEGMENT rows through the client boundary', async () => {
  const tables = { places: [], saved_places: [] };
  const calls = [];
  const client = {
    async select(table, query = {}) {
      calls.push(['select', table]);
      return tables[table].filter((row) => Object.entries(query).every(([key, value]) => {
        if (key === 'select' || key === 'limit' || key === 'order') return true;
        if (!String(value).startsWith('eq.')) return true;
        return String(row[key]) === String(value).slice(3);
      })).slice(0, query.limit ? Number(query.limit) : undefined);
    },
    async insert(table, row) {
      calls.push(['insert', table]);
      tables[table].push({ ...row });
      return [{ ...row }];
    },
    async upsert(table, row) {
      calls.push(['upsert', table]);
      const existing = tables[table].find((item) => item.id === row.id || (item.user_id === row.user_id && item.place_id === row.place_id));
      if (existing) Object.assign(existing, row);
      else tables[table].push({ ...row });
      return [{ ...(existing ?? row) }];
    },
    async update(table, query, patch) {
      calls.push(['update', table]);
      const rows = tables[table].filter((row) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value).slice(3)));
      rows.forEach((row) => Object.assign(row, patch));
      return rows.map((row) => ({ ...row }));
    },
    async delete(table) {
      calls.push(['delete', table]);
      tables[table].length = 0;
      return [];
    }
  };
  const repository = createSupabasePlaceRepository(client);
  const point = await repository.create({
    id: 'plc_point_repo',
    name: 'Persistent point',
    address: '서울',
    geometryType: 'POINT',
    latitude: 37.5,
    longitude: 127.0,
    activityType: 'WALK'
  });
  const segment = await repository.create({
    id: 'plc_segment_repo',
    name: 'Persistent segment',
    address: '서울',
    geometryType: 'SEGMENT',
    startLatitude: 37.5,
    startLongitude: 127.0,
    endLatitude: 37.51,
    endLongitude: 127.01,
    activityType: 'WALK'
  });
  const readPoint = await repository.getById(point.id);
  const readSegment = await repository.getById(segment.id);
  assert.equal(readPoint.latitude, 37.5);
  assert.equal(readPoint.geometryType, 'POINT');
  assert.equal(readSegment.geometryType, 'SEGMENT');
  assert.equal(readSegment.startLatitude, 37.5);
  assert.equal(readSegment.endLongitude, 127.01);
  assert.deepEqual(calls.slice(0, 2), [['insert', 'places'], ['insert', 'places']]);
  assert.ok(calls.some(([method, table]) => method === 'select' && table === 'places'));
});
