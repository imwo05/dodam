import assert from 'node:assert/strict';
import test from 'node:test';
import { recordShownPlacesState, resumePlanBState, startNewPlanBState } from '../src/contexts/plan-b-flow-state.js';

const initialInput = {
  date: '',
  startTime: '',
  endTime: '',
  selfCareCategory: '',
  customCategory: '',
  condition: '',
  continuityMode: '',
  currentLocation: null,
  brokenScheduleId: null
};

test('new Plan B resets a previous draft and keeps only explicit schedule context', () => {
  const previousFlow = {
    input: { ...initialInput, date: '2026-09-15', startTime: '09:00', selfCareCategory: 'WALK', condition: 'TIRED' },
    sessionId: 'pb_previous',
    seenPlaceIds: ['place_old']
  };
  const newFlow = startNewPlanBState(initialInput);
  const scheduleFlow = startNewPlanBState(initialInput, { date: '2026-09-16', brokenScheduleId: 'schedule_123' });

  assert.notEqual(newFlow, previousFlow);
  assert.deepEqual(newFlow, { input: initialInput, sessionId: null, seenPlaceIds: [] });
  assert.deepEqual(scheduleFlow, {
    input: { ...initialInput, date: '2026-09-16', brokenScheduleId: 'schedule_123' },
    sessionId: null,
    seenPlaceIds: []
  });
});

test('in-flow recommendations retain seen Place IDs while explicit session resume replaces stale flow state', () => {
  const firstRecommendation = recordShownPlacesState(startNewPlanBState(initialInput), 'pb_active', ['place_a', 'place_b']);
  const regenerated = recordShownPlacesState(firstRecommendation, 'pb_active', ['place_b', 'place_c']);
  const resumed = resumePlanBState(regenerated, 'pb_other');

  assert.deepEqual(regenerated.seenPlaceIds, ['place_a', 'place_b', 'place_c']);
  assert.equal(regenerated.sessionId, 'pb_active');
  assert.equal(resumed.sessionId, 'pb_other');
  assert.deepEqual(resumed.seenPlaceIds, []);
});
