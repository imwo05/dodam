import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/data/store.js';
import {
  calculateGardenData,
  GARDEN_CATEGORIES,
  GARDEN_STAGE_THRESHOLDS,
  gardenStageForCount,
  MAX_GARDEN_STAGE
} from '../src/modules/garden/growth.js';
import { completeStop, skipStop, startStop } from '../src/modules/plan-b/handlers.js';

test('no activity returns every Garden category at stage 0', () => {
  const garden = calculateGardenData();

  assert.equal(garden.completedActivityCount, 0);
  assert.equal(garden.pointBalance, 0);
  assert.deepEqual(garden.categoryGrowth, GARDEN_CATEGORIES.map((category) => ({
    category,
    count: 0,
    stage: 0
  })));
});

test('completed WALK activity increases its category count and stage', () => {
  const store = createStore();
  const user = store.createUser({
    name: 'Garden User',
    username: 'garden_walk',
    email: 'garden_walk@example.com',
    passwordHash: 'test'
  });

  store.createActivity({ userId: user.id, category: 'WALK' });
  const garden = store.getGarden(user.id);

  assert.equal(garden.completedActivityCount, 1);
  assert.equal(findGrowth(garden, 'WALK').count, 1);
  assert.equal(findGrowth(garden, 'WALK').stage, 1);
  assert.equal(findGrowth(garden, 'EXERCISE').count, 0);
});

test('stage thresholds change deterministically and cap at the supported maximum', () => {
  assert.deepEqual(GARDEN_STAGE_THRESHOLDS.map(({ stage, minimumCount }) => ({ stage, minimumCount })), [
    { stage: 0, minimumCount: 0 },
    { stage: 1, minimumCount: 1 },
    { stage: 2, minimumCount: 3 },
    { stage: 3, minimumCount: 6 },
    { stage: 4, minimumCount: 10 }
  ]);
  assert.equal(gardenStageForCount(2), 1);
  assert.equal(gardenStageForCount(3), 2);
  assert.equal(gardenStageForCount(6), 3);
  assert.equal(gardenStageForCount(10), 4);
  assert.equal(gardenStageForCount(1000), MAX_GARDEN_STAGE);
});

test('mixed completed categories are counted independently', () => {
  const store = createStore();
  const user = createTestUser(store, 'garden_mixed');

  for (let index = 1; index <= 3; index += 1) {
    store.createActivity({ userId: user.id, category: 'WALK', planBStopId: `walk_${index}` });
  }
  store.createActivity({ userId: user.id, category: 'EXERCISE', planBStopId: 'exercise_1' });
  store.createActivity({ userId: user.id, category: 'RUNNING', planBStopId: 'running_1' });

  const garden = store.getGarden(user.id);
  assert.equal(garden.completedActivityCount, 5);
  assert.deepEqual(findGrowth(garden, 'WALK'), { category: 'WALK', count: 3, stage: 2 });
  assert.deepEqual(findGrowth(garden, 'EXERCISE'), { category: 'EXERCISE', count: 1, stage: 1 });
  assert.deepEqual(findGrowth(garden, 'RUNNING'), { category: 'RUNNING', count: 1, stage: 1 });
  assert.deepEqual(findGrowth(garden, 'DIET'), { category: 'DIET', count: 0, stage: 0 });
});

test('planned schedules do not count before a completion event', () => {
  const store = createStore();
  const user = createTestUser(store, 'garden_planned');

  store.createSchedule({
    userId: user.id,
    date: '2026-08-20',
    startTime: '09:00',
    endTime: '10:00',
    title: '산책 계획',
    isFixed: false,
    selfCareCategory: 'WALK'
  });

  const garden = store.getGarden(user.id);
  assert.equal(garden.completedActivityCount, 0);
  assert.deepEqual(findGrowth(garden, 'WALK'), { category: 'WALK', count: 0, stage: 0 });
});

