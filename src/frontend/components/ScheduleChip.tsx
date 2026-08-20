import type { Schedule } from '../../api/schedules';
import { formatTimeRange } from '../utils/date';

export function scheduleTone(schedule: Pick<Schedule, 'isFixed' | 'selfCareCategory'>) {
  return schedule.isFixed ? 'fixed' : 'flexible';
}

export function schedulePresentation(schedule: Pick<Schedule, 'isFixed' | 'selfCareCategory'>) {
  const tone = scheduleTone(schedule);
  return {
    tone,
    titleWeight: schedule.selfCareCategory ? 'bold' : 'regular',
    className: `schedule-surface--${tone} schedule-surface--title-${schedule.selfCareCategory ? 'bold' : 'regular'}`
  } as const;
}

export function ScheduleChip({ schedule, onClick, compact = false }: { schedule: Schedule; onClick?: () => void; compact?: boolean }) {
  const presentation = schedulePresentation(schedule);
  const content = (
    <>
      <span className="schedule-chip__time">{formatTimeRange(schedule.startTime, schedule.endTime)}</span>
      <span className={`schedule-chip__title schedule-chip__title--${presentation.titleWeight}`}>{schedule.title}</span>
    </>
  );
  const className = `schedule-chip ${presentation.className} ${compact ? 'schedule-chip--compact' : ''}`;
  if (!onClick) return <div className={className}>{content}</div>;
  return <button className={className} type="button" onClick={onClick} aria-label={`${schedule.title}, ${formatTimeRange(schedule.startTime, schedule.endTime)}`}>{content}</button>;
}
