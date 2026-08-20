import type { Schedule } from '../../api/schedules';
import { formatTimeRange } from '../utils/date';

export function scheduleTone(schedule: Pick<Schedule, 'isFixed' | 'selfCareCategory'>) {
  if (schedule.selfCareCategory) return 'self-care';
  return schedule.isFixed ? 'fixed' : 'flexible';
}

export function ScheduleChip({ schedule, onClick, compact = false }: { schedule: Schedule; onClick?: () => void; compact?: boolean }) {
  const content = (
    <>
      <span className="schedule-chip__time">{formatTimeRange(schedule.startTime, schedule.endTime)}</span>
      <span className="schedule-chip__title">{schedule.title}</span>
    </>
  );
  const className = `schedule-chip schedule-chip--${scheduleTone(schedule)} ${compact ? 'schedule-chip--compact' : ''}`;
  if (!onClick) return <div className={className}>{content}</div>;
  return <button className={className} type="button" onClick={onClick} aria-label={`${schedule.title}, ${formatTimeRange(schedule.startTime, schedule.endTime)}`}>{content}</button>;
}