test('only the completed Plan B stop creates one counted activity', async () => {
  const store = createStore();
  const user = createTestUser(store, 'garden_completed');
  const place = store.createPlace({
    creatorId: user.id,
    name: 'Walk place',
    address: 'Somewhere',
    activityType: 'WALK',
    primaryCategory: 'WALK',
    durationMinutes: 30
  });
  const session = createPlanBSession(store, user.id, place.id, 'completed_stop');

  await startStop(planBContext(store, user, session.id, 'completed_stop'));
  await completeStop(planBContext(store, user, session.id, 'completed_stop'));

  assert.deepEqual(store.listActivities({ userId: user.id }).map(({ category, source, planBStopId }) => ({
    category,
    source,
    planBStopId
  })), [{ category: 'WALK', source: 'PLAN_B', planBStopId: 'completed_stop' }]);
  assert.equal(store.getGarden(user.id).completedActivityCount, 1);
  await assert.rejects(
    () => completeStop(planBContext(store, user, session.id, 'completed_stop')),
    { code: 'STOP_ALREADY_COMPLETED' }
  );
  assert.equal(store.getGarden(user.id).completedActivityCount, 1);
});

test('skipped Plan B stop does not count as completed activity', async () => {
  const store = createStore();
  const user = createTestUser(store, 'garden_skipped');
  const place = store.createPlace({
    creatorId: user.id,
    name: 'Skipped place',
    address: 'Somewhere',
    activityType: 'WALK',
    primaryCategory: 'WALK',
    durationMinutes: 30
  });
  const session = createPlanBSession(store, user.id, place.id, 'skipped_stop');

  await skipStop(planBContext(store, user, session.id, 'skipped_stop'));

  assert.equal(store.listActivities({ userId: user.id }).length, 0);
  assert.equal(store.getGarden(user.id).completedActivityCount, 0);
  assert.deepEqual(findGrowth(store.getGarden(user.id), 'WALK'), { category: 'WALK', count: 0, stage: 0 });
});

test('activity source and user ownership are isolated at the Garden endpoint', async () => {
  const store = createStore();
  const server = createApp({ store, jwtSecret: 'garden-test-secret' });
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const first = await signUp(base, 'garden_owner');
    const second = await signUp(base, 'garden_other');
    store.createActivity({ userId: first.user.id, category: 'WALK', planBStopId: 'owner_stop' });

    const firstGarden = await request(base, '/users/me/garden', first.token);
    const secondGarden = await request(base, '/users/me/garden', second.token);
    const unauthenticated = await request(base, '/users/me/garden');

    assert.equal(firstGarden.status, 200);
    assert.equal(firstGarden.body.data.completedActivityCount, 1);
    assert.equal(secondGarden.status, 200);
    assert.equal(secondGarden.body.data.completedActivityCount, 0);
    assert.equal(unauthenticated.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unrecognized activity sources do not become Garden growth', () => {
  const store = createStore();
  const user = createTestUser(store, 'garden_excluded_source');
  store.createActivity({ userId: user.id, category: 'WALK', source: 'MANUAL', planBStopId: null });

  assert.equal(store.getGarden(user.id).completedActivityCount, 0);
});

function findGrowth(garden, category) {
  return garden.categoryGrowth.find((growth) => growth.category === category);
}

function createTestUser(store, username) {
  return store.createUser({
    name: username,
    username,
    email: `${username}@example.com`,
    passwordHash: 'test'
  });
}

function createPlanBSession(store, userId, placeId, stopId) {
  const session = store.createPlanBSession({
    userId,
    date: '2026-08-20',
    startTime: '09:00',
    endTime: '10:00',
    availableMinutes: 60,
    selfCareCategory: 'WALK'
  });
  store.updatePlanBSession(session.id, {
    status: 'IN_PROGRESS',
    stops: [{
      id: stopId,
      sessionId: session.id,
      placeId,
      order: 1,
      durationMinutes: 30,
      status: 'NOT_STARTED',
      startedAt: null,
      completedAt: null,
      skippedAt: null
    }]
  });
  return store.findPlanBSession(session.id);
}

function planBContext(store, user, sessionId, stopId) {
  return {
    req: { headers: { authorization: 'Bearer test-token' } },
    auth: { verifyAccessToken: () => user },
    store,
    params: { sessionId, stopId }
  };
}

async function signUp(base, username) {
  const response = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: username,
      username,
      email: `${username}@example.com`,
      password: 'Password123!',
      age: 30
    })
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { token: body.data.accessToken, user: body.data.user };
}

async function request(base, path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json() };
}
