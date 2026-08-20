import { apiRequest } from './client';
import type { BackendPlace, BackendPlaceCoordinates, Coordinates, GeometryType, MapBounds, Place, PlaceGeometry } from '../frontend/components/map/map.types';

export type PlaceReview = {
  id: string;
  reaction: 'RECOMMEND' | 'DISAPPOINTED' | string;
  content: string;
  createdAt: string;
  author?: { id: string; maskedUsername: string | null };
  isMine?: boolean;
};

export type PlaceDetail = Place & {
  district?: string | null;
  imageUrls: string[];
  description: string | null;
  tip: string | null;
  reviewSummary: { count?: number; recommendCount: number; disappointedCount: number } | null;
  reviews: PlaceReview[];
  creator: { id: string; maskedUsername?: string | null; username?: string } | null;
  isSaved: boolean;
  source?: string | null;
};

export type PlaceWriteInput = {
  name: string;
  address: string;
  activityType: string;
  geometryType: GeometryType;
  point?: Coordinates;
  startPoint?: Coordinates;
  endPoint?: Coordinates;
  durationMinutes?: number;
  intensity?: string | null;
  description?: string;
  tip?: string | null;
  atmosphereTags?: string[];
};

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function coordinate(value: BackendPlaceCoordinates | null | undefined) {
  if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null;
  return { lat: Number(value.latitude), lng: Number(value.longitude) } satisfies Coordinates;
}

function placeGeometry(place: BackendPlace): PlaceGeometry | undefined {
  const geometryType = place.geometryType ?? place.geometry?.type ?? 'POINT';
  if (geometryType === 'SEGMENT') {
    const startPoint = coordinate(place.startPoint ?? place.geometry?.start);
    const endPoint = coordinate(place.endPoint ?? place.geometry?.end);
    if (!startPoint || !endPoint) return undefined;
    return { type: 'SEGMENT', startPoint, endPoint, encodedPolyline: place.encodedPolyline ?? place.geometry?.encodedPolyline ?? null };
  }
  const point = coordinate(place.point ?? place.geometry?.point ?? (place.latitude != null && place.longitude != null ? { latitude: place.latitude, longitude: place.longitude } : null));
  return point ? { type: 'POINT', point } : undefined;
}

export function adaptPlace(place: BackendPlace): Place {
  const geometry = placeGeometry(place);
  return {
    id: place.id,
    name: place.name,
    geometryType: place.geometryType ?? place.geometry?.type ?? 'POINT',
    geometry,
    category: place.category ?? place.primaryCategory ?? null,
    categories: place.categories ?? [],
    image: place.imageUrl ?? place.imageUrls?.[0] ?? null,
    address: place.address ?? null,
    durationMinutes: place.durationMinutes ?? null,
    intensity: place.intensity ?? null,
    description: place.description ?? null,
    tip: place.tip ?? null,
    atmosphereTags: place.atmosphereTags ?? [],
    isSaved: place.isSaved
  };
}

export function getMapPlaces(accessToken?: string, bounds?: MapBounds) {
  const query = bounds ? `?${new URLSearchParams(Object.entries(bounds).map(([key, value]) => [key, String(value)]))}` : '';
  return apiRequest<{ bounds: MapBounds | null; places: BackendPlace[] }>(`/places/map${query}`, { headers: authHeaders(accessToken) })
    .then((response) => ({ bounds: response.bounds, places: response.places.map(adaptPlace) }));
}

export function searchPlaces(accessToken: string, keyword: string, near?: Coordinates) {
  const query = new URLSearchParams({ keyword });
  if (near) { query.set('lat', String(near.lat)); query.set('lng', String(near.lng)); }
  return apiRequest<{ places: BackendPlace[] }>(`/places/search?${query}`, { headers: authHeaders(accessToken) })
    .then((response) => response.places.map(adaptPlace));
}

export function getPlaceDetail(accessToken: string, placeId: string) {
  return apiRequest<BackendPlace>(`/places/${encodeURIComponent(placeId)}`, { headers: authHeaders(accessToken) })
    .then((place) => ({ ...adaptPlace(place), imageUrls: [...(place.imageUrls ?? (place.imageUrl ? [place.imageUrl] : []))], description: place.description ?? null, tip: place.tip ?? null, atmosphereTags: place.atmosphereTags ?? [], reviewSummary: place.reviewSummary ?? null, reviews: place.reviews ?? [], creator: (place.creator as PlaceDetail['creator']) ?? null, isSaved: Boolean(place.isSaved), source: typeof place.source === 'string' ? place.source : null } satisfies PlaceDetail));
}

export function savePlace(accessToken: string, placeId: string) {
  return apiRequest<{ placeId: string; isSaved: boolean }>(`/places/${encodeURIComponent(placeId)}/save`, { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) });
}

export function unsavePlace(accessToken: string, placeId: string) {
  return apiRequest<{ placeId: string; isSaved: boolean }>(`/places/${encodeURIComponent(placeId)}/save`, { method: 'DELETE', headers: authHeaders(accessToken) });
}

export function createPlace(accessToken: string, input: PlaceWriteInput) {
  return apiRequest<BackendPlace>('/places', { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify(input) }).then((place) => getPlaceDetail(accessToken, place.id));
}

export function updatePlace(accessToken: string, placeId: string, input: Partial<PlaceWriteInput>) {
  return apiRequest<BackendPlace>(`/places/${encodeURIComponent(placeId)}`, { method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(input) }).then((place) => getPlaceDetail(accessToken, place.id));
}

export function deletePlace(accessToken: string, placeId: string) {
  return apiRequest<null>(`/places/${encodeURIComponent(placeId)}`, { method: 'DELETE', headers: authHeaders(accessToken) });
}

export function getMyPlaces(accessToken: string) {
  return apiRequest<{ places: BackendPlace[] }>('/users/me/places', { headers: authHeaders(accessToken) }).then((response) => response.places.map(adaptPlace));
}
