import { apiRequest } from './client';
import type { BackendPlace, Coordinates, GeometryType, Place } from '../frontend/components/map/map.types';

export type PlaceCategory = 'EXERCISE' | 'DIET' | 'WALK' | 'RUNNING' | 'MENTAL_HEALTH' | 'CUSTOM';

export type PlaceCreateInput = {
  name: string;
  address: string;
  activityType: PlaceCategory;
  geometryType: GeometryType;
  point?: { latitude: number; longitude: number };
  startPoint?: { latitude: number; longitude: number };
  endPoint?: { latitude: number; longitude: number };
  description: string;
  tip: string;
  durationMinutes?: number;
  atmosphereTags?: string[];
  intensity?: 'LOW' | 'MEDIUM' | 'HIGH';
  imageUrls?: string[];
};

export type PlaceDetail = {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  primaryCategory: string | null;
  geometryType: GeometryType;
  geometry: {
    type: GeometryType;
    point: BackendPlace['point'];
    start: BackendPlace['startPoint'];
    end: BackendPlace['endPoint'];
    encodedPolyline: string | null;
  };
  imageUrls: string[];
  description: string;
  tip: string | null;
  durationMinutes: number | null;
  atmosphereTags: string[];
  intensity: string | null;
  creator: { id: string; maskedUsername: string | null } | null;
  isSaved: boolean;
  reviewSummary: { recommendCount: number; disappointedCount: number; count?: number } | null;
  reviews: unknown[];
};

export type MapBounds = {
  southWestLat: number;
  southWestLng: number;
  northEastLat: number;
  northEastLng: number;
};

export type PlaceImageUpload = {
  uploadUrl: string;
  fileUrl: string;
  path: string;
  method: 'PUT';
  headers: Record<string, string>;
};

function authHeaders(accessToken: string) {
  return { Authorization: 'Bearer ' + accessToken };
}

export function backendPointToCoordinates(point?: BackendPlace['point'] | null): Coordinates | undefined {
  return point ? { lat: point.latitude, lng: point.longitude } : undefined;
}

export function backendPlaceToMapPlace(place: BackendPlace): Place {
  const point = backendPointToCoordinates(place.point);
  const startPoint = backendPointToCoordinates(place.startPoint);
  const endPoint = backendPointToCoordinates(place.endPoint);
  return {
    id: place.id,
    name: place.name,
    geometryType: place.geometryType,
    geometry: place.geometryType === 'SEGMENT' && startPoint && endPoint
      ? { type: 'SEGMENT', startPoint, endPoint }
      : point
        ? { type: 'POINT', point }
        : undefined,
    category: place.category ?? place.primaryCategory ?? null,
    categories: place.categories ?? [],
    image: place.imageUrl ?? place.imageUrls?.[0] ?? null,
    address: place.address ?? null,
    durationMinutes: place.durationMinutes ?? null
  };
}

export function placeDetailToMapPlace(detail: PlaceDetail): Place {
  return backendPlaceToMapPlace({
    id: detail.id,
    name: detail.name,
    geometryType: detail.geometryType,
    point: detail.geometry.point,
    startPoint: detail.geometry.start,
    endPoint: detail.geometry.end,
    category: detail.category,
    primaryCategory: detail.primaryCategory,
    imageUrls: detail.imageUrls,
    address: detail.address,
    durationMinutes: detail.durationMinutes
  });
}

export function getMapPlaces(bounds?: MapBounds) {
  const params = new URLSearchParams();
  if (bounds) {
    params.set('southWestLat', String(bounds.southWestLat));
    params.set('southWestLng', String(bounds.southWestLng));
    params.set('northEastLat', String(bounds.northEastLat));
    params.set('northEastLng', String(bounds.northEastLng));
  }
  return apiRequest<{ places: BackendPlace[] }>('/places/map' + (params.toString() ? '?' + params : ''))
    .then((response) => response.places.map(backendPlaceToMapPlace));
}

export function getPlace(placeId: string, accessToken?: string) {
  return apiRequest<PlaceDetail>('/places/' + encodeURIComponent(placeId), accessToken ? { headers: authHeaders(accessToken) } : {});
}

export function createPlace(accessToken: string, input: PlaceCreateInput) {
  return apiRequest<PlaceDetail>('/places', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  });
}

export function getMyPlaces(accessToken: string) {
  return apiRequest<{ places: BackendPlace[] }>('/users/me/places', { headers: authHeaders(accessToken) })
    .then((response) => response.places.map(backendPlaceToMapPlace));
}

export function savePlace(accessToken: string, placeId: string) {
  return apiRequest<{ placeId: string; isSaved: boolean }>('/places/' + encodeURIComponent(placeId) + '/save', {
    method: 'POST',
    headers: authHeaders(accessToken)
  });
}

export function unsavePlace(accessToken: string, placeId: string) {
  return apiRequest<{ placeId: string; isSaved: boolean }>('/places/' + encodeURIComponent(placeId) + '/save', {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  });
}

export function getSavedPlaceCards(accessToken: string) {
  return apiRequest<{ places: BackendPlace[] }>('/users/me/saved-places', { headers: authHeaders(accessToken) })
    .then((response) => response.places.map(backendPlaceToMapPlace));
}

export function reverseGeocode(point: Coordinates) {
  const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
  return apiRequest<{ address: string | null; latitude: number; longitude: number }>('/geo/reverse?' + params);
}

export function requestPlaceImageUpload(accessToken: string, file: File) {
  return apiRequest<PlaceImageUpload>('/uploads/presigned-url', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      type: 'PLACE',
      fileName: file.name,
      contentType: file.type,
      size: file.size
    })
  });
}

export async function uploadPlaceImage(accessToken: string, file: File) {
  const signed = await requestPlaceImageUpload(accessToken, file);
  const response = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: signed.headers,
    body: file
  });
  if (!response.ok) throw new Error('이미지 업로드에 실패했어요.');
  return signed.fileUrl;
}
