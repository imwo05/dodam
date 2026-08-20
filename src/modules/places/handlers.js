import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { optionalAuth, requireAuth } from '../auth/service.js';
import { haversineKm } from '../plan-b/route-provider.js';

const ACTIVITY_TYPES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);
const INTENSITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

export function maskUsername(username) {
  if (!username) return null;
  if (username.length <= 2) return `${username[0] ?? ''}*`;
  return `${username.slice(0, 2)}${'*'.repeat(Math.max(1, username.length - 2))}`;
}

export function serializePlaceCard(place) {
  return {
    id: place.id,
    sourceId: place.sourceId ?? null,
    name: place.name,
    category: place.primaryCategory ?? place.activityType,
    primaryCategory: place.primaryCategory ?? place.activityType,
    geometryType: place.geometryType ?? 'POINT',
    point: pointFor(place),
    startPoint: place.geometryType === 'SEGMENT' ? point(place.startLatitude, place.startLongitude) : null,
    endPoint: place.geometryType === 'SEGMENT' ? point(place.endLatitude, place.endLongitude) : null,
    address: place.address,
    district: place.district ?? null,
    imageUrl: place.imageUrls?.[0] ?? null,
    imageUrls: place.imageUrls ?? [],
    durationMinutes: place.durationMinutes ?? null,
    distanceMeters: place.distanceMeters ?? null,
    atmosphereTags: place.atmosphereTags ?? place.tags ?? []
  };
}

export function serializePlaceDetail(place, store, viewer, { isSaved } = {}) {
  const creator = place.creatorId ? store.findUserById(place.creatorId) : null;
  const summary = store.getPlaceReviewSummary?.(place.id) ?? { recommendCount: 0, disappointedCount: 0 };
  const reviews = (store.listReviewsByPlace?.(place.id) ?? []).slice(0, 20).map((review) => {
    const author = store.findUserById(review.userId);
    return {
      id: review.id,
      reaction: review.reaction,
      content: review.content,
      author: { id: review.userId, maskedUsername: maskUsername(author?.username) },
      isMine: viewer ? review.userId === viewer.id : false,
      createdAt: review.createdAt
    };
  });
  const saved = isSaved ?? (viewer ? Boolean(store.isPlaceSaved?.(viewer.id, place.id)) : false);
  const geometry = {
    type: place.geometryType ?? 'POINT',
    point: pointFor(place),
    start: place.geometryType === 'SEGMENT' ? point(place.startLatitude, place.startLongitude) : null,
    end: place.geometryType === 'SEGMENT' ? point(place.endLatitude, place.endLongitude) : null,
    encodedPolyline: place.encodedPolyline ?? null
  };

  return {
    id: place.id,
    sourceId: place.sourceId ?? null,
    name: place.name,
    category: place.primaryCategory ?? place.activityType,
    primaryCategory: place.primaryCategory ?? place.activityType,
    address: place.address,
    district: place.district ?? null,
    geometryType: geometry.type,
    geometry,
    point: geometry.point,
    startPoint: geometry.start,
    endPoint: geometry.end,
    encodedPolyline: geometry.encodedPolyline,
    location: geometry.point,
    durationMinutes: place.durationMinutes ?? null,
    distanceMeters: place.distanceMeters ?? null,
    experienceCategories: place.experienceCategories ?? [],
    sourceWellnessType: place.sourceWellnessType ?? place.wellnessType ?? null,
    intensity: place.intensity ?? null,
    atmosphereTags: place.atmosphereTags ?? place.tags ?? [],
    tags: place.tags ?? place.atmosphereTags ?? [],
    indoorOutdoor: place.indoorOutdoor ?? null,
    recommendedTimeBands: place.recommendedTimeBands ?? [],
    soloFriendly: place.soloFriendly ?? null,
    socialSuitability: place.socialSuitability ?? null,
    priceLevel: place.priceLevel ?? null,
    status: place.status ?? 'ACTIVE',
    source: place.source ?? 'USER',
    imageUrls: place.imageUrls ?? [],
    description: place.description ?? '',
    tip: place.tip ?? null,
    creator: creator ? { id: creator.id, maskedUsername: maskUsername(creator.username) } : null,
    isSaved: saved,
    reviewSummary: summary,
    reviews
  };
}

export async function getPlace(context) {
  const viewer = optionalAuth(context);
  const place = await findPlaceOrThrow(context);
  const isSaved = viewer ? await context.repositories.place.isSaved(viewer.id, place.id) : false;
  return { data: serializePlaceDetail(place, context.store, viewer, { isSaved }) };
}

