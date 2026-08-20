import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/service.js';
import { buildPlanBContext, contextFromSession } from './context-builder.js';
import { maxStopsFor, retrieveCandidates } from './candidate-retriever.js';
import { createDistanceProvider } from './distance-provider.js';
import { createRouteProvider, placeLocation } from './route-provider.js';

const CONDITIONS = new Set(['VERY_GOOD', 'GOOD', 'NORMAL', 'TIRED', 'VERY_TIRED']);
const MODES = new Set(['SIMILAR', 'EASY', 'MINIMUM', 'AUTO']);
const CATEGORIES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);
const PROMPT_VERSION = 'plan-b-v1';
const routeProvider = createRouteProvider();
const distanceProvider = createDistanceProvider();

export async function createRecommendations(context) {
  const user = requireAuth(context);
  const input = validateRecoRequest(context.body);
  const planContext = buildPlanBContext({ store: context.store, user, input });
  const candidates = retrieveCandidates({ store: context.store, planContext, routeProvider, distanceProvider });
  if (!candidates.length) throw noCandidateError();

  const session = context.store.createPlanBSession({
    userId: user.id,
    date: input.date,
    brokenScheduleId: planContext.brokenPlan?.scheduleId ?? null,
    nextScheduleId: planContext.nextFixedSchedule?.scheduleId ?? null,
    startTime: input.startTime,
    endTime: planContext.effectiveEndTime,
    availableMinutes: planContext.availableWindow.availableMinutes,
    bufferMinutes: planContext.availableWindow.bufferMinutes,
    usableMinutes: planContext.availableWindow.usableMinutes,
    selfCareCategory: planContext.selfCareCategory,
    customCategory: input.customCategory,
    condition: input.condition,
    continuityMode: input.continuityMode,
    location: input.location,
    originalGoal: planContext.originalGoal,
    aiStyle: planContext.aiStyle,
    promptVersion: PROMPT_VERSION,
    contextSnapshot: planContext
  });

  const generated = await generateCourse(context, session, planContext, candidates);
  persistGeneratedPlan(context.store, session.id, generated);
  return { status: 201, data: buildPlanBResponse(context.store.findPlanBSession(session.id), context.store) };
}

export async function getSession(context) {
  const { session } = findOwnedSession(context);
  return { data: {
    ...buildPlanBResponse(session, context.store),
    id: session.id,
    currentStopOrder: session.currentStopOrder
  } };
}

export async function regenerate(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'RECOMMENDED');
  const exclude = Array.isArray(context.body.excludePlaceIds)
    ? context.body.excludePlaceIds.map(String)
    : [];
  const planContext = contextFromSession(session);
  const candidates = retrieveCandidates({
    store: context.store,
    planContext,
    routeProvider,
    distanceProvider,
    excludePlaceIds: exclude
  });
  if (!candidates.length) throw noCandidateError();

  const generated = await generateCourse(context, session, planContext, candidates);
  persistGeneratedPlan(context.store, session.id, generated);
  return { data: buildPlanBResponse(context.store.findPlanBSession(session.id), context.store) };
}

export async function getCourse(context) {
  const { session } = findOwnedSession(context);
  return { data: buildCourseResponse(session, context.store) };
}

export async function addStop(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'RECOMMENDED');
  const placeId = String(context.body.placeId ?? '');
  const place = context.store.findPlaceById(placeId);
  if (!place || (place.status ?? 'ACTIVE') !== 'ACTIVE') {
    throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  }

  const insertAfterStopId = context.body.insertAfterStopId == null
    ? null
    : String(context.body.insertAfterStopId);
  const stops = cloneStops(session.stops);
  const newStop = newStopRecord(context.store.nextStopId(), session.id, placeId, place);
  if (insertAfterStopId == null) {
    stops.push(newStop);
  } else {
    const index = stops.findIndex((stop) => stop.id === insertAfterStopId);
    if (index < 0) throw new ApiError(422, 'INVALID_COURSE_ORDER', 'insertAfterStopId가 현재 코스에 없습니다.');
    stops.splice(index + 1, 0, newStop);
  }

  const recalculated = calculateCourse(session, stops, context.store);
  persistCourse(context.store, session.id, recalculated);
  return { data: buildCourseResponse(context.store.findPlanBSession(session.id), context.store) };
}

