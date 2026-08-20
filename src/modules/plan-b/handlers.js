import { ApiError } from '../../lib/errors.js';
import { distanceKm } from '../../lib/geo.js';
import { requireAuth } from '../auth/service.js';

const CONDITIONS = new Set(['VERY_GOOD', 'GOOD', 'NORMAL', 'TIRED', 'VERY_TIRED']);
const MODES = new Set(['SIMILAR', 'EASY', 'MINIMUM', 'AUTO']);
const CATEGORIES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);
const LOW_INTENSITY = new Set(['WALK', 'MENTAL_HEALTH', 'DIET']);
const DEFAULT_TRAVEL = 5;

// ============ 추천 생성 ============
export async function createRecommendations(context) {
  const user = requireAuth(context);
  const input = validateRecoRequest(context.body);
  const availableMinutes = timeDiffMinutes(input.startTime, input.endTime);
  if (availableMinutes <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'endTime은 startTime보다 늦어야 합니다.');
  }

  const ranked = await rankPlaces(context, input, availableMinutes, []);
  const session = context.store.createPlanBSession({
    userId: user.id,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    availableMinutes,
    selfCareCategory: input.selfCareCategory,
    customCategory: input.customCategory,
    condition: input.condition,
    continuityMode: input.continuityMode,
    location: input.location,
    summary: ranked.summary,
    recommendedPlaces: ranked.items.map((r) => ({ placeId: r.place.id, score: r.score, reason: r.reason }))
  });

  return {
    status: 201,
    data: {
      sessionId: session.id,
      availableMinutes,
      summary: ranked.summary,
      recommendedPlaces: ranked.items,
      suggestedCourse: []
    }
  };
}

export async function getSession(context) {
  const { session } = findOwnedSession(context);
  return {
    data: {
      id: session.id,
      status: session.status,
      currentStopOrder: session.currentStopOrder,
      stops: session.stops.map((s) => serializeStop(s, context.store))
    }
  };
}

export async function regenerate(context) {
  const { session } = findOwnedSession(context);
  const exclude = Array.isArray(context.body.excludePlaceIds) ? context.body.excludePlaceIds.map(String) : [];
  const input = {
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    selfCareCategory: session.selfCareCategory,
    customCategory: session.customCategory,
    condition: session.condition,
    continuityMode: session.continuityMode,
    location: { latitude: session.latitude, longitude: session.longitude }
  };
  const ranked = await rankPlaces(context, input, session.availableMinutes, exclude);
  context.store.updatePlanBSession(session.id, {
    summary: ranked.summary,
    recommendedPlaces: ranked.items.map((r) => ({ placeId: r.place.id, score: r.score, reason: r.reason }))
  });
  return {
    data: {
      sessionId: session.id,
      availableMinutes: session.availableMinutes,
      summary: ranked.summary,
      recommendedPlaces: ranked.items,
      suggestedCourse: []
    }
  };
}

// ============ 코스 ============
export async function getCourse(context) {
  const { session } = findOwnedSession(context);
  let stops = session.stops;
  // 코스가 비어있으면 추천 상위 2개로 초기화
  if (stops.length === 0 && session.recommendedPlaces.length) {
    stops = session.recommendedPlaces.slice(0, 2).map((r, i) => ({
      id: context.store.nextStopId(),
      order: i + 1,
      placeId: r.placeId,
      travelMinutes: DEFAULT_TRAVEL,
      durationMinutes: context.store.findPlaceById(r.placeId)?.durationMinutes ?? 30,
      status: 'NOT_STARTED'
    }));
    recompute(stops, session, context.store);
    context.store.updatePlanBSession(session.id, { stops });
  }
  return { data: buildCourseResponse(session, stops, context.store) };
}

export async function addStop(context) {
  const { session, raw } = findOwnedSession(context);
  const placeId = String(context.body.placeId ?? '');
  const place = context.store.findPlaceById(placeId);
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');

  const stops = [...session.stops];
  stops.push({
    id: context.store.nextStopId(),
    order: stops.length + 1,
    placeId,
    travelMinutes: DEFAULT_TRAVEL,
    durationMinutes: place.durationMinutes ?? 30,
    status: 'NOT_STARTED'
  });
  recompute(stops, session, context.store);
  context.store.updatePlanBSession(session.id, { stops });
  return { data: buildCourseResponse(session, stops, context.store) };
}

export async function removeStop(context) {
  const { session } = findOwnedSession(context);
  const stopId = context.params.stopId;
  const stops = session.stops.filter((s) => s.id !== stopId);
  if (stops.length === session.stops.length) {
    throw new ApiError(404, 'STOP_NOT_FOUND', '해당 코스 장소를 찾을 수 없습니다.');
  }
  stops.forEach((s, i) => (s.order = i + 1));
  recompute(stops, session, context.store);
  context.store.updatePlanBSession(session.id, { stops });
  return { data: buildCourseResponse(session, stops, context.store) };
}

