import { apiRequest } from './client';

export type SelfCareCategory = 'EXERCISE' | 'DIET' | 'WALK' | 'RUNNING' | 'MENTAL_HEALTH' | 'CUSTOM';

export type Schedule = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  isFixed: boolean;
  selfCareCategory?: SelfCareCategory | null;
};

export type ScheduleInput = Omit<Schedule, 'id'>;

export type ScheduleWriteInput = {
  date: string;
  startTime: string;
  endTime?: string | null;
  title: string;
  isFixed: boolean;
  selfCareCategory?: SelfCareCategory | null;
};

type BackendSchedule = Schedule & {
  location?: unknown;
  placeId?: string | null;
  source?: string;
};

type DayResponse = { date: string; schedules: BackendSchedule[] };

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function normalizeSchedule(schedule: BackendSchedule): Schedule {
  return {
    id: schedule.id,
    date: schedule.date,
    startTime: schedule.startTime,
    endTime: schedule.endTime ?? '',
    title: schedule.title,
    isFixed: schedule.isFixed,
    selfCareCategory: schedule.selfCareCategory ?? null
  };
}

export function getDaySchedules(accessToken: string, date: string) {
  return apiRequest<DayResponse>(`/schedules/day?date=${encodeURIComponent(date)}`, {
    headers: authHeaders(accessToken)
  }).then((response) => ({ date: response.date, schedules: response.schedules.map(normalizeSchedule) }));
}

/**
 * The backend week endpoint is SUN-SAT. The UI's main calendar is MON-SUN,
 * so the adapter deliberately reads the seven canonical local dates.
 */
export async function getSchedulesForDates(accessToken: string, dates: string[]) {
  const days = await Promise.all(dates.map((date) => getDaySchedules(accessToken, date)));
  return days.flatMap((day) => day.schedules);
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
