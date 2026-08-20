import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { canonicalTo12Hour, isCanonicalTime, timeToMinutes, twelveHourToCanonical, type Meridiem } from '../utils/date';

type WheelColumnProps = {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
};

function WheelColumn({ label, value, values, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-wheel-value="${value}"]`)?.scrollIntoView({ block: 'center' });
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = values.indexOf(value);
    const nextIndex = Math.min(values.length - 1, Math.max(0, index + (event.key === 'ArrowUp' ? -1 : 1)));
    onChange(values[nextIndex]);
  }

  return (
    <div ref={ref} className="schedule-wheel__column" role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={`${label}-${value}`} onKeyDown={handleKeyDown}>
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

function findFirstAllowed(meridiem: Meridiem, minCanonical: string | null | undefined) {
  for (let hour = 1; hour <= 12; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      if (isAllowed(meridiem, hour, minute, minCanonical)) return { hour, minute };
    }
  }
  return null;
}

export function ScheduleTimePicker({ value, onChange, onClose, minCanonical }: { value: string; onChange: (value: string) => void; onClose: () => void; minCanonical?: string | null }) {
  const parsed = isCanonicalTime(value) ? canonicalTo12Hour(value) : { meridiem: 'AM' as const, hour: 9, minute: 0 };
  const firstAvailablePeriod = findFirstAllowed(parsed.meridiem, minCanonical) ? parsed.meridiem : (findFirstAllowed('AM', minCanonical) ? 'AM' : 'PM');
  const firstAvailable = findFirstAllowed(firstAvailablePeriod, minCanonical);
  const selected = isAllowed(parsed.meridiem, parsed.hour, parsed.minute, minCanonical) ? parsed : (firstAvailable ? { ...firstAvailable, meridiem: firstAvailablePeriod as Meridiem } : parsed);
  const [hourText, setHourText] = useState(String(selected.hour));
  const [minuteText, setMinuteText] = useState(String(selected.minute).padStart(2, '0'));
  const [error, setError] = useState('');

  useEffect(() => {
    setHourText(String(selected.hour));
    setMinuteText(String(selected.minute).padStart(2, '0'));
  }, [selected.hour, selected.minute, selected.meridiem]);

  const allowedPeriods = useMemo(() => (['AM', 'PM'] as Meridiem[]).filter((period) => findFirstAllowed(period, minCanonical)), [minCanonical]);
  const allowedHours = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1).filter((hour) => Array.from({ length: 60 }, (_, minute) => minute).some((minute) => isAllowed(selected.meridiem, hour, minute, minCanonical))), [minCanonical, selected.meridiem]);
  const allowedMinutes = useMemo(() => Array.from({ length: 60 }, (_, minute) => minute).filter((minute) => isAllowed(selected.meridiem, selected.hour, minute, minCanonical)), [minCanonical, selected.hour, selected.meridiem]);

  function setPart(nextMeridiem: Meridiem, nextHour: number, nextMinute: number) {
    if (!isAllowed(nextMeridiem, nextHour, nextMinute, minCanonical)) {
      const first = findFirstAllowed(nextMeridiem, minCanonical);
      if (!first) return;
      nextHour = first.hour;
      nextMinute = first.minute;
    }
    onChange(twelveHourToCanonical(nextMeridiem, nextHour, nextMinute));
    setError('');
  }

  function commitDirect() {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setError('시간은 1~12시, 분은 00~59분으로 입력해 주세요.');
      return false;
    }
    if (!isAllowed(selected.meridiem, hour, minute, minCanonical)) {
      setError('종료 시간은 시작 시간보다 늦어야 해요.');
      return false;
    }
    setPart(selected.meridiem, hour, minute);
    setHourText(String(hour));
    setMinuteText(String(minute).padStart(2, '0'));
    return true;
  }

  function confirm() {
    if (commitDirect()) onClose();
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
              const first = findFirstAllowed(period, minCanonical);
              setPart(period, first?.hour ?? selected.hour, first?.minute ?? selected.minute);
            }}>{period === 'AM' ? '오전' : '오후'}</button>
          ))}
        </div>
        <div className="schedule-wheel__direct" aria-label="시간 직접 입력">
          <label>시<input inputMode="numeric" value={hourText} onChange={(event) => setHourText(event.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={commitDirect} /></label>
          <span>:</span>
          <label>분<input inputMode="numeric" value={minuteText} onChange={(event) => setMinuteText(event.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={commitDirect} /></label>
        </div>
        <div className="schedule-wheel__body">
          <WheelColumn label="시" value={selected.hour} values={allowedHours.length ? allowedHours : [selected.hour]} onChange={(hour) => setPart(selected.meridiem, hour, selected.minute)} />
          <span className="schedule-wheel__separator">:</span>
          <WheelColumn label="분" value={selected.minute} values={allowedMinutes.length ? allowedMinutes : [selected.minute]} onChange={(minute) => setPart(selected.meridiem, selected.hour, minute)} />
        </div>
        {minCanonical ? <p className="schedule-wheel__hint">종료 시간은 {canonicalTo12Hour(minCanonical).meridiem === 'AM' ? '오전' : '오후'} {canonicalTo12Hour(minCanonical).hour}:{String(canonicalTo12Hour(minCanonical).minute).padStart(2, '0')} 이후로 선택해 주세요.</p> : null}
        {error ? <p className="schedule-wheel__error" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
