import { apiRequest } from './client';

export type ActivityCategory = 'WALK' | 'EXERCISE' | 'DIET' | 'RUNNING' | 'MENTAL_HEALTH' | string;

export type ArchiveStatistics = {
  visitedPlaceCount: number;
  completedPlanBCount: number;
  activityCount: number;
  createdPlaceCount: number;
  reviewCount: number;
  activitiesByCategory?: Record<string, number>;
};

export type ArchiveActivity = { id: string; date: string; category: ActivityCategory; placeId: string | null; durationMinutes: number | null; source: string | null };
export type SavedPlace = { id: string; name: string; category: string | null; primaryCategory: string | null; geometryType: string | null; address: string | null; imageUrl: string | null; durationMinutes: number | null };
export type ArchiveReview = { id: string; reaction: 'RECOMMEND' | 'DISAPPOINTED' | string; content: string | null; place: { id: string; name: string; category: string | null } | null; createdAt: string };
export type Journal = { id: string; date: string; placeId: string | null; planBSessionId: string | null; content: string; imageUrls: string[]; tags: string[]; createdAt: string; updatedAt: string };

export type ArchiveResponse = {
  statistics: ArchiveStatistics;
  recentActivities: ArchiveActivity[];
  savedPlacePreview: Array<{ id: string; name: string; imageUrl: string | null }>;
  journalDates: string[];
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getArchive(accessToken: string) {
  return apiRequest<ArchiveResponse>('/archive', { headers: authHeaders(accessToken) });
}

export function getArchiveStatistics(accessToken: string) {
  return apiRequest<ArchiveStatistics>('/archive/statistics', { headers: authHeaders(accessToken) });
}

export function getActivities(accessToken: string, params: { startDate?: string; endDate?: string; category?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
  return apiRequest<{ activities: ArchiveActivity[] }>(`/users/me/activities${query.toString() ? `?${query.toString()}` : ''}`, { headers: authHeaders(accessToken) });
}

export function getSavedPlaces(accessToken: string) {
  return apiRequest<{ places: SavedPlace[] }>('/users/me/saved-places', { headers: authHeaders(accessToken) });
}

export function getMyReviews(accessToken: string) {
  return apiRequest<{ reviews: ArchiveReview[] }>('/users/me/reviews', { headers: authHeaders(accessToken) });
}

export function updateReview(accessToken: string, reviewId: string, input: { reaction?: string; content?: string }) {
  return apiRequest<ArchiveReview>(`/reviews/${encodeURIComponent(reviewId)}`, { method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(input) });
}

export function deleteReview(accessToken: string, reviewId: string) {
  return apiRequest<null>(`/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE', headers: authHeaders(accessToken) });
}

export function getJournalCalendar(accessToken: string, year: number, month: number) {
  return apiRequest<{ year: number; month: number; dates: Array<{ date: string; journalCount: number }> }>(`/journals/calendar?year=${year}&month=${month}`, { headers: authHeaders(accessToken) });
}

export function getJournals(accessToken: string, date: string) {
  return apiRequest<{ journals: Journal[] }>(`/journals?date=${encodeURIComponent(date)}`, { headers: authHeaders(accessToken) });
}

export function getJournal(accessToken: string, journalId: string) {
  return apiRequest<Journal>(`/journals/${encodeURIComponent(journalId)}`, { headers: authHeaders(accessToken) });
}

export function updateJournal(accessToken: string, journalId: string, input: { content?: string; imageUrls?: string[]; tags?: string[] }) {
  return apiRequest<Journal>(`/journals/${encodeURIComponent(journalId)}`, { method: 'PATCH', headers: authHeaders(accessToken), body: JSON.stringify(input) });
}

export function deleteJournal(accessToken: string, journalId: string) {
  return apiRequest<null>(`/journals/${encodeURIComponent(journalId)}`, { method: 'DELETE', headers: authHeaders(accessToken) });
}

export type PlaceDetail = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  geometryType: string | null;
  imageUrls: string[];
  description: string | null;
  tip: string | null;
  creator: { id: string; username: string } | null;
  isSaved: boolean;
  reviewSummary: { count: number; recommendCount: number; disappointedCount: number } | null;
  reviews: ArchiveReview[];
};

export function getPlace(placeId: string, accessToken?: string) {
  return apiRequest<PlaceDetail>(`/places/${encodeURIComponent(placeId)}`, accessToken ? { headers: authHeaders(accessToken) } : {});
}