export async function createPlace(context) {
  const user = requireAuth(context);
  const input = validateCreatePlace(context.body);
  const place = await context.repositories.place.create({ creatorId: user.id, source: 'USER', ...input });
  return {
    status: 201,
    data: serializePlaceDetail(place, context.store, user, { isSaved: false }),
    message: '장소가 등록되었습니다.'
  };
}

export async function patchPlace(context) {
  const user = requireAuth(context);
  const place = await findPlaceOrThrow(context, { includeInactive: true });
  if (place.creatorId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인이 등록한 장소만 수정할 수 있습니다.');
  const patch = validateCreatePlace(context.body, { partial: true, existing: place });
  const updated = await context.repositories.place.update(place.id, patch);
  if (!updated) throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  return {
    data: serializePlaceDetail(updated, context.store, user, {
      isSaved: await context.repositories.place.isSaved(user.id, updated.id)
    }),
    message: '장소가 수정되었습니다.'
  };
}

export async function deletePlace(context) {
  const user = requireAuth(context);
  const place = await findPlaceOrThrow(context, { includeInactive: true });
  if (place.creatorId !== user.id) throw new ApiError(403, 'FORBIDDEN', '본인이 등록한 장소만 삭제할 수 있습니다.');
  await context.repositories.place.delete(place.id);
  return { status: 204 };
}

export async function getMapPlaces(context) {
  const bounds = readBounds(context.query);
  const places = bounds
    ? await context.repositories.place.getInBounds(bounds)
    : await context.repositories.place.list({});
  return {
    data: {
      bounds,
      segmentBoundsRule: 'segment bounding box intersects the requested bounds',
      places: places.map(serializeMapPlace)
    }
  };
}

export async function searchPlaces(context) {
  const keyword = context.query.keyword ? String(context.query.keyword) : '';
  const lat = context.query.lat === undefined ? null : numberOrNull(context.query.lat);
  const lng = context.query.lng === undefined ? null : numberOrNull(context.query.lng);
  if ((lat == null) !== (lng == null)) throw new ApiError(422, 'VALIDATION_ERROR', 'lat과 lng를 함께 보내야 합니다.');
  let places = await context.repositories.place.search(keyword);
  if (lat != null && lng != null) {
    places = places
      .map((place) => ({ place, distance: distanceToPlaceMeters(lat, lng, place) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ place }) => place);
  }
  return { data: { places: places.map(serializePlaceCard) } };
}

export async function savePlace(context) {
  const user = requireAuth(context);
  const place = await findPlaceOrThrow(context);
  await context.repositories.place.savePlace(user.id, place.id);
  return { data: { placeId: place.id, isSaved: true }, message: '장소를 저장했습니다.' };
}

export async function unsavePlace(context) {
  const user = requireAuth(context);
  const placeId = String(context.params.placeId);
  await context.repositories.place.unsavePlace(user.id, placeId);
  return { data: { placeId, isSaved: false }, message: '저장을 해제했습니다.' };
}

export async function getSavedPlaces(context) {
  const user = requireAuth(context);
  const places = await context.repositories.place.getSavedPlaces(user.id);
  return { data: { places: places.map(serializePlaceCard) } };
}

export async function getMyPlaces(context) {
  const user = requireAuth(context);
  const places = await context.repositories.place.getByCreator(user.id);
  return { data: { places: places.map(serializePlaceCard) } };
}

export async function getRealtimeRecommendations(context) {
  requireAuth(context);
  const lat = context.query.lat === undefined ? null : numberOrNull(context.query.lat);
  const lng = context.query.lng === undefined ? null : numberOrNull(context.query.lng);
  let places = await context.repositories.place.list({});
  if (lat != null && lng != null) {
    places = places
      .map((place) => ({ place, distance: distanceToPlaceMeters(lat, lng, place) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ place }) => place);
  }
  return { data: { places: places.slice(0, 5).map(serializePlaceCard) } };
}

export async function getScheduleRecommendations(context) {
  requireAuth(context);
  const date = context.query.date ? String(context.query.date) : new Date().toISOString().slice(0, 10);
  const places = (await context.repositories.place.list({})).slice(0, 3);
  const slots = ['13:00', '15:30', '18:00'];
  const recommendations = places.map((place, index) => ({
    placeId: place.id,
    name: place.name,
    category: place.primaryCategory ?? place.activityType,
    geometryType: place.geometryType ?? 'POINT',
    recommendedTime: { start: slots[index], end: addMinutes(slots[index], place.durationMinutes ?? 30) }
  }));
  return { data: { date, recommendations } };
}

function serializeMapPlace(place) {
  return {
    id: place.id,
    sourceId: place.sourceId ?? null,
    name: place.name,
    geometryType: place.geometryType ?? 'POINT',
    point: pointFor(place),
    startPoint: place.geometryType === 'SEGMENT' ? point(place.startLatitude, place.startLongitude) : null,
    endPoint: place.geometryType === 'SEGMENT' ? point(place.endLatitude, place.endLongitude) : null,
    encodedPolyline: place.encodedPolyline ?? null,
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    category: place.primaryCategory ?? place.activityType,
    atmosphereTags: place.atmosphereTags ?? place.tags ?? [],
    intensity: place.intensity ?? null,
    durationMinutes: place.durationMinutes ?? null
  };
}

async function findPlaceOrThrow(context, { includeInactive = false } = {}) {
  const place = await context.repositories.place.getById(context.params.placeId, { includeInactive });
  if (!place || (!includeInactive && place.status !== 'ACTIVE') || place.status === 'DELETED') {
    throw new ApiError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  }
  return place;
}

function validateCreatePlace(body, { partial = false, existing = null } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const out = {};
  const need = (field) => !partial || input[field] !== undefined;
  if (need('name')) out.name = assertRequiredString(input.name, 'name', { min: 1, max: 100 });
  if (need('address')) out.address = assertRequiredString(input.address ?? '', 'address', { min: 0, max: 255 });
  if (need('activityType') || input.primaryCategory !== undefined || input.category !== undefined) {
    const category = String(input.primaryCategory ?? input.category ?? input.activityType ?? '').toUpperCase();
    if (!ACTIVITY_TYPES.has(category)) throw new ApiError(422, 'VALIDATION_ERROR', 'activityType이 올바르지 않습니다.');
    out.activityType = category;
    out.primaryCategory = category;
  }
  if (!partial && out.activityType === undefined) throw new ApiError(422, 'VALIDATION_ERROR', 'activityType이 필요합니다.');
  if (!partial || input.description !== undefined) out.description = assertRequiredString(input.description, 'description', { min: 1, max: 2000 });
  if (!partial || input.tip !== undefined) out.tip = assertRequiredString(input.tip, 'tip', { min: 1, max: 500 });
  if (input.durationMinutes !== undefined) out.durationMinutes = positiveInteger(input.durationMinutes, 'durationMinutes', 1440);
  if (input.distanceMeters !== undefined) out.distanceMeters = nonNegativeNumber(input.distanceMeters, 'distanceMeters');
  if (input.imageUrls !== undefined) {
    if (!Array.isArray(input.imageUrls)) throw new ApiError(422, 'VALIDATION_ERROR', 'imageUrls는 배열이어야 합니다.');
    out.imageUrls = input.imageUrls.map((url) => assertRequiredString(url, 'imageUrls[]', { min: 1, max: 2048 }));
  }
  if (input.tags !== undefined || input.atmosphereTags !== undefined) {
    const tags = input.atmosphereTags ?? input.tags;
    out.atmosphereTags = stringArray(tags, 'atmosphereTags');
    out.tags = out.atmosphereTags;
  }
  if (input.intensity !== undefined) {
    if (input.intensity !== null && !INTENSITIES.has(String(input.intensity).toUpperCase())) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'intensity가 올바르지 않습니다.');
    }
    out.intensity = input.intensity === null ? null : String(input.intensity).toUpperCase();
  }
  if (input.soloFriendly !== undefined) out.soloFriendly = input.soloFriendly === null ? null : Boolean(input.soloFriendly);
  if (input.indoorOutdoor !== undefined) out.indoorOutdoor = input.indoorOutdoor === null
    ? null
    : assertRequiredString(input.indoorOutdoor, 'indoorOutdoor', { min: 1, max: 50 });
  if (input.recommendedTimeBands !== undefined) out.recommendedTimeBands = stringArray(input.recommendedTimeBands, 'recommendedTimeBands');
  if (input.priceLevel !== undefined) out.priceLevel = input.priceLevel === null
    ? null
    : assertRequiredString(input.priceLevel, 'priceLevel', { min: 1, max: 20 });
  if (input.district !== undefined) out.district = input.district === null ? null : assertRequiredString(input.district, 'district', { min: 1, max: 100 });
  if (input.encodedPolyline !== undefined) out.encodedPolyline = input.encodedPolyline === null
    ? null
    : assertRequiredString(input.encodedPolyline, 'encodedPolyline', { min: 1, max: 100000 });
  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase();
    if (!['ACTIVE', 'HIDDEN'].includes(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'status가 올바르지 않습니다.');
    out.status = status;
  }

  const geometryType = String(input.geometryType ?? existing?.geometryType ?? inferGeometryType(input)).toUpperCase();
  if (!partial || input.geometryType !== undefined || input.point !== undefined || input.startPoint !== undefined
      || input.endPoint !== undefined || input.latitude !== undefined || input.longitude !== undefined
      || input.startLatitude !== undefined || input.startLongitude !== undefined
      || input.endLatitude !== undefined || input.endLongitude !== undefined) {
    out.geometryType = geometryType;
    if (geometryType === 'POINT') {
      const pointInput = input.point ?? pointFromFields(input, existing);
      if (!validPoint(pointInput)) throw new ApiError(422, 'VALIDATION_ERROR', 'POINT 장소는 point 좌표가 필요합니다.');
      const normalized = normalizePoint(pointInput);
      out.latitude = normalized.latitude;
      out.longitude = normalized.longitude;
      out.pointLatitude = normalized.latitude;
      out.pointLongitude = normalized.longitude;
    } else {
      const start = input.startPoint ?? pointFromFields(input, existing, 'start');
      const end = input.endPoint ?? pointFromFields(input, existing, 'end');
      if (!validPoint(start) || !validPoint(end)) throw new ApiError(422, 'VALIDATION_ERROR', 'SEGMENT 장소는 startPoint와 endPoint가 필요합니다.');
      const normalizedStart = normalizePoint(start);
      const normalizedEnd = normalizePoint(end);
      out.startLatitude = normalizedStart.latitude;
      out.startLongitude = normalizedStart.longitude;
      out.endLatitude = normalizedEnd.latitude;
      out.endLongitude = normalizedEnd.longitude;
    }
  }
  return out;
}

