import { ApiError } from '../../lib/errors.js';
import { assertRequiredString } from '../../lib/validation.js';
import { requireAuth } from '../auth/service.js';

const CATEGORIES = new Set(['EXERCISE', 'DIET', 'WALK', 'RUNNING', 'MENTAL_HEALTH', 'CUSTOM']);

export function serializeSchedule(s) {
  return {
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    isFixed: s.isFixed,
    selfCareCategory: s.selfCareCategory,
    placeId: s.placeId,
    source: s.source
  };
}

export async function createSchedule(context) {
  const user = requireAuth(context);
  const input = validateScheduleItem(context.body, { withDate: true });
  const schedule = context.store.createSchedule({ userId: user.id, ...input });
  return { status: 201, data: serializeSchedule(schedule), message: '일정이 추가되었습니다.' };
}

export async function bulkCreateSchedules(context) {
  const user = requireAuth(context);
  const date = assertDate(context.body.date, 'date');
  if (!Array.isArray(context.body.schedules) || context.body.schedules.length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'schedules 배열이 필요합니다.');
  }
  const created = context.body.schedules.map((item) => {
    const input = validateScheduleItem({ ...item, date }, { withDate: true });
    return serializeSchedule(context.store.createSchedule({ userId: user.id, ...input }));
  });
  return { status: 201, data: { date, schedules: created }, message: '초기 일정이 등록되었습니다.' };
}

export async function getWeekSchedules(context) {
  const user = requireAuth(context);
  const date = assertDate(context.query.date, 'date');
  const weekStart = getWeekStart(date);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(weekStart, i);
    days.push({ date: d, schedules: context.store.listSchedules({ userId: user.id, date: d }).map(serializeSchedule) });
  }
  return { data: { weekStart, weekEnd: addDays(weekStart, 6), days } };
}

export async function getDaySchedules(context) {
  const user = requireAuth(context);
  const date = assertDate(context.query.date, 'date');
  const schedules = context.store.listSchedules({ userId: user.id, date }).map(serializeSchedule);
  return { data: { date, schedules } };
}

export async function patchSchedule(context) {
  const user = requireAuth(context);
  const schedule = findOwnedSchedule(context, user.id);
  const patch = validateScheduleItem(context.body, { withDate: false, partial: true });
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', '수정할 값이 필요합니다.');
  }
  const updated = context.store.updateSchedule(schedule.id, patch);
  return { data: serializeSchedule(updated), message: '일정이 수정되었습니다.' };
}

export async function deleteSchedule(context) {
  const user = requireAuth(context);
  const schedule = findOwnedSchedule(context, user.id);
  context.store.deleteSchedule(schedule.id);
  return { status: 204 };
}

export async function getCopySources(context) {
  const user = requireAuth(context);
  const targetDate = assertDate(context.query.targetDate, 'targetDate');
  const all = context.store.listSchedules({ userId: user.id });
  const counts = new Map();
  for (const s of all) {
    if (s.date < targetDate) counts.set(s.date, (counts.get(s.date) ?? 0) + 1);
  }
  const sources = [...counts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, scheduleCount]) => ({ date, label: labelForDate(date, targetDate), scheduleCount }));
  return { data: sources };
}

export async function copySchedules(context) {
  const user = requireAuth(context);
  const sourceDate = assertDate(context.body.sourceDate, 'sourceDate');
  const targetDate = assertDate(context.body.targetDate, 'targetDate');
  const source = context.store.listSchedules({ userId: user.id, date: sourceDate });
  const copied = source.map((s) =>
    serializeSchedule(
      context.store.createSchedule({
        userId: user.id,
        date: targetDate,
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        isFixed: s.isFixed,
        selfCareCategory: s.selfCareCategory,
        placeId: s.placeId,
        source: 'COPIED'
      })
    )
  );
  return { data: { date: targetDate, schedules: copied }, message: '이전 일정을 불러왔습니다.' };
}

// ---------- helpers ----------
function validateScheduleItem(body, { withDate = false, partial = false } = {}) {
  const out = {};
  if (withDate) out.date = assertDate(body.date, 'date');
  else if (body.date !== undefined) out.date = assertDate(body.date, 'date');

  const need = (f) => !partial || body[f] !== undefined;

  if (need('title')) out.title = assertRequiredString(body.title, 'title', { min: 1, max: 100 });
  if (need('startTime')) out.startTime = assertTime(body.startTime, 'startTime', true);
  if (body.endTime !== undefined) out.endTime = assertTime(body.endTime, 'endTime', true);
  if (need('isFixed')) {
    if (typeof body.isFixed !== 'boolean') throw new ApiError(422, 'VALIDATION_ERROR', 'isFixed는 boolean이어야 합니다.');
    out.isFixed = body.isFixed;
  }
  if (body.selfCareCategory !== undefined) out.selfCareCategory = assertCategoryNullable(body.selfCareCategory);
  if (body.placeId !== undefined) out.placeId = body.placeId ?? null;
  return out;
}

function findOwnedSchedule(context, userId) {
  const schedule = context.store.findScheduleById(context.params.scheduleId);
  if (!schedule) throw new ApiError(404, 'SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.');
  if (schedule.userId !== userId) throw new ApiError(403, 'FORBIDDEN', '본인 일정만 수정/삭제할 수 있습니다.');
  return schedule;
}

function assertDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  return value;
}

function assertTime(value, field, nullable = false) {
  if ((value === null || value === undefined) && nullable) return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${field}는 HH:MM 형식이어야 합니다.`);
  }
  return value;
}

function assertCategoryNullable(value) {
  if (value === null) return null;
  const c = String(value).toUpperCase();
  if (!CATEGORIES.has(c)) throw new ApiError(422, 'VALIDATION_ERROR', 'selfCareCategory 값이 올바르지 않습니다.');
  return c;
}

function getWeekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=일
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function labelForDate(date, targetDate) {
  const diffDays = Math.round(
    (new Date(`${targetDate}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000
  );
  if (diffDays === 7) return '지난주 같은 요일';
  if (diffDays === 1) return '어제';
  return `${diffDays}일 전`;
}
