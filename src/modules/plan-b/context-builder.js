import { ApiError } from '../../lib/errors.js';
import { profileForResponse } from '../onboarding/profile.js';
import { normalizePlanBLocation } from './location.js';

export const PLAN_B_TIMEZONE = 'Asia/Seoul';

export async function buildPlanBContext({ store, repositories, user, input }) {
  const availableMinutes = timeDiffMinutes(input.startTime, input.endTime);
  if (availableMinutes <= 0) {
    throw new ApiError(422, 'INVALID_TIME_WINDOW', 'endTime은 startTime보다 늦어야 합니다.');
  }

  const schedules = store.listSchedules({ userId: user.id, date: input.date });
  const brokenSchedule = input.brokenScheduleId
    ? store.findScheduleById(input.brokenScheduleId)
    : null;

  if (input.brokenScheduleId && !brokenSchedule) {
    throw new ApiError(404, 'SCHEDULE_NOT_FOUND', '깨진 일정을 찾을 수 없습니다.');
  }
  if (brokenSchedule && brokenSchedule.userId !== user.id) {
    throw new ApiError(403, 'FORBIDDEN', '본인 일정만 Plan B의 기준 일정으로 사용할 수 있습니다.');
  }
  if (brokenSchedule && brokenSchedule.date !== input.date) {
    throw new ApiError(422, 'BROKEN_SCHEDULE_INVALID', '깨진 일정은 Plan B 날짜와 같아야 합니다.');
  }

  const nextFixedSchedule = schedules
    .filter((schedule) => schedule.isFixed && schedule.startTime && toMinutes(schedule.startTime) > toMinutes(input.startTime))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0] ?? null;

  const profile = repositories?.profile
    ? await repositories.profile.getSelfCareProfile(user.id)
    : store.getSelfCareProfile(user.id);
  const concern = store.getConcern(user.id);
  const aiStyle = profile?.aiStyle === 'T' ? 'T' : 'F';
  const effectiveEndTime = nextFixedSchedule && toMinutes(nextFixedSchedule.startTime) < toMinutes(input.endTime)
    ? nextFixedSchedule.startTime
    : input.endTime;
  const effectiveAvailableMinutes = timeDiffMinutes(input.startTime, effectiveEndTime);
  if (effectiveAvailableMinutes <= 0) {
    throw new ApiError(409, 'NEXT_SCHEDULE_CONFLICT', '다음 고정 일정 때문에 Plan B를 만들 수 있는 시간이 없습니다.');
  }
  const bufferMinutes = calculateBuffer(effectiveAvailableMinutes);
  const todayCompletedActivities = store.listActivities({
    userId: user.id,
    startDate: input.date,
    endDate: input.date
  });
  const category = brokenSchedule?.selfCareCategory ?? input.selfCareCategory ?? null;
  const originalGoal = brokenSchedule?.title ?? profile?.purpose ?? categoryLabel(category);
  const personalization = profileForResponse(profile);
  if (!personalization.selfCareGoals.length && concern?.analysis?.categories?.length) {
    personalization.selfCareGoals = [...concern.analysis.categories];
  }

  return {
    timezone: PLAN_B_TIMEZONE,
    condition: input.condition,
    continuityMode: input.continuityMode,
    aiStyle,
    currentLocation: normalizePlanBLocation(input.location),
    availableWindow: {
      start: `${input.date}T${input.startTime}:00+09:00`,
      end: `${input.date}T${effectiveEndTime}:00+09:00`,
      availableMinutes: effectiveAvailableMinutes,
      bufferMinutes,
      usableMinutes: Math.max(0, effectiveAvailableMinutes - bufferMinutes)
    },
    brokenPlan: brokenSchedule
      ? {
          scheduleId: brokenSchedule.id,
          title: brokenSchedule.title,
          category: category,
          startTime: brokenSchedule.startTime,
          endTime: brokenSchedule.endTime
        }
      : null,
    nextFixedSchedule: nextFixedSchedule
      ? {
          scheduleId: nextFixedSchedule.id,
          title: nextFixedSchedule.title,
          startTime: nextFixedSchedule.startTime
        }
      : null,
    profile: profile ?? null,
    personalization,
    legacyConcern: concern ?? null,
    todayCompletedActivities,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    selfCareCategory: category,
    customCategory: input.customCategory ?? null,
    originalGoal,
    effectiveEndTime
  };
}

export function contextFromSession(session) {
  if (session.contextSnapshot) {
    const context = structuredClone(session.contextSnapshot);
    context.currentLocation = normalizePlanBLocation(context.currentLocation);
    return context;
  }
  return {
    timezone: PLAN_B_TIMEZONE,
    condition: session.condition,
    continuityMode: session.continuityMode,
    aiStyle: session.aiStyle === 'T' ? 'T' : 'F',
    currentLocation: normalizePlanBLocation({ latitude: session.latitude, longitude: session.longitude }),
    availableWindow: {
      start: `${session.date}T${session.startTime}:00+09:00`,
      end: `${session.date}T${session.endTime}:00+09:00`,
      availableMinutes: session.availableMinutes,
      bufferMinutes: session.bufferMinutes,
      usableMinutes: session.usableMinutes ?? Math.max(0, session.availableMinutes - session.bufferMinutes)
    },
    brokenPlan: session.brokenScheduleId ? { scheduleId: session.brokenScheduleId, category: session.selfCareCategory } : null,
    nextFixedSchedule: session.nextScheduleId ? { scheduleId: session.nextScheduleId } : null,
    profile: null,
    personalization: profileForResponse(null),
    todayCompletedActivities: [],
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    selfCareCategory: session.selfCareCategory,
    customCategory: session.customCategory,
    originalGoal: session.originalGoal
  };
}

function calculateBuffer(availableMinutes) {
  return Math.min(Math.max(5, Math.round(availableMinutes * 0.15)), Math.max(5, availableMinutes - 1));
}

function categoryLabel(category) {
  return category ? `${category} 활동 이어가기` : '오늘의 자기관리 이어가기';
}

function timeDiffMinutes(start, end) {
  return toMinutes(end) - toMinutes(start);
}

function toMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}
