import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { canonicalTo12Hour, isCanonicalTime, timeToMinutes, twelveHourToCanonical, type Meridiem } from '../utils/date';

type WheelColumnProps = {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
};

function WheelColumn({ label, value, values, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const programmaticScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    const column = ref.current;
    const selectedItem = column?.querySelector<HTMLElement>(`[data-wheel-value="${value}"]`);
    if (!column || !selectedItem) return;
    const columnBounds = column.getBoundingClientRect();
    const itemBounds = selectedItem.getBoundingClientRect();
    const offset = itemBounds.top + itemBounds.height / 2 - (columnBounds.top + column.clientHeight / 2);
    const top = Math.max(0, column.scrollTop + offset);
    programmaticScrollTopRef.current = top;
    column.scrollTo({ top, behavior: 'auto' });
  }, [value]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  function handleScroll() {
    const column = ref.current;
    if (!column) return;
    if (programmaticScrollTopRef.current !== null) {
      if (Math.abs(column.scrollTop - programmaticScrollTopRef.current) < 1) {
        programmaticScrollTopRef.current = null;
        return;
      }
      programmaticScrollTopRef.current = null;
    }
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const column = ref.current;
      if (!column) return;
      const columnBounds = column.getBoundingClientRect();
      const center = columnBounds.top + column.clientHeight / 2;
      let nearest: HTMLElement | null = null;
      let distance = Infinity;
      for (const item of column.querySelectorAll<HTMLElement>('[data-wheel-value]')) {
        const itemBounds = item.getBoundingClientRect();
        const itemCenter = itemBounds.top + itemBounds.height / 2;
        const nextDistance = Math.abs(itemCenter - center);
        if (nextDistance < distance) {
          nearest = item;
          distance = nextDistance;
        }
      }
      const next = Number(nearest?.dataset.wheelValue);
      if (Number.isInteger(next) && next !== value) onChange(next);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = values.indexOf(value);
    const nextIndex = Math.min(values.length - 1, Math.max(0, index + (event.key === 'ArrowUp' ? -1 : 1)));
    onChange(values[nextIndex]);
  }

  return (
    <div ref={ref} className="schedule-wheel__column" role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={`${label}-${value}`} onKeyDown={handleKeyDown} onScroll={handleScroll}>
      {values.map((item) => (
        <button id={`${label}-${item}`} className={`schedule-wheel__item ${item === value ? 'is-selected' : ''}`} data-wheel-value={item} key={item} type="button" role="option" aria-selected={item === value} onClick={() => onChange(item)}>
          {String(item).padStart(2, '0')}
        </button>
      ))}
    </div>
  );
}

function isAllowed(meridiem: Meridiem, hour: number, minute: number, minCanonical: string | null | undefined) {
  if (!minCanonical) return true;
  return timeToMinutes(twelveHourToCanonical(meridiem, hour, minute)) > timeToMinutes(minCanonical);
}

function findFirstAllowed(meridiem: Meridiem, minCanonical: string | null | undefined, minuteStep: number) {
  for (let hour = 1; hour <= 12; hour += 1) {
    for (let minute = 0; minute < 60; minute += minuteStep) {
      if (isAllowed(meridiem, hour, minute, minCanonical)) return { hour, minute };
    }
  }
  return null;
}

