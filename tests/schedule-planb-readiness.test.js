import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import { createRepositories } from '../src/data/repositories/index.js';
import { buildPlanBContext } from '../src/modules/plan-b/context-builder.js';
import { retrieveCandidates } from '../src/modules/plan-b/candidate-retriever.js';
import { createDistanceProvider } from '../src/modules/plan-b/distance-provider.js';
import { createRouteProvider } from '../src/modules/plan-b/route-provider.js';

async function withServer(fn) {
  const server = createApp({ jwtSecret: 'schedule-test-secret' });
  await new Promise((resolve) => server.listen(0, resolve));
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
  const body = response.status === 204 ? null : await response.json();
  return { status: response.status, body };
}

function data(response) {
  return response.body?.data;
}

async function createUser(base, label) {
  const suffix = `${label.slice(0, 8)}${Math.random().toString(36).slice(2, 8)}`;
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
  return {
    token: data(response).accessToken,
    user: data(response).user
  };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function scheduleInput(overrides = {}) {
  return {
    date: '2026-08-20',
    startTime: '13:30',
    endTime: '14:30',
    title: '운동 일정',
    isFixed: true,
    selfCareCategory: 'EXERCISE',
    ...overrides
  };
}

test('Schedule CRUD exposes ownership/timestamps, validates same-day time, and supports range reads', async () => {
  await withServer(async (base) => {
    const first = await createUser(base, 'schedule_owner');
    const second = await createUser(base, 'schedule_other');

    const equal = await request(base, '/schedules', {
      method: 'POST',
      headers: auth(first.token),
      body: JSON.stringify(scheduleInput({ startTime: '12:00', endTime: '12:00' }))
    });
    assert.equal(equal.status, 422);
    assert.equal(equal.body.error.code, 'INVALID_TIME_RANGE');

    const backwards = await request(base, '/schedules', {
      method: 'POST',
      headers: auth(first.token),
      body: JSON.stringify(scheduleInput({ startTime: '13:30', endTime: '13:29' }))
    });
    assert.equal(backwards.status, 422);

    const created = await request(base, '/schedules', {
      method: 'POST',
      headers: auth(first.token),
      body: JSON.stringify(scheduleInput({ endTime: '13:31' }))
    });
    assert.equal(created.status, 201);
    assert.equal(data(created).userId, first.user.id);
    assert.equal(data(created).selfCareCategory, 'EXERCISE');
    assert.match(data(created).createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(data(created).updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const updated = await request(base, `/schedules/${data(created).id}`, {
      method: 'PATCH',
      headers: auth(first.token),
      body: JSON.stringify({ title: '수정된 운동 일정' })
    });
    assert.equal(updated.status, 200);
    assert.equal(data(updated).title, '수정된 운동 일정');
    assert.ok(data(updated).updatedAt >= data(created).updatedAt);

    const otherSchedule = await request(base, '/schedules', {
      method: 'POST',
      headers: auth(second.token),
      body: JSON.stringify(scheduleInput({ title: '다른 사용자 일정' }))
    });
    assert.equal(otherSchedule.status, 201);

    const secondDate = await request(base, '/schedules', {
      method: 'POST',
      headers: auth(first.token),
      body: JSON.stringify(scheduleInput({ date: '2026-08-21', title: '다음 일정' }))
    });
    assert.equal(secondDate.status, 201);

    const range = await request(base, '/schedules?from=2026-08-20&to=2026-08-20', {
      headers: auth(first.token)
    });
    assert.equal(range.status, 200);
    assert.deepEqual(data(range).schedules.map((schedule) => schedule.id), [data(created).id]);
    assert.ok(!data(range).schedules.some((schedule) => schedule.id === data(otherSchedule).id));

    const invalidRange = await request(base, '/schedules?from=2026-08-21&to=2026-08-20', {
      headers: auth(first.token)
    });
    assert.equal(invalidRange.status, 422);

    const invalidPatch = await request(base, `/schedules/${data(created).id}`, {
      method: 'PATCH',
      headers: auth(first.token),
      body: JSON.stringify({ endTime: '13:30' })
    });
    assert.equal(invalidPatch.status, 422);

    const forbiddenPatch = await request(base, `/schedules/${data(created).id}`, {
      method: 'PATCH',
      headers: auth(second.token),
      body: JSON.stringify({ title: '탈취 시도' })
    });
    assert.equal(forbiddenPatch.status, 403);

    const deleted = await request(base, `/schedules/${data(created).id}`, {
      method: 'DELETE',
      headers: auth(second.token)
    });
    assert.equal(deleted.status, 403);

    const ownerDeleted = await request(base, `/schedules/${data(created).id}`, {
      method: 'DELETE',
      headers: auth(first.token)
    });
    assert.equal(ownerDeleted.status, 204);
  });
});

test('Plan B context combines personalization and schedule constraints without using fallback preference as time', async () => {
  const store = createStore();
  const repositories = createRepositories({ store, logger: { warn() {} } });
  const user = store.createUser({
    name: 'Plan B User',
    username: 'plan_b_context',
    email: 'plan_b_context@example.com',
    passwordHash: 'test'
  });
  store.setSelfCareProfile(user.id, {
    selfCareGoals: ['STRESS_RELIEF'],
    selfCareDifficultyReasons: ['FATIGUE'],
    availableFallbackMinutes: { min: 20, max: 30 },
    preferredActivities: ['WALK'],
    preferredAtmospheres: ['QUIET'],
    preferredIntensity: 'LOW',
    socialPreference: 'SOLO',
    aiStyle: 'T'
  });
  const broken = store.createSchedule({
    userId: user.id,
    date: '2026-08-20',
    startTime: '12:00',
    endTime: '13:00',
    title: '깨진 산책',
    isFixed: false,
    selfCareCategory: 'WALK'
  });
  const nextFixed = store.createSchedule({
    userId: user.id,
    date: '2026-08-20',
    startTime: '15:00',
    endTime: '16:00',
    title: '고정 회의',
    isFixed: true
  });

  const planContext = await buildPlanBContext({
    store,
    repositories,
    user,
    input: {
      date: '2026-08-20',
      startTime: '12:00',
      endTime: '17:00',
      brokenScheduleId: broken.id,
      selfCareCategory: 'WALK',
      customCategory: null,
      condition: 'NORMAL',
      continuityMode: 'AUTO',
      location: { latitude: 37.5696, longitude: 126.9784 }
    }
  });

  assert.equal(planContext.brokenPlan.scheduleId, broken.id);
  assert.equal(planContext.nextFixedSchedule.scheduleId, nextFixed.id);
  assert.equal(planContext.availableWindow.end, '2026-08-20T15:00:00+09:00');
  assert.equal(planContext.availableWindow.availableMinutes, 180);
  assert.equal(planContext.personalization.availableFallbackMinutes.min, 20);
  assert.equal(planContext.todayCompletedActivities.length, 0);
  assert.equal(planContext.aiStyle, 'T');

  const routeProvider = createRouteProvider();
  const distanceProvider = createDistanceProvider();
  const candidatesForT = retrieveCandidates({
    store,
    planContext,
    routeProvider,
    distanceProvider
  }).map((candidate) => candidate.id);
  const candidatesForF = retrieveCandidates({
    store,
    planContext: { ...planContext, aiStyle: 'F' },
    routeProvider,
    distanceProvider
  }).map((candidate) => candidate.id);
  assert.deepEqual(candidatesForT, candidatesForF);
});