export async function reorderStops(context) {
  const { session } = findOwnedSession(context);
  const stopIds = context.body.stopIds;
  if (!Array.isArray(stopIds) || stopIds.length !== session.stops.length) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'stopIds는 현재 코스의 모든 stop을 포함해야 합니다.');
  }
  const byId = new Map(session.stops.map((s) => [s.id, s]));
  const stops = stopIds.map((id) => byId.get(id));
  if (stops.some((s) => !s)) throw new ApiError(422, 'VALIDATION_ERROR', 'stopIds에 잘못된 값이 있습니다.');
  stops.forEach((s, i) => (s.order = i + 1));
  recompute(stops, session, context.store);
  context.store.updatePlanBSession(session.id, { stops });
  return { data: buildCourseResponse(session, stops, context.store) };
}

// ============ 진행 ============
export async function startSession(context) {
  const { session } = findOwnedSession(context);
  if (session.stops.length === 0) throw new ApiError(409, 'EMPTY_COURSE', '코스에 장소가 없습니다.');
  const stops = session.stops.map((s, i) => ({ ...s, status: i === 0 ? 'NOT_STARTED' : s.status }));
  context.store.updatePlanBSession(session.id, { status: 'IN_PROGRESS', currentStopOrder: 1, stops });
  return {
    data: { status: 'IN_PROGRESS', currentStop: { id: stops[0].id, order: stops[0].order } }
  };
}

export async function startStop(context) {
  const { session } = findOwnedSession(context);
  const stops = session.stops.map((s) =>
    s.id === context.params.stopId ? { ...s, status: 'IN_PROGRESS' } : s
  );
  if (!stops.some((s) => s.id === context.params.stopId)) {
    throw new ApiError(404, 'STOP_NOT_FOUND', '장소를 찾을 수 없습니다.');
  }
  const cur = stops.find((s) => s.id === context.params.stopId);
  context.store.updatePlanBSession(session.id, { stops, currentStopOrder: cur.order });
  return { data: { stopId: cur.id, status: 'IN_PROGRESS' } };
}

export async function completeStop(context) {
  const user = requireAuth(context);
  const { session } = findOwnedSession(context, user);
  const target = session.stops.find((s) => s.id === context.params.stopId);
  if (!target) throw new ApiError(404, 'STOP_NOT_FOUND', '장소를 찾을 수 없습니다.');

  const stops = session.stops.map((s) => (s.id === target.id ? { ...s, status: 'COMPLETED' } : s));
  const next = stops.find((s) => s.order === target.order + 1);

  // 활동 기록 생성 (정원 레벨업 재료)
  const place = context.store.findPlaceById(target.placeId);
  context.store.createActivity({
    userId: user.id,
    date: session.date,
    category: place?.activityType ?? null,
    placeId: target.placeId,
    durationMinutes: target.durationMinutes,
    source: 'PLAN_B'
  });

  const allDone = stops.every((s) => s.status === 'COMPLETED');
  context.store.updatePlanBSession(session.id, {
    stops,
    status: allDone ? 'COMPLETED' : 'IN_PROGRESS',
    currentStopOrder: next ? next.order : target.order
  });

  return {
    data: {
      completedStop: target.id,
      hasNextStop: Boolean(next),
      nextStop: next ? { id: next.id, order: next.order, placeId: next.placeId } : null
    }
  };
}

// ============ 랭킹 로직 ============
async function rankPlaces(context, input, availableMinutes, excludeIds) {
  const store = context.store;
  const exclude = new Set(excludeIds.map(String));
  let candidates = store.listPlaces({});

  // 카테고리 필터 (CUSTOM/미지정이면 전체)
  if (input.selfCareCategory && input.selfCareCategory !== 'CUSTOM') {
    const matched = candidates.filter((p) => p.activityType === input.selfCareCategory);
    if (matched.length) candidates = matched;
  }
  // 소요시간 필터 + 제외
  candidates = candidates.filter(
    (p) => !exclude.has(p.id) && (p.durationMinutes == null || p.durationMinutes <= availableMinutes)
  );

  const hasLocation = Number.isFinite(input.location?.latitude) && Number.isFinite(input.location?.longitude);
  const scored = candidates
    .map((place) => ({
      place,
      score: scorePlace(place, input, availableMinutes),
      distanceKm: hasLocation ? distanceKm(input.location.latitude, input.location.longitude, place.latitude, place.longitude) : null
    }))
    .sort((a, b) => hasLocation ? a.distanceKm - b.distanceKm || b.score - a.score : b.score - a.score)
    .slice(0, 5);

  // 이유 생성 (AI → 폴백)
  const reasonPayload = {
    situation: {
      condition: input.condition,
      continuityMode: input.continuityMode,
      availableMinutes
    },
    places: scored.map((s) => ({
      placeId: s.place.id,
      name: s.place.name,
      category: s.place.activityType,
      durationMinutes: s.place.durationMinutes
    }))
  };
  let ai = null;
  try {
    ai = await context.aiClient?.planBReasons(reasonPayload);
  } catch {
    ai = null;
  }
  const reasonMap = new Map((ai?.reasons ?? []).map((r) => [r.placeId, r.reason]));
  const summary =
    ai?.summary ??
    (isTired(input.condition)
      ? '현재 컨디션과 남은 시간을 고려해 부담 없이 이어갈 수 있는 장소를 골랐어요.'
      : '남은 시간 안에 기분 좋게 다녀올 수 있는 장소를 골랐어요.');

  const items = scored.map((s) => ({
    place: { ...serializePlace(s.place), distanceKm: s.distanceKm == null ? null : Math.round(s.distanceKm * 10) / 10 },
    score: Math.round(s.score * 100) / 100,
    reason: reasonMap.get(s.place.id) ?? fallbackReason(s.place, input)
  }));
  return { summary, items };
}