export async function removeStop(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'RECOMMENDED');
  const stopId = context.params.stopId;
  const stops = cloneStops(session.stops).filter((stop) => stop.id !== stopId);
  if (stops.length === session.stops.length) {
    throw new ApiError(404, 'STOP_NOT_FOUND', '해당 코스 장소를 찾을 수 없습니다.');
  }
  if (stops.length < 1) {
    throw new ApiError(409, 'MINIMUM_ONE_STOP', 'Plan B 코스에는 최소 한 곳이 필요합니다.');
  }
  const recalculated = calculateCourse(session, stops, context.store);
  persistCourse(context.store, session.id, recalculated);
  return { data: buildCourseResponse(context.store.findPlanBSession(session.id), context.store) };
}

export async function reorderStops(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'RECOMMENDED');
  const stopIds = context.body.stopIds;
  if (!Array.isArray(stopIds) || stopIds.length !== session.stops.length) {
    throw new ApiError(422, 'INVALID_COURSE_ORDER', 'stopIds는 현재 코스의 모든 stop을 포함해야 합니다.');
  }
  const byId = new Map(session.stops.map((stop) => [stop.id, stop]));
  if (new Set(stopIds).size !== stopIds.length || stopIds.some((id) => !byId.has(id))) {
    throw new ApiError(422, 'INVALID_COURSE_ORDER', 'stopIds에 잘못된 값이 있습니다.');
  }
  const recalculated = calculateCourse(session, stopIds.map((id) => ({ ...byId.get(id) })), context.store);
  persistCourse(context.store, session.id, recalculated);
  return { data: buildCourseResponse(context.store.findPlanBSession(session.id), context.store) };
}

export async function startSession(context) {
  const { session } = findOwnedSession(context);
  if (session.status === 'IN_PROGRESS') throw new ApiError(409, 'PLAN_B_ALREADY_STARTED', 'Plan B가 이미 시작되었습니다.');
  if (session.status === 'COMPLETED') throw new ApiError(409, 'PLAN_B_ALREADY_COMPLETED', '완료된 Plan B입니다.');
  if (session.status !== 'RECOMMENDED') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Plan B를 시작할 수 없습니다.');
  if (!session.stops.length) throw new ApiError(409, 'EMPTY_COURSE', '코스에 장소가 없습니다.');
  const stops = session.stops.map((stop) => ({ ...stop }));
  context.store.updatePlanBSession(session.id, { status: 'IN_PROGRESS', currentStopOrder: 1, stops });
  return { data: { status: 'IN_PROGRESS', currentStop: { id: stops[0].id, order: stops[0].order } } };
}

export async function startStop(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'IN_PROGRESS');
  const target = findStop(session, context.params.stopId);
  if (target.status !== 'NOT_STARTED') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'stop을 시작할 수 없습니다.');
  const startedAt = new Date().toISOString();
  const stops = session.stops.map((stop) => stop.id === target.id
    ? { ...stop, status: 'IN_PROGRESS', startedAt }
    : { ...stop });
  context.store.updatePlanBSession(session.id, { stops, currentStopOrder: target.order });
  return { data: { stopId: target.id, status: 'IN_PROGRESS' } };
}

export async function completeStop(context) {
  const user = requireAuth(context);
  const { session } = findOwnedSession(context, user);
  const target = findStop(session, context.params.stopId);
  if (target.status === 'COMPLETED') throw new ApiError(409, 'STOP_ALREADY_COMPLETED', '이미 완료된 stop입니다.');
  assertSessionStatus(session, 'IN_PROGRESS');
  if (target.status !== 'IN_PROGRESS') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', '시작된 stop만 완료할 수 있습니다.');

  const completedAt = new Date().toISOString();
  const stops = session.stops.map((stop) => stop.id === target.id
    ? { ...stop, status: 'COMPLETED', completedAt }
    : { ...stop });
  if (!context.store.findActivityByPlanBStop(user.id, target.id)) {
    const place = context.store.findPlaceById(target.placeId);
    context.store.createActivity({
      userId: user.id,
      date: session.date,
      category: place?.primaryCategory ?? place?.activityType ?? null,
      placeId: target.placeId,
      durationMinutes: target.durationMinutes,
      source: 'PLAN_B',
      planBSessionId: session.id,
      planBStopId: target.id
    });
  }
  return finishStop(context.store, session, stops, target.id, 'complete');
}

