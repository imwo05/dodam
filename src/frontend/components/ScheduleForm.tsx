import { useEffect, useState, type FormEvent } from 'react';
import { getOnboardingOptions } from '../../api/onboarding';
import type { Schedule, ScheduleWriteInput, SelfCareCategory } from '../../api/schedules';
import { useSchedules } from '../../contexts/ScheduleContext';
import { todayKey } from '../utils/date';
import { ScheduleTimeWheel } from './ScheduleTimeWheel';

const categoryLabels: Record<SelfCareCategory, string> = {
  EXERCISE: '운동',
  DIET: '식단',
  WALK: '산책',
  RUNNING: '러닝',
  MENTAL_HEALTH: '멘탈 헬스',
  CUSTOM: '직접 입력'
};

type ScheduleFormProps = {
  accessToken: string;
  initialSchedule?: Schedule;
  defaultDate?: string;
  compact?: boolean;
  onSaved: (schedule: Schedule) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
};

export function ScheduleForm({ accessToken, initialSchedule, defaultDate = todayKey(), compact = false, onSaved, onCancel, onDeleted }: ScheduleFormProps) {
  const { create, update, remove, loading: scheduleLoading } = useSchedules();
  const [date, setDate] = useState(initialSchedule?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initialSchedule?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initialSchedule?.endTime ?? '10:00');
  const [title, setTitle] = useState(initialSchedule?.title ?? '');
  const [isFixed, setIsFixed] = useState(initialSchedule?.isFixed ?? false);
  const [selfCareCategory, setSelfCareCategory] = useState<SelfCareCategory | null>(initialSchedule?.selfCareCategory ?? null);
  const [categoryOptions, setCategoryOptions] = useState<SelfCareCategory[]>([]);
  const [timeTarget, setTimeTarget] = useState<'start' | 'end' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getOnboardingOptions().then((options) => {
      if (!active) return;
      const valid = options.selfCareCategories.filter((value): value is SelfCareCategory => value in categoryLabels);
      setCategoryOptions(valid);
    }).catch(() => {
      if (active) setCategoryOptions([]);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime) {
      setError('날짜, 시간, 활동을 입력해 주세요.');
      return;
    }
    if (endTime <= startTime) {
      setError('종료 시간은 시작 시간보다 늦어야 해요.');
      return;
    }
    const input: ScheduleWriteInput = { date, startTime, endTime, title: title.trim(), isFixed, selfCareCategory };
    setError('');
    try {
      const saved = initialSchedule ? await update(accessToken, initialSchedule.id, input) : await create(accessToken, input);
      onSaved(saved);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '일정을 저장하지 못했어요.');
    }
  }

  async function deleteCurrent() {
    if (!initialSchedule) return;
    try {
      await remove(accessToken, initialSchedule.id);
      onDeleted?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '일정을 삭제하지 못했어요.');
    }
  }

  return (
    <form className={`schedule-form ${compact ? 'schedule-form--compact' : ''}`} onSubmit={submit} noValidate>
      <div className="schedule-form__heading">
        <h2>{initialSchedule ? '일정 수정' : '일정 추가'}</h2>
        {onCancel ? <button type="button" className="schedule-form__close" onClick={onCancel} aria-label="닫기">×</button> : null}
      </div>
      <label className="schedule-form__label" htmlFor="schedule-date">날짜 <span>*</span></label>
      <div className="schedule-form__surface">
        <img src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" />
        <input id="schedule-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <span className="schedule-form__label">시간 <span>*</span></span>
      <div className="schedule-form__time-row">
        <button type="button" className="schedule-form__time-button" onClick={() => setTimeTarget('start')}>{startTime} ↓</button>
        <span aria-hidden="true">~</span>
        <button type="button" className="schedule-form__time-button" onClick={() => setTimeTarget('end')}>{endTime} ↓</button>
      </div>

      <label className="schedule-form__label" htmlFor="schedule-title">활동 <span>*</span></label>
      <div className="schedule-form__surface schedule-form__surface--title">
        <img src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" />
        <input id="schedule-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="활동을 입력하세요." maxLength={100} />
      </div>

      <span className="schedule-form__label">고정 일정 여부 <span>*</span></span>
      <div className="schedule-form__toggle" role="group" aria-label="고정 일정 여부">
        <button className={isFixed ? 'is-selected' : ''} type="button" aria-pressed={isFixed} onClick={() => setIsFixed(true)}>ON</button>
        <button className={!isFixed ? 'is-selected' : ''} type="button" aria-pressed={!isFixed} onClick={() => setIsFixed(false)}>OFF</button>
      </div>

      <span className="schedule-form__label">자기관리 항목</span>
      <div className="schedule-form__categories" role="group" aria-label="자기관리 항목">
        {categoryOptions.map((category) => (
          <button key={category} type="button" className={`schedule-form__category ${selfCareCategory === category ? 'is-selected' : ''}`} aria-pressed={selfCareCategory === category} onClick={() => setSelfCareCategory(selfCareCategory === category ? null : category)}>
            <img src={selfCareCategory === category ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" />
            <span>{categoryLabels[category]}</span>
          </button>
        ))}
      </div>

      {error ? <p className="schedule-form__error" role="alert">{error}</p> : null}
      <div className="schedule-form__actions">
        {onCancel ? <button type="button" className="schedule-form__secondary" onClick={onCancel}>취소</button> : null}
        {initialSchedule && onDeleted && !confirmingDelete ? <button type="button" className="schedule-form__danger" onClick={() => setConfirmingDelete(true)}>삭제</button> : null}
        {confirmingDelete ? <span className="schedule-form__confirm-copy">삭제할까요?</span> : null}
        {confirmingDelete ? <button type="button" className="schedule-form__secondary" onClick={() => setConfirmingDelete(false)}>취소</button> : null}
        {confirmingDelete ? <button type="button" className="schedule-form__danger" onClick={() => void deleteCurrent()}>삭제</button> : null}
        <button type="submit" className="schedule-form__submit" disabled={scheduleLoading}>{scheduleLoading ? '저장 중' : '완료'}</button>
      </div>
      {timeTarget ? <ScheduleTimeWheel value={timeTarget === 'start' ? startTime : endTime} onChange={timeTarget === 'start' ? setStartTime : setEndTime} onClose={() => setTimeTarget(null)} /> : null}
    </form>
  );
}