function scorePlace(place, input, availableMinutes) {
  let score = 0.5;
  // 카테고리 매칭
  if (input.selfCareCategory && place.activityType === input.selfCareCategory) score += 0.2;
  // 소요시간 적합 (남은 시간 대비 알맞을수록 +)
  if (place.durationMinutes != null) {
    const fit = place.durationMinutes / availableMinutes;
    if (fit <= 0.6) score += 0.15;
    else if (fit <= 1) score += 0.05;
  }
  // 컨디션: 피곤하면 저강도 선호
  if (isTired(input.condition)) {
    if (LOW_INTENSITY.has(place.activityType)) score += 0.15;
  } else if (input.condition === 'VERY_GOOD' || input.condition === 'GOOD') {
    if (place.activityType === 'RUNNING' || place.activityType === 'EXERCISE') score += 0.1;
  }
  // 계획 유지 수준
  if (input.continuityMode === 'MINIMUM' && place.durationMinutes != null && place.durationMinutes <= 25) score += 0.1;
  if (input.continuityMode === 'EASY' && LOW_INTENSITY.has(place.activityType)) score += 0.1;
  return Math.max(0, Math.min(1, score));
}

// ============ helpers ============
function validateRecoRequest(body) {
  const out = {};
  out.date = assertDate(body.date);
  out.startTime = assertTime(body.startTime, 'startTime');
  out.endTime = assertTime(body.endTime, 'endTime');
  out.selfCareCategory = body.selfCareCategory == null ? null : assertEnum(body.selfCareCategory, CATEGORIES, 'selfCareCategory');
  out.customCategory = body.customCategory ?? null;
  out.condition = body.condition == null ? null : assertEnum(body.condition, CONDITIONS, 'condition');
  out.continuityMode = body.continuityMode == null ? null : assertEnum(body.continuityMode, MODES, 'continuityMode');
  const loc = body.location ?? {};
  out.location = {
    latitude: loc.latitude != null ? Number(loc.latitude) : null,
    longitude: loc.longitude != null ? Number(loc.longitude) : null
  };
  return out;
}

function findOwnedSession(context, userArg) {
  const user = userArg ?? requireAuth(context);
  const session = context.store.findPlanBSession(context.params.sessionId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Plan B 세션을 찾을 수 없습니다.');
  if (session.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인 세션만 접근할 수 있습니다.');
  return { session, raw: session, user };
}

function recompute(stops, session, store) {
  let cursor = toMin(session.startTime);
  for (const stop of stops) {
    const place = store.findPlaceById(stop.placeId);
    stop.durationMinutes = stop.durationMinutes ?? place?.durationMinutes ?? 30;
    stop.travelMinutes = stop.travelMinutes ?? DEFAULT_TRAVEL;
    cursor += stop.travelMinutes;
    stop.startTime = toHHMM(cursor);
    cursor += stop.durationMinutes;
    stop.endTime = toHHMM(cursor);
  }
}

function buildCourseResponse(session, stops, store) {
  const totalMinutes = stops.reduce((sum, s) => sum + (s.travelMinutes ?? 0) + (s.durationMinutes ?? 0), 0);
  return {
    sessionId: session.id,
    totalMinutes,
    availableMinutes: session.availableMinutes,
    stops: stops.map((s) => serializeStop(s, store))
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
    status: stop.status
  };
}

function serializePlace(place) {
  return {
    id: place.id,
    name: place.name,
    category: place.activityType,
    district: districtOf(place.address),
    imageUrl: place.imageUrls?.[0] ?? null,
    durationMinutes: place.durationMinutes
  };
}

function fallbackReason(place, input) {
  if (isTired(input.condition) && LOW_INTENSITY.has(place.activityType)) {
    return '피곤한 상태에서도 부담 없이 다녀올 수 있어요.';
  }
  return '현재 위치에서 가까워 짧은 시간 안에 다녀오기 좋아요.';
}

function isTired(condition) {
  return condition === 'TIRED' || condition === 'VERY_TIRED';
}

function districtOf(address) {
  const parts = String(address ?? '').split(' ');
  return parts.find((p) => p.endsWith('구')) ?? parts[1] ?? '';
}

function assertDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  return value;
}

function assertTime(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 HH:MM 형식이어야 합니다.`);
  }
  return value;
}

function assertEnum(value, set, field) {
  const v = String(value).toUpperCase();
  if (!set.has(v)) throw new ApiError(422, 'VALIDATION_ERROR', `${field} 값이 올바르지 않습니다.`);
  return v;
}

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeDiffMinutes(start, end) {
  return toMin(end) - toMin(start);
}