export async function skipStop(context) {
  const { session } = findOwnedSession(context);
  assertSessionStatus(session, 'IN_PROGRESS');
  const target = findStop(session, context.params.stopId);
  if (!['NOT_STARTED', 'IN_PROGRESS'].includes(target.status)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'stop을 건너뛸 수 없습니다.');
  }
  const stops = session.stops.map((stop) => stop.id === target.id
    ? { ...stop, status: 'SKIPPED', skippedAt: new Date().toISOString() }
    : { ...stop });
  return finishStop(context.store, session, stops, target.id, 'skip');
}

export async function cancelSession(context) {
  const { session } = findOwnedSession(context);
  if (!['RECOMMENDED', 'IN_PROGRESS'].includes(session.status)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Plan B를 취소할 수 없습니다.');
  }
  const updated = context.store.updatePlanBSession(session.id, { status: 'CANCELLED' });
  return { data: { sessionId: updated.id, status: updated.status } };
}

async function generateCourse(context, session, planContext, candidates) {
  const aiResult = await requestAiPlan(context, planContext, candidates);
  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedIds = uniqueStrings(aiResult?.selectedExperienceIds)
    .filter((id) => allowedIds.has(id))
    .slice(0, maxStopsFor(planContext.availableWindow.availableMinutes));
  const chosen = chooseValidCourse(session, candidates, selectedIds, context.store);
  if (!chosen) throw noCandidateError();

  const reasonMap = new Map(
    (Array.isArray(aiResult?.stopReasons) ? aiResult.stopReasons : [])
      .filter((item) => allowedIds.has(String(item?.placeId)))
      .map((item) => [String(item.placeId), String(item.reason ?? '')])
  );
  return {
    ...chosen,
    reframedGoal: sanitizeReframedGoal(aiResult?.reframedGoal, planContext.originalGoal, planContext),
    courseConcept: nonEmpty(aiResult?.courseConcept) ?? fallbackConcept(planContext),
    summary: nonEmpty(aiResult?.summary) ?? fallbackSummary(planContext),
    damiState: normalizeDamiState(aiResult?.damiState, planContext.selfCareCategory),
    promptVersion: PROMPT_VERSION,
    reasonMap
  };
}

async function requestAiPlan(context, planContext, candidates) {
  try {
    if (context.aiClient?.planBPlan) {
      return await context.aiClient.planBPlan({
        context: toAiContext(planContext),
        candidates: candidates.map(toAiCandidate),
        promptVersion: PROMPT_VERSION
      });
    }
  } catch {
    // Backend candidate ranking fallback.
  }
  return null;
}

function chooseValidCourse(session, candidates, selectedIds, store) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean);
  for (let count = selected.length; count >= 1; count -= 1) {
    const result = tryCalculate(session, selected.slice(0, count), store);
    if (result) return result;
  }

  for (const candidate of candidates) {
    if (selectedIds.includes(candidate.id)) continue;
    const result = tryCalculate(session, [candidate], store);
    if (result) return result;
  }

  const maxStops = maxStopsFor(session.availableMinutes);
  const fallback = candidates.slice(0, maxStops);
  for (let count = fallback.length; count >= 1; count -= 1) {
    const result = tryCalculate(session, fallback.slice(0, count), store);
    if (result) return result;
  }
  return null;
}

function tryCalculate(session, candidates, store) {
  const stops = candidates.map((candidate) => newStopRecord(
    store.nextStopId(), session.id, candidate.id, candidate.place
  ));
  try {
    return calculateCourse(session, stops, store);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'COURSE_TIME_EXCEEDED') return null;
    throw error;
  }
}

