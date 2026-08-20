import { useEffect, useRef, type KeyboardEvent } from 'react';

type WheelColumnProps = {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

function WheelColumn({ label, value, max, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const values = Array.from({ length: max + 1 }, (_, index) => index);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-wheel-value="${value}"]`)?.scrollIntoView({ block: 'center' });
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    onChange((value + delta + max + 1) % (max + 1));
  }

  return (
    <div
      ref={ref}
      className="schedule-wheel__column"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${label}-${value}`}
      onKeyDown={handleKeyDown}
    >
      {values.map((item) => (
        <button
          id={`${label}-${item}`}
          className={`schedule-wheel__item ${item === value ? 'is-selected' : ''}`}
          data-wheel-value={item}
          key={item}
          type="button"
          role="option"
          aria-selected={item === value}
          onClick={() => onChange(item)}
        >
          {String(item).padStart(2, '0')}
        </button>
      ))}
    </div>
  );
}

export function ScheduleTimeWheel({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  function setHour(next: number) {
    onChange(`${String(next).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }

  function setMinute(next: number) {
    onChange(`${String(hour).padStart(2, '0')}:${String(next).padStart(2, '0')}`);
  }

  return (
    <div className="schedule-wheel" role="dialog" aria-modal="true" aria-label="시간 선택">
      <div className="schedule-wheel__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="schedule-wheel__panel">
        <div className="schedule-wheel__header">
          <strong>시간 선택</strong>
          <button type="button" onClick={onClose}>완료</button>
        </div>
        <div className="schedule-wheel__body">
          <WheelColumn label="시" value={hour} max={23} onChange={setHour} />
          <span className="schedule-wheel__separator">:</span>
          <WheelColumn label="분" value={minute} max={59} onChange={setMinute} />
        </div>
      </div>
    </div>
  );
}