export function ScheduleTimePicker({ value, onChange, onClose, minCanonical, minuteStep = 1 }: { value: string; onChange: (value: string) => void; onClose: () => void; minCanonical?: string | null; minuteStep?: number }) {
  const safeMinuteStep = Number.isInteger(minuteStep) && minuteStep > 0 && minuteStep <= 60 ? minuteStep : 1;
  const parsed = isCanonicalTime(value) ? canonicalTo12Hour(value) : { meridiem: 'AM' as const, hour: 9, minute: 0 };
  const firstAvailablePeriod = findFirstAllowed(parsed.meridiem, minCanonical, safeMinuteStep) ? parsed.meridiem : (findFirstAllowed('AM', minCanonical, safeMinuteStep) ? 'AM' : 'PM');
  const firstAvailable = findFirstAllowed(firstAvailablePeriod, minCanonical, safeMinuteStep);
  const normalizedParsed = safeMinuteStep > 1 ? { ...parsed, minute: Math.round(parsed.minute / safeMinuteStep) * safeMinuteStep % 60 } : parsed;
  const selected = isAllowed(normalizedParsed.meridiem, normalizedParsed.hour, normalizedParsed.minute, minCanonical) ? normalizedParsed : (firstAvailable ? { ...firstAvailable, meridiem: firstAvailablePeriod as Meridiem } : normalizedParsed);
  const allowedPeriods = useMemo(() => (['AM', 'PM'] as Meridiem[]).filter((period) => findFirstAllowed(period, minCanonical, safeMinuteStep)), [minCanonical, safeMinuteStep]);
  const allowedHours = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1).filter((hour) => Array.from({ length: Math.ceil(60 / safeMinuteStep) }, (_, index) => index * safeMinuteStep).some((minute) => isAllowed(selected.meridiem, hour, minute, minCanonical))), [minCanonical, safeMinuteStep, selected.meridiem]);
  const allowedMinutes = useMemo(() => Array.from({ length: Math.ceil(60 / safeMinuteStep) }, (_, index) => index * safeMinuteStep).filter((minute) => isAllowed(selected.meridiem, selected.hour, minute, minCanonical)), [minCanonical, safeMinuteStep, selected.hour, selected.meridiem]);

  function setPart(nextMeridiem: Meridiem, nextHour: number, nextMinute: number) {
    if (!isAllowed(nextMeridiem, nextHour, nextMinute, minCanonical)) {
      const first = findFirstAllowed(nextMeridiem, minCanonical, safeMinuteStep);
      if (!first) return;
      nextHour = first.hour;
      nextMinute = first.minute;
    }
    onChange(twelveHourToCanonical(nextMeridiem, nextHour, nextMinute));
  }

  function confirm() {
    onClose();
  }

  return (
    <div className="schedule-wheel" role="dialog" aria-modal="true" aria-label="시간 선택">
      <div className="schedule-wheel__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="schedule-wheel__panel">
        <div className="schedule-wheel__header">
          <strong>시간 선택</strong>
          <button type="button" onClick={confirm}>완료</button>
        </div>
        <div className="schedule-wheel__meridiem" role="group" aria-label="오전 오후">
          {(['AM', 'PM'] as Meridiem[]).map((period) => (
            <button key={period} type="button" className={selected.meridiem === period ? 'is-selected' : ''} disabled={!allowedPeriods.includes(period)} aria-pressed={selected.meridiem === period} onClick={() => {
              const first = findFirstAllowed(period, minCanonical, safeMinuteStep);
              setPart(period, first?.hour ?? selected.hour, first?.minute ?? selected.minute);
            }}>{period === 'AM' ? '오전' : '오후'}</button>
          ))}
        </div>
        <div className="schedule-wheel__body">
          <WheelColumn label="시" value={selected.hour} values={allowedHours.length ? allowedHours : [selected.hour]} onChange={(hour) => setPart(selected.meridiem, hour, selected.minute)} />
          <span className="schedule-wheel__separator">:</span>
          <WheelColumn label="분" value={selected.minute} values={allowedMinutes.length ? allowedMinutes : [selected.minute]} onChange={(minute) => setPart(selected.meridiem, selected.hour, minute)} />
        </div>
        {minCanonical ? <p className="schedule-wheel__hint">종료 시간은 {canonicalTo12Hour(minCanonical).meridiem === 'AM' ? '오전' : '오후'} {canonicalTo12Hour(minCanonical).hour}:{String(canonicalTo12Hour(minCanonical).minute).padStart(2, '0')} 이후로 선택해 주세요.</p> : null}
      </div>
    </div>
  );
}