function calculateCourse(session, stops, store) {
  const currentLocation = session.latitude == null
    ? null
    : { latitude: session.latitude, longitude: session.longitude };
  let cursor = toMinutes(session.startTime);
  let previousLocation = currentLocation;
  const recalculated = stops.map((stop, index) => {
    const place = store.findPlaceById(stop.placeId);
    const location = placeLocation(place);
    const travelMinutes = routeProvider.getTravelTime(previousLocation, location);
    const durationMinutes = Number(stop.durationMinutes ?? place?.durationMinutes ?? 30);
    cursor += travelMinutes;
    const startTime = toHHMM(cursor);
    cursor += durationMinutes;
    const endTime = toHHMM(cursor);
    previousLocation = location;
    return {
      ...stop,
      sessionId: session.id,
      order: index + 1,
      travelMinutes,
      durationMinutes,
      startTime,
      endTime
    };
  });

  const totalMinutes = recalculated.reduce(
    (sum, stop) => sum + stop.travelMinutes + stop.durationMinutes, 0
  );
  const requiredMinutes = totalMinutes;
  const usableMinutes = Number(session.usableMinutes ?? Math.max(0, session.availableMinutes - session.bufferMinutes));
  if (requiredMinutes > usableMinutes) {
    throw new ApiError(
      409,
      'COURSE_TIME_EXCEEDED',
      '이 코스는 buffer 시간을 고려하면 시간이 부족합니다.',
      { requiredMinutes, availableMinutes: session.availableMinutes }
    );
  }

  return {
    stops: recalculated,
    totalMinutes,
    finalTravel: null
  };
}

function persistGeneratedPlan(store, sessionId, generated) {
  const session = store.findPlanBSession(sessionId);
  const stops = generated.stops.map((stop) => ({
    ...stop,
    reason: generated.reasonMap.get(stop.placeId) || fallbackStopReason(store.findPlaceById(stop.placeId), session),
    miniMission: null,
    status: stop.status ?? 'NOT_STARTED',
    startedAt: stop.startedAt ?? null,
    completedAt: stop.completedAt ?? null,
    skippedAt: stop.skippedAt ?? null
  }));
  store.updatePlanBSession(sessionId, {
    stops,
    finalTravel: generated.finalTravel,
    reframedGoal: generated.reframedGoal,
    originalGoal: generated.reframedGoal.originalGoal,
    reframingReason: generated.reframedGoal.reason,
    courseConcept: generated.courseConcept,
    summary: generated.summary,
    damiState: generated.damiState,
    promptVersion: generated.promptVersion,
    status: 'RECOMMENDED',
    currentStopOrder: stops[0]?.order ?? null
  });
}

function persistCourse(store, sessionId, course) {
  store.updatePlanBSession(sessionId, {
    stops: course.stops,
    finalTravel: course.finalTravel,
    currentStopOrder: course.stops[0]?.order ?? null
  });
}

function finishStop(store, session, stops, stopId, action) {
  const next = stops
    .filter((stop) => ['NOT_STARTED', 'IN_PROGRESS'].includes(stop.status))
    .sort((a, b) => a.order - b.order)[0] ?? null;
  const allTerminal = stops.every((stop) => ['COMPLETED', 'SKIPPED'].includes(stop.status));
  const updated = store.updatePlanBSession(session.id, {
    stops,
    status: allTerminal ? 'COMPLETED' : 'IN_PROGRESS',
    currentStopOrder: next?.order ?? null
  });
  return {
    data: {
      ...(action === 'skip' ? { skippedStopId: stopId } : { completedStopId: stopId }),
      hasNextStop: Boolean(next),
      nextStop: next ? { id: next.id, placeId: next.placeId } : null,
      sessionStatus: updated.status
    }
  };
}

function buildPlanBResponse(session, store) {
  return {
    sessionId: session.id,
    status: session.status,
    availableMinutes: session.availableMinutes,
    bufferMinutes: session.bufferMinutes,
    usableMinutes: session.usableMinutes ?? Math.max(0, session.availableMinutes - session.bufferMinutes),
    aiStyle: session.aiStyle === 'T' ? 'T' : 'F',
    reframedGoal: toReframedGoal(session),
    summary: session.summary,
    courseConcept: session.courseConcept,
    damiState: session.damiState,
    course: buildCourseResponse(session, store)
  };
}

function buildCourseResponse(session, store) {
  return {
    totalMinutes: session.stops.reduce(
      (sum, stop) => sum + Number(stop.travelMinutes ?? 0) + Number(stop.durationMinutes ?? 0),
      0
    ),
    stops: session.stops.map((stop) => serializeStop(stop, store)),
    finalTravel: session.finalTravel ?? null
  };
}

function serializeStop(stop, store) {
  const place = store.findPlaceById(stop.placeId);
  return {
    id: stop.id,
    order: stop.order,
    place: place ? serializePlace(place) : { id: stop.placeId },
    travelMinutes: stop.travelMinutes,
    durationMinutes: stop.durationMinutes,
    startTime: stop.startTime ?? null,
    endTime: stop.endTime ?? null,
    reason: stop.reason ?? null,
    miniMission: stop.miniMission ?? null,
    status: stop.status,
    startedAt: stop.startedAt ?? null,
    completedAt: stop.completedAt ?? null,
    skippedAt: stop.skippedAt ?? null
  };
}

