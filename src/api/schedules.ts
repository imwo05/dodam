import { apiRequest } from './client';

export type SelfCareCategory = 'EXERCISE' | 'DIET' | 'WALK' | 'RUNNING' | 'MENTAL_HEALTH' | 'CUSTOM';

export type Schedule = {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  isFixed: boolean;
  selfCareCategory?: SelfCareCategory | null;
  source?: string;
  createdAt: string;
  updatedAt: string | null;
};

export type ScheduleWriteInput = {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  isFixed: boolean;
  selfCareCategory?: SelfCareCategory | null;
};

export type ScheduleInput = ScheduleWriteInput;

type BackendSchedule = Schedule & {
  location?: unknown;
  placeId?: string | null;
  source?: string;
};

type DayResponse = { date: string; schedules: BackendSchedule[] };
type RangeResponse = { from: string; to: string; schedules: BackendSchedule[] };

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function normalizeSchedule(schedule: BackendSchedule): Schedule {
  return {
    id: schedule.id,
    userId: schedule.userId,
    date: schedule.date,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    title: schedule.title,
    isFixed: schedule.isFixed,
    selfCareCategory: schedule.selfCareCategory ?? null,
    source: schedule.source,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt ?? null
  };
}

export function getDaySchedules(accessToken: string, date: string) {
  return apiRequest<DayResponse>(`/schedules/day?date=${encodeURIComponent(date)}`, {
    headers: authHeaders(accessToken)
  }).then((response) => ({ date: response.date, schedules: response.schedules.map(normalizeSchedule) }));
}

export function getSchedulesRange(accessToken: string, from: string, to: string) {
  return apiRequest<RangeResponse>(`/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    headers: authHeaders(accessToken)
  }).then((response) => ({ from: response.from, to: response.to, schedules: response.schedules.map(normalizeSchedule) }));
}

/** Load arbitrary displayed dates through one inclusive backend range request. */
export async function getSchedulesForDates(accessToken: string, dates: string[]) {
  const uniqueDates = [...new Set(dates)].filter(Boolean).sort();
  if (!uniqueDates.length) return [];
  const response = await getSchedulesRange(accessToken, uniqueDates[0], uniqueDates[uniqueDates.length - 1]);
  const dateSet = new Set(uniqueDates);
  return response.schedules.filter((schedule) => dateSet.has(schedule.date));
}

export function createSchedule(accessToken: string, input: ScheduleWriteInput) {
  return apiRequest<BackendSchedule>('/schedules', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  }).then(normalizeSchedule);
}

export function createSchedules(accessToken: string, date: string, schedules: Omit<ScheduleWriteInput, 'date'>[]) {
  return apiRequest<{ date: string; schedules: BackendSchedule[] }>('/schedules/bulk', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ date, schedules })
  }).then((response) => ({ date: response.date, schedules: response.schedules.map(normalizeSchedule) }));
}

export function updateSchedule(accessToken: string, scheduleId: string, input: Partial<ScheduleWriteInput>) {
  return apiRequest<BackendSchedule>(`/schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input)
  }).then(normalizeSchedule);
}

export function deleteSchedule(accessToken: string, scheduleId: string) {
  return apiRequest<null>(`/schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  });
}