function inferGeometryType(input) {
  return input.startPoint || input.endPoint || input.startLatitude !== undefined || input.endLatitude !== undefined
    ? 'SEGMENT'
    : 'POINT';
}

function pointFromFields(input, existing = null, prefix = '') {
  const latitudeKey = prefix ? `${prefix}Latitude` : 'latitude';
  const longitudeKey = prefix ? `${prefix}Longitude` : 'longitude';
  const latitude = input[latitudeKey] ?? existing?.[latitudeKey] ?? (prefix ? null : existing?.pointLatitude ?? existing?.latitude);
  const longitude = input[longitudeKey] ?? existing?.[longitudeKey] ?? (prefix ? null : existing?.pointLongitude ?? existing?.longitude);
  return { latitude, longitude };
}

function validPoint(value) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
}

function normalizePoint(value) {
  if (!validPoint(value)) throw new ApiError(422, 'VALIDATION_ERROR', '좌표가 올바르지 않습니다.');
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ApiError(422, 'VALIDATION_ERROR', '좌표 범위가 올바르지 않습니다.');
  }
  return { latitude, longitude };
}

function point(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

function pointFor(place) {
  return place.geometryType === 'SEGMENT'
    ? null
    : point(place.pointLatitude ?? place.latitude, place.pointLongitude ?? place.longitude);
}

function readBounds(query) {
  const swLat = query.southWestLat ?? query.swLat;
  const swLng = query.southWestLng ?? query.swLng;
  const neLat = query.northEastLat ?? query.neLat;
  const neLng = query.northEastLng ?? query.neLng;
  if ([swLat, swLng, neLat, neLng].every((value) => value === undefined)) return null;
  const bounds = { swLat: numberOrNull(swLat), swLng: numberOrNull(swLng), neLat: numberOrNull(neLat), neLng: numberOrNull(neLng) };
  if (Object.values(bounds).some((value) => value == null)) throw new ApiError(422, 'VALIDATION_ERROR', '지도 bounds가 올바르지 않습니다.');
  if (bounds.swLat > bounds.neLat || bounds.swLng > bounds.neLng) throw new ApiError(422, 'VALIDATION_ERROR', '지도 bounds 순서가 올바르지 않습니다.');
  return bounds;
}

function distanceToPlaceMeters(latitude, longitude, place) {
  const candidates = place.geometryType === 'SEGMENT'
    ? [point(place.startLatitude, place.startLongitude), point(place.endLatitude, place.endLongitude)]
    : [pointFor(place)];
  return Math.min(...candidates.filter(Boolean).map((candidate) => haversineKm({ latitude, longitude }, candidate) * 1000), Number.POSITIVE_INFINITY);
}

function stringArray(value, field) {
  if (!Array.isArray(value)) throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 배열이어야 합니다.`);
  return [...new Set(value.map((item) => assertRequiredString(item, `${field}[]`, { min: 1, max: 100 })) )];
}

function positiveInteger(value, field, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > max) throw new ApiError(422, 'VALIDATION_ERROR', `${field}가 올바르지 않습니다.`);
  return number;
}

function nonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ApiError(422, 'VALIDATION_ERROR', `${field}가 올바르지 않습니다.`);
  return number;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addMinutes(hhmm, minutes) {
  const [hours, mins] = hhmm.split(':').map(Number);
  const total = hours * 60 + mins + Number(minutes ?? 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
