export const MONDAY_FIRST_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const SUNDAY_FIRST_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(value: string, amount: number) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function getWeekDates(value: string, weekStartsOn: 'monday' | 'sunday' = 'monday') {
  const date = parseDateKey(value);
  const day = date.getDay();
  const distance = weekStartsOn === 'monday' ? (day + 6) % 7 : day;
  const start = addDays(value, -distance);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatHeaderDate(value: string) {
  const date = parseDateKey(value);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase();
  return `${value.replaceAll('-', '.')} ${weekday}`;
}

export function formatKoreanMonth(value: string) {
  return `${parseDateKey(value).getMonth() + 1}월`;
}

export function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(parseDateKey(value));
}

export function timeToMinutes(value: string | null | undefined) {
  if (!value) return 24 * 60;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export type Meridiem = 'AM' | 'PM';

export function canonicalTo12Hour(value: string) {
  const totalMinutes = timeToMinutes(value);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  return {
    meridiem: hours24 >= 12 ? 'PM' as const : 'AM' as const,
    hour: hours24 % 12 || 12,
    minute: totalMinutes % 60
  };
}

export function twelveHourToCanonical(meridiem: Meridiem, hour: number, minute: number) {
  const normalizedHour = hour === 12 ? 0 : hour;
  const hours24 = normalizedHour + (meridiem === 'PM' ? 12 : 0);
  return `${String(hours24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isCanonicalTime(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isTimeAfter(start: string | null | undefined, end: string | null | undefined) {
  return isCanonicalTime(start) && isCanonicalTime(end) && timeToMinutes(end) > timeToMinutes(start);
}

export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimeRange(startTime: string, endTime: string | null) {
  return endTime ? `${formatTime(startTime)}~${formatTime(endTime)}` : `${formatTime(startTime)}~`;
}

export function formatTime(value: string) {
  if (!isCanonicalTime(value)) return value;
  const parsed = canonicalTo12Hour(value);
  return `${parsed.meridiem} ${parsed.hour}:${String(parsed.minute).padStart(2, '0')}`;
}

export function weekOfMonthLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getMonth() + 1}월 ${Math.ceil(date.getDate() / 7)}주차`;
}
