import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { optionalAuth, requireAuth } from '../auth/service.js';

const ACTIVITY_TYPES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);

export function maskUsername(username) {
  if (!username) return null;
  if (username.length <= 2) return `${username[0] ?? ''}*`;
  return `${username.slice(0, 2)}${'*'.repeat(Math.max(1, username.length - 2))}`;
}

function serializePlaceCard(place) {
  return {
    id: place.id,
    name: place.name,
    category: place.primaryCategory ?? place.activityType,
    primaryCategory: place.primaryCategory ?? place.activityType,
    geometryType: place.geometryType ?? 'POINT',
    address: place.address,
    imageUrl: place.imageUrls?.[0] ?? null,
    durationMinutes: place.durationMinutes
  };
}

function serializePlaceDetail(place, store, viewer) {
  const creator = store.findUserById(place.creatorId);
  const summary = store.getPlaceReviewSummary(place.id);
  const reviews = store.listReviewsByPlace(place.id).slice(0, 20).map((r) => {
    const author = store.findUserById(r.userId);
    return {
      id: r.id,
      reaction: r.reaction,
      content: r.content,
      author: { id: r.userId, maskedUsername: maskUsername(author?.username) },
      isMine: viewer ? r.userId === viewer.id : false,
      createdAt: r.createdAt
    };
  });

  return {
    id: place.id,
    name: place.name,
    category: place.primaryCategory ?? place.activityType,
    primaryCategory: place.primaryCategory ?? place.activityType,
    address: place.address,
    geometryType: place.geometryType ?? 'POINT',
    point: pointFor(place),
    startPoint: place.geometryType === 'SEGMENT' ? point(place.startLatitude, place.startLongitude) : null,
    endPoint: place.geometryType === 'SEGMENT' ? point(place.endLatitude, place.endLongitude) : null,
    encodedPolyline: place.encodedPolyline ?? null,
    location: pointFor(place),
    durationMinutes: place.durationMinutes,
    experienceCategories: place.experienceCategories ?? [],
    intensity: place.intensity ?? null,
    indoorOutdoor: place.indoorOutdoor ?? null,
    recommendedTimeBands: place.recommendedTimeBands ?? [],
    soloFriendly: place.soloFriendly ?? null,
    priceLevel: place.priceLevel ?? null,
    tags: place.tags ?? [],
    status: place.status ?? 'ACTIVE',
    imageUrls: place.imageUrls ?? [],
    description: place.description,
    tip: place.tip,
    creator: { id: place.creatorId, maskedUsername: maskUsername(creator?.username) },
    isSaved: viewer ? store.isPlaceSaved(viewer.id, place.id) : false,
    reviewSummary: summary,
    reviews
  };
}

export async function getPlace(context) {
  const viewer = optionalAuth(context);
  const place = findPlaceOrThrow(context);
  return { data: serializePlaceDetail(place, context.store, viewer) };
}

export async function createPlace(context) {
  const user = requireAuth(context);
  const input = validateCreatePlace(context.body);
  const place = context.store.createPlace({ creatorId: user.id, ...input });
  return { status: 201, data: serializePlaceDetail(place, context.store, user), message: '장소가 등록되었습니다.' };
}

