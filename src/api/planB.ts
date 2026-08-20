import { apiRequest } from './client';
import type { Coordinates, BackendPlaceCoordinates, GeometryType } from '../frontend/components/map/map.types';

export type PlanBCondition = 'VERY_GOOD' | 'GOOD' | 'NORMAL' | 'TIRED' | 'VERY_TIRED';
export type PlanBContinuityMode = 'SIMILAR' | 'EASY' | 'MINIMUM' | 'AUTO';
export type PlanBCategory = 'EXERCISE' | 'DIET' | 'WALK' | 'RUNNING' | 'MENTAL_HEALTH' | 'CUSTOM';
export type PlanBStatus = 'RECOMMENDED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type StopStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

type BackendPlace = {
  id: string;
  name: string;
  geometryType?: GeometryType;
  category?: string | null;
  primaryCategory?: string | null;
  point?: BackendPlaceCoordinates | null;
  startPoint?: BackendPlaceCoordinates | null;
  endPoint?: BackendPlaceCoordinates | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  address?: string | null;
  durationMinutes?: number | null;
  description?: string | null;
  tip?: string | null;
  intensity?: string | null;
  reviewSummary?: { count: number; recommendCount: number; disappointedCount: number } | null;
  reviews?: Array<{ id: string; reaction: string; content: string; createdAt: string }>;
  geometry?: { encodedPolyline?: string | null } | null;
  encodedPolyline?: string | null;
  [key: string]: unknown;
};

export type PlanBPlace = {
  id: string;
  name: string;
  geometryType: GeometryType;
  category: string | null;
  primaryCategory: string | null;
  point: Coordinates | null;
  startPoint: Coordinates | null;
  endPoint: Coordinates | null;
  imageUrl: string | null;
  imageUrls: string[];
  address: string | null;
  durationMinutes: number | null;
  description: string | null;
  tip: string | null;
  intensity: string | null;
  reviewSummary: { count: number; recommendCount: number; disappointedCount: number } | null;
  reviews: Array<{ id: string; reaction: string; content: string; createdAt: string }>;
  encodedPolyline: string | null;
};

export type PlanBStop = {
  id: string;
  order: number;
  place: PlanBPlace;
  travelMinutes: number;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  miniMission: string | null;
  status: StopStatus;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
};

export type PlanBResponse = {
  sessionId: string;
  date?: string;
  currentStopOrder?: number | null;
  status: PlanBStatus;
  availableMinutes: number;
  bufferMinutes: number;
  usableMinutes: number;
  aiStyle: 'T' | 'F';
  reframedGoal: { originalGoal: string; newGoal: string; reason: string };
  summary: string | null;
  courseConcept: string | null;
  damiState: string | null;
  course: { totalMinutes: number; stops: PlanBStop[]; finalTravel: unknown };
};

export type PlanBInput = {
  date: string;
  startTime: string;
  endTime: string;
  brokenScheduleId?: string | null;
  selfCareCategory?: PlanBCategory | null;
  customCategory?: string | null;
  condition?: PlanBCondition | null;
  continuityMode?: PlanBContinuityMode | null;
  location: { latitude: number; longitude: number } | null;
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function point(value: BackendPlaceCoordinates | null | undefined) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))
    ? { lat: Number(value.latitude), lng: Number(value.longitude) }
    : null;
}

export function adaptPlanBPlace(place: BackendPlace): PlanBPlace {
  return {
    id: place.id,
    name: place.name,
    geometryType: place.geometryType ?? 'POINT',
    category: place.category ?? null,
    primaryCategory: place.primaryCategory ?? place.category ?? null,
    point: point(place.point),
    startPoint: point(place.startPoint),
    endPoint: point(place.endPoint),
    imageUrl: place.imageUrl ?? place.imageUrls?.[0] ?? null,
    imageUrls: place.imageUrls ?? (place.imageUrl ? [place.imageUrl] : []),
    address: place.address ?? null,
    durationMinutes: place.durationMinutes ?? null,
    description: place.description ?? null,
    tip: place.tip ?? null,
    intensity: place.intensity ?? null,
    reviewSummary: place.reviewSummary ?? null,
    reviews: place.reviews ?? [],
    encodedPolyline: place.encodedPolyline ?? place.geometry?.encodedPolyline ?? null
  };
}

function adaptStop(stop: BackendStop): PlanBStop {
  return { ...stop, place: adaptPlanBPlace(stop.place) };
}

