import { apiRequest } from './client';
import type { GardenData } from './garden';

export type MyPageResponse = {
  user: { id: string; username: string; profileImageUrl: string | null };
  selfCareProfile: { summary: string | null } | null;
  neighbors: { count: number; preview: Array<{ id: string; username: string; profileImageUrl: string | null }> };
  garden: GardenData;
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getMyPage(accessToken: string) {
  return apiRequest<MyPageResponse>('/users/me/page', { headers: authHeaders(accessToken) });
}

export function getNeighbors(accessToken: string) {
  return apiRequest<{ neighbors: Array<{ id: string; username: string; profileImageUrl: string | null }> }>('/users/me/neighbors', { headers: authHeaders(accessToken) });
}

export function getGarden(accessToken: string) {
  return apiRequest<{ garden: unknown }>('/users/me/garden', { headers: authHeaders(accessToken) });
}