export async function patchPlace(context) {
  const user = requireAuth(context);
  const place = findPlaceOrThrow(context);
  if (place.creatorId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인이 등록한 장소만 수정할 수 있습니다.');
  const patch = validateCreatePlace(context.body, { partial: true });
  const updated = context.store.updatePlace(place.id, patch);
  return { data: serializePlaceDetail(updated, context.store, user), message: '장소가 수정되었습니다.' };
}

export async function deletePlace(context) {
  const user = requireAuth(context);
  const place = findPlaceOrThrow(context);
  if (place.creatorId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인이 등록한 장소만 삭제할 수 있습니다.');
  context.store.deletePlace(place.id);
  return { status: 204 };
}

export async function getMapPlaces(context) {
  const { southWestLat, southWestLng, northEastLat, northEastLng } = context.query;
  const bbox =
    southWestLat && southWestLng && northEastLat && northEastLng
      ? {
          swLat: Number(southWestLat),
          swLng: Number(southWestLng),
          neLat: Number(northEastLat),
          neLng: Number(northEastLng)
        }
      : null;
  const places = context.store.listPlaces({ bbox });
  return {
    data: {
      places: places.map((p) => ({
        id: p.id,
        name: p.name,
        geometryType: p.geometryType ?? 'POINT',
        point: pointFor(p),
        startPoint: p.geometryType === 'SEGMENT' ? point(p.startLatitude, p.startLongitude) : null,
        endPoint: p.geometryType === 'SEGMENT' ? point(p.endLatitude, p.endLongitude) : null,
        encodedPolyline: p.encodedPolyline ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        category: p.primaryCategory ?? p.activityType
      }))
    }
  };
}

export async function searchPlaces(context) {
  const keyword = context.query.keyword ? String(context.query.keyword) : '';
  const lat = context.query.lat ? Number(context.query.lat) : null;
  const lng = context.query.lng ? Number(context.query.lng) : null;
  let places = context.store.listPlaces({ keyword });
  if (lat != null && lng != null) {
    places = places
      .map((p) => ({ p, d: distance(lat, lng, p.pointLatitude ?? p.startLatitude ?? p.latitude, p.pointLongitude ?? p.startLongitude ?? p.longitude) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
  }
  return { data: { places: places.map(serializePlaceCard) } };
}

export async function savePlace(context) {
  const user = requireAuth(context);
  const place = findPlaceOrThrow(context);
  context.store.savePlace(user.id, place.id);
  return { data: { placeId: place.id, isSaved: true }, message: '장소를 저장했습니다.' };
}

export async function unsavePlace(context) {
  const user = requireAuth(context);
  const placeId = context.params.placeId;
  context.store.unsavePlace(user.id, placeId);
  return { data: { placeId, isSaved: false }, message: '저장을 해제했습니다.' };
}

export async function getSavedPlaces(context) {
  const user = requireAuth(context);
  return { data: { places: context.store.listSavedPlaces(user.id).map(serializePlaceCard) } };
}

export async function getMyPlaces(context) {
  const user = requireAuth(context);
  const places = context.store.listPlaces({ creatorId: user.id });
  return { data: { places: places.map(serializePlaceCard) } };
}

export async function getRealtimeRecommendations(context) {
  const user = requireAuth(context);
  const lat = context.query.lat ? Number(context.query.lat) : null;
  const lng = context.query.lng ? Number(context.query.lng) : null;
  let places = context.store.listPlaces({});
  if (lat != null && lng != null) {
    places = places
      .map((p) => ({ p, d: distance(lat, lng, p.pointLatitude ?? p.startLatitude ?? p.latitude, p.pointLongitude ?? p.startLongitude ?? p.longitude) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
  }
  return { data: { places: places.slice(0, 5).map(serializePlaceCard) } };
}

export async function getScheduleRecommendations(context) {
  const user = requireAuth(context);
  const date = context.query.date ? String(context.query.date) : new Date().toISOString().slice(0, 10);
  // 그날 자기관리 일정 사이 빈 시간에 추천 장소 매칭 (간단 버전)
  const places = context.store.listPlaces({}).slice(0, 3);
  const slots = ['13:00', '15:30', '18:00'];
  const recommendations = places.map((p, i) => ({
    placeId: p.id,
    name: p.name,
    category: p.activityType,
    recommendedTime: { start: slots[i], end: addMinutes(slots[i], p.durationMinutes ?? 30) }
  }));
  return { data: { date, recommendations } };
}

// ---------- helpers ----------
function findPlaceOrThrow(context) {
  const place = context.store.findPlaceById(context.params.placeId);
  if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  return place;
}

function validateCreatePlace(body, { partial = false } = {}) {
  const out = {};
  const need = (f) => !partial || body[f] !== undefined;
  if (need('name')) out.name = assertRequiredString(body.name, 'name', { min: 1, max: 100 });
  if (need('address')) out.address = assertRequiredString(body.address, 'address', { min: 1, max: 255 });
  if (need('activityType') || body.primaryCategory !== undefined) {
    const t = String(body.primaryCategory ?? body.activityType ?? '').toUpperCase();
    if (!ACTIVITY_TYPES.has(t)) throw new ApiError(422, 'VALIDATION_ERROR', 'activityType이 올바르지 않습니다.');
    out.activityType = t;
    out.primaryCategory = t;
  }
  if (need('description')) out.description = assertRequiredString(body.description, 'description', { min: 1, max: 1000 });
  if (body.durationMinutes !== undefined) {
    const n = Number(body.durationMinutes);
    if (!Number.isInteger(n) || n <= 0 || n > 1440) throw new ApiError(422, 'VALIDATION_ERROR', 'durationMinutes가 올바르지 않습니다.');
    out.durationMinutes = n;
  }
  if (body.tip !== undefined) out.tip = body.tip === null ? null : assertRequiredString(body.tip, 'tip', { min: 1, max: 500 });
  if (body.latitude !== undefined) out.latitude = body.latitude === null ? null : Number(body.latitude);
  if (body.longitude !== undefined) out.longitude = body.longitude === null ? null : Number(body.longitude);
  if (body.imageUrls !== undefined) {
    if (!Array.isArray(body.imageUrls)) throw new ApiError(422, 'VALIDATION_ERROR', 'imageUrls는 배열이어야 합니다.');
    out.imageUrls = body.imageUrls.map((u) => assertRequiredString(u, 'imageUrls[]', { min: 1, max: 2048 }));
  }
  if (body.geometryType !== undefined || !partial) {
    const geometryType = String(body.geometryType ?? (body.startPoint || body.endPoint ? 'SEGMENT' : 'POINT')).toUpperCase();
    if (!['POINT', 'SEGMENT'].includes(geometryType)) throw new ApiError(422, 'VALIDATION_ERROR', 'geometryType은 POINT 또는 SEGMENT여야 합니다.');
    out.geometryType = geometryType;
    if (geometryType === 'POINT') {
      const pointInput = body.point ?? (body.latitude !== undefined || body.longitude !== undefined
        ? { latitude: body.latitude, longitude: body.longitude }
        : null);
      if (!partial && !validPoint(pointInput)) throw new ApiError(422, 'VALIDATION_ERROR', 'POINT 장소는 point 좌표가 필요합니다.');
      if (pointInput) {
        const normalized = normalizePoint(pointInput);
        out.latitude = normalized.latitude;
        out.longitude = normalized.longitude;
        out.pointLatitude = normalized.latitude;
        out.pointLongitude = normalized.longitude;
      }
    } else {
      if (!partial && (!validPoint(body.startPoint) || !validPoint(body.endPoint))) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'SEGMENT 장소는 startPoint와 endPoint가 필요합니다.');
      }
      if (body.startPoint) {
        const start = normalizePoint(body.startPoint);
        out.startLatitude = start.latitude;
        out.startLongitude = start.longitude;
      }
      if (body.endPoint) {
        const end = normalizePoint(body.endPoint);
        out.endLatitude = end.latitude;
        out.endLongitude = end.longitude;
      }
      if (body.encodedPolyline !== undefined) out.encodedPolyline = body.encodedPolyline;
    }
  }
  if (body.experienceCategories !== undefined) out.experienceCategories = stringArray(body.experienceCategories, 'experienceCategories');
  if (body.recommendedTimeBands !== undefined) out.recommendedTimeBands = stringArray(body.recommendedTimeBands, 'recommendedTimeBands');
  if (body.tags !== undefined) out.tags = stringArray(body.tags, 'tags');
  if (body.intensity !== undefined) out.intensity = body.intensity;
  if (body.indoorOutdoor !== undefined) out.indoorOutdoor = body.indoorOutdoor;
  if (body.soloFriendly !== undefined) out.soloFriendly = Boolean(body.soloFriendly);
  if (body.priceLevel !== undefined) out.priceLevel = body.priceLevel;
  if (body.status !== undefined) out.status = body.status;
  return out;
}

function point(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

function pointFor(place) {
  return point(place.pointLatitude ?? place.latitude, place.pointLongitude ?? place.longitude);
}

function validPoint(value) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
}

function normalizePoint(value) {
  if (!validPoint(value)) throw new ApiError(422, 'VALIDATION_ERROR', '좌표가 올바르지 않습니다.');
  return point(value.latitude, value.longitude);
}

function stringArray(value, field) {
  if (!Array.isArray(value)) throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 배열이어야 합니다.`);
  return value.map((item) => assertRequiredString(item, `${field}[]`, { min: 1, max: 100 }));
}

function distance(lat1, lng1, lat2, lng2) {
  if (lat2 == null || lng2 == null) return Number.POSITIVE_INFINITY;
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + (minutes ?? 0);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export { serializePlaceCard, serializePlaceDetail };