function serializePlace(place) {
  return {
    id: place.id,
    name: place.name,
    geometryType: place.geometryType ?? 'POINT',
    primaryCategory: place.primaryCategory ?? place.activityType,
    category: place.activityType,
    point: place.geometryType === 'SEGMENT' ? null : placeLocation(place),
    startPoint: place.geometryType === 'SEGMENT' && place.startLatitude != null
      ? { latitude: Number(place.startLatitude), longitude: Number(place.startLongitude) }
      : null,
    endPoint: place.geometryType === 'SEGMENT' && place.endLatitude != null
      ? { latitude: Number(place.endLatitude), longitude: Number(place.endLongitude) }
      : null,
    encodedPolyline: place.encodedPolyline ?? null,
    imageUrl: place.imageUrls?.[0] ?? null,
    durationMinutes: place.durationMinutes,
    intensity: place.intensity ?? null,
    location: placeLocation(place)
  };
}

function findOwnedSession(context, userArg) {
  const user = userArg ?? requireAuth(context);
  const session = context.store.findPlanBSession(context.params.sessionId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Plan B 세션을 찾을 수 없습니다.');
  if (session.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인 세션만 접근할 수 있습니다.');
  return { session, user };
}

function findStop(session, stopId) {
  const stop = session.stops.find((item) => item.id === stopId);
  if (!stop) throw new ApiError(404, 'STOP_NOT_FOUND', '장소를 찾을 수 없습니다.');
  return stop;
}

function assertSessionStatus(session, expected) {
  if (session.status !== expected) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `현재 상태(${session.status})에서는 요청할 수 없습니다.`);
  }
}

function validateRecoRequest(body) {
  const out = {
    date: assertDate(body.date),
    startTime: assertTime(body.startTime, 'startTime'),
    endTime: assertTime(body.endTime, 'endTime'),
    brokenScheduleId: body.brokenScheduleId == null ? null : String(body.brokenScheduleId),
    selfCareCategory: body.selfCareCategory == null ? null : assertEnum(body.selfCareCategory, CATEGORIES, 'selfCareCategory'),
    customCategory: body.customCategory ?? null,
    condition: body.condition == null ? null : assertEnum(body.condition, CONDITIONS, 'condition'),
    continuityMode: body.continuityMode == null ? null : assertEnum(body.continuityMode, MODES, 'continuityMode')
  };
  const loc = body.location ?? {};
  out.location = {
    latitude: loc.latitude == null ? null : finiteNumber(loc.latitude, 'location.latitude'),
    longitude: loc.longitude == null ? null : finiteNumber(loc.longitude, 'location.longitude')
  };
  return out;
}

function toAiContext(planContext) {
  return {
    condition: planContext.condition,
    continuityMode: planContext.continuityMode,
    currentLocation: planContext.currentLocation,
    availableWindow: planContext.availableWindow,
    brokenPlan: planContext.brokenPlan,
    nextFixedSchedule: planContext.nextFixedSchedule,
    aiStyle: planContext.aiStyle,
    selfCareProfile: planContext.profile,
    personalization: planContext.personalization ?? planContext.profile,
    profile: planContext.profile,
    todayCompletedActivities: planContext.todayCompletedActivities,
    originalGoal: planContext.originalGoal
  };
}

function toAiCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    categories: candidate.categories,
    durationMinutes: candidate.durationMinutes,
    intensity: candidate.intensity,
    travelFromCurrentMinutes: candidate.travelFromCurrentMinutes,
    tags: candidate.tags
  };
}

function newStopRecord(id, sessionId, placeId, place) {
  return {
    id,
    sessionId,
    placeId,
    order: 0,
    travelMinutes: 0,
    durationMinutes: Number(place?.durationMinutes ?? 30),
    startTime: null,
    endTime: null,
    reason: null,
    miniMission: null,
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    skippedAt: null
  };
}

function cloneStops(stops) {
  return stops.map((stop) => ({ ...stop }));
}

