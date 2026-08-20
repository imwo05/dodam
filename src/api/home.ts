import { apiRequest } from './client';

export type HomeSchedule = {
  id: string;
  startTime: string;
  endTime: string | null;
  title: string;
  selfCareCategory?: string | null;
};

export type HomePlace = {
  id: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  durationMinutes?: number | null;
};

export type HomeResponse = {
  date: string;
  user: { name: string };
  dailySchedules: HomeSchedule[];
  realtimeRecommendedPlaces: HomePlace[];
  savedPlaces: HomePlace[];
  garden: unknown;
};

export function getHome(accessToken: string, date: string) {
  return apiRequest<HomeResponse>(`/home?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