type BackendStop = Omit<PlanBStop, 'place'> & { place: BackendPlace };
type BackendPlanBResponse = Omit<PlanBResponse, 'course'> & { course: Omit<PlanBResponse['course'], 'stops'> & { stops: BackendStop[] } };

function adaptResponse(response: BackendPlanBResponse): PlanBResponse {
  return { ...response, course: { ...response.course, stops: response.course.stops.map(adaptStop) } };
}

export function createPlanBRecommendations(accessToken: string, input: PlanBInput) {
  return apiRequest<BackendPlanBResponse>('/plan-b/recommendations', { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(input) }).then(adaptResponse);
}

export function getPlanBSession(accessToken: string, sessionId: string) {
  return apiRequest<BackendPlanBResponse>(`/plan-b/${encodeURIComponent(sessionId)}`, { headers: authHeaders(accessToken) }).then(adaptResponse);
}

export function getPlanBCourse(accessToken: string, sessionId: string) {
  return apiRequest<BackendPlanBResponse>(`/plan-b/${encodeURIComponent(sessionId)}/course`, { headers: authHeaders(accessToken) }).then(adaptResponse);
}

export function addPlanBStop(accessToken: string, sessionId: string, placeId: string, insertAfterStopId?: string | null) {
  return apiRequest<BackendPlanBResponse>(`/plan-b/${encodeURIComponent(sessionId)}/course/stops`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ placeId, insertAfterStopId: insertAfterStopId ?? null }) }).then(adaptResponse);
}

export function removePlanBStop(accessToken: string, sessionId: string, stopId: string) {
  return apiRequest<BackendPlanBResponse>(`/plan-b/${encodeURIComponent(sessionId)}/course/stops/${encodeURIComponent(stopId)}`, { method: 'DELETE', headers: authHeaders(accessToken) }).then(adaptResponse);
}

export function reorderPlanBStops(accessToken: string, sessionId: string, stopIds: string[]) {
  return apiRequest<BackendPlanBResponse>(`/plan-b/${encodeURIComponent(sessionId)}/course/order`, { method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify({ stopIds }) }).then(adaptResponse);
}

export function startPlanB(accessToken: string, sessionId: string) {
  return apiRequest<{ status: 'IN_PROGRESS'; currentStop: { id: string; order: number } }>(`/plan-b/${encodeURIComponent(sessionId)}/start`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) });
}

export function startPlanBStop(accessToken: string, sessionId: string, stopId: string) {
  return apiRequest<{ stopId: string; status: 'IN_PROGRESS' }>(`/plan-b/${encodeURIComponent(sessionId)}/stops/${encodeURIComponent(stopId)}/start`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) });
}

export function completePlanBStop(accessToken: string, sessionId: string, stopId: string) {
  return apiRequest<{ completedStopId: string; hasNextStop: boolean; nextStop: { id: string; placeId: string } | null; sessionStatus: PlanBStatus }>(`/plan-b/${encodeURIComponent(sessionId)}/stops/${encodeURIComponent(stopId)}/complete`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) });
}

export function skipPlanBStop(accessToken: string, sessionId: string, stopId: string) {
  return apiRequest<{ skippedStopId: string; hasNextStop: boolean; nextStop: { id: string; placeId: string } | null; sessionStatus: PlanBStatus }>(`/plan-b/${encodeURIComponent(sessionId)}/stops/${encodeURIComponent(stopId)}/skip`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) });
}

export function getPlaceDetail(accessToken: string, placeId: string) {
  return apiRequest<BackendPlace>(`/places/${encodeURIComponent(placeId)}`, { headers: authHeaders(accessToken) }).then(adaptPlanBPlace);
}

export function createPlaceReview(accessToken: string, placeId: string, input: { reaction: 'RECOMMEND' | 'DISAPPOINTED'; content?: string; planBSessionId?: string | null }) {
  return apiRequest<unknown>(`/places/${encodeURIComponent(placeId)}/reviews`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(input) });
}

export function createJournal(accessToken: string, input: { date: string; placeId?: string | null; planBSessionId?: string | null; content: string; imageUrls?: string[]; tags?: string[] }) {
  return apiRequest<unknown>('/journals', { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(input) });
}

export function coordinatesForPlanBPlace(place: PlanBPlace): Coordinates | undefined {
  return place.point ?? undefined;
}