function sanitizeReframedGoal(value, originalGoal, planContext) {
  return {
    originalGoal: nonEmpty(value?.originalGoal) ?? originalGoal,
    newGoal: nonEmpty(value?.newGoal) ?? fallbackNewGoal(planContext),
    reason: nonEmpty(value?.reason) ?? (planContext.aiStyle === 'T'
      ? '현재 컨디션과 남은 시간을 기준으로 목표를 조정했습니다.'
      : '현재 컨디션과 남은 시간을 고려해 부담을 조정했어요.')
  };
}

function toReframedGoal(session) {
  return session.reframedGoal ?? {
    originalGoal: session.originalGoal ?? '',
    newGoal: session.originalGoal ?? '',
    reason: session.reframingReason ?? ''
  };
}

function fallbackNewGoal(planContext) {
  if (planContext.condition === 'VERY_TIRED' || planContext.condition === 'TIRED') {
    return planContext.aiStyle === 'T' ? '저강도 자기관리 1회 수행' : '오늘은 무리하지 않고 가볍게 자기관리를 이어가기';
  }
  if (planContext.continuityMode === 'MINIMUM') return planContext.aiStyle === 'T'
    ? '최소한의 자기관리 1회 수행'
    : '오늘 가능한 최소한의 자기관리 이어가기';
  return planContext.aiStyle === 'T'
    ? `${planContext.originalGoal ?? '자기관리'}를 남은 시간에 맞춰 실행`
    : `${planContext.originalGoal ?? '자기관리'}를 남은 시간에 맞게 이어가기`;
}

function fallbackConcept(planContext) {
  if (planContext.condition === 'TIRED' || planContext.condition === 'VERY_TIRED') return planContext.aiStyle === 'T'
    ? '저강도 회복 루틴'
    : '부담을 낮춘 회복 루틴';
  return planContext.aiStyle === 'T' ? '실행 가능한 자기관리 루틴' : '짧고 현실적인 자기관리 루틴';
}

function fallbackSummary(planContext) {
  return planContext.condition === 'TIRED' || planContext.condition === 'VERY_TIRED'
    ? (planContext.aiStyle === 'T' ? '현재 컨디션에 맞는 저강도 코스를 구성했습니다.' : '오늘은 무리하지 않고 현재 컨디션에 맞춰 이어가 볼게요.')
    : (planContext.aiStyle === 'T' ? '남은 시간과 buffer 안에서 실행 가능한 코스입니다.' : '남은 시간 안에서 실천 가능한 Plan B를 구성했어요.');
}

function normalizeDamiState(value, category) {
  const allowed = new Set(['SCHEDULE_CHECK', 'EXERCISE', 'EATING', 'MEDITATION', 'WALKING', 'RESTING', 'DEFAULT']);
  if (allowed.has(value)) return value;
  if (category === 'EXERCISE' || category === 'RUNNING') return 'EXERCISE';
  if (category === 'DIET') return 'EATING';
  if (category === 'MENTAL_HEALTH') return 'MEDITATION';
  if (category === 'WALK') return 'WALKING';
  return 'DEFAULT';
}

function fallbackStopReason(place, session) {
  if (session.condition === 'TIRED' || session.condition === 'VERY_TIRED') return session.aiStyle === 'T'
    ? '현재 컨디션에서 수행 가능한 강도입니다.'
    : '현재 컨디션에서도 부담 없이 이어갈 수 있어요.';
  return session.aiStyle === 'T'
    ? `${place?.name ?? '이 장소'}는 남은 시간 안에 수행할 수 있습니다.`
    : `${place?.name ?? '이 장소'}에서 현실적으로 실천할 수 있어요.`;
}

function noCandidateError() {
  return new ApiError(409, 'NO_CANDIDATE_EXPERIENCE', '현재 조건에 맞는 장소를 찾지 못했습니다.');
}

function uniqueStrings(values) {
  return Array.isArray(values) ? [...new Set(values.map(String))] : [];
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ApiError(422, 'VALIDATION_ERROR', `${field}가 올바르지 않습니다.`);
  return number;
}

function assertDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, 'VALIDATION_ERROR', 'date는 YYYY-MM-DD 형식이어야 합니다.');
  return value;
}

function assertTime(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 HH:MM 형식이어야 합니다.`);
  return value;
}

function assertEnum(value, set, field) {
  const normalized = String(value).toUpperCase();
  if (!set.has(normalized)) throw new ApiError(422, 'VALIDATION_ERROR', `${field} 값이 올바르지 않습니다.`);
  return normalized;
}

function toMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function toHHMM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
