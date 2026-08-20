import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { ScheduleChip } from '../components/ScheduleChip';
import { ScheduleForm } from '../components/ScheduleForm';
import { formatKoreanMonth, getWeekDates, parseDateKey, todayKey } from '../utils/date';

export function InitialSchedulePage() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { schedules, loadDates, loading, error } = useSchedules();
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [formOpen, setFormOpen] = useState(false);

  const dates = useMemo(() => getWeekDates(selectedDate, 'sunday'), [selectedDate]);
  const selectedSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedules, selectedDate]
  );

  useEffect(() => {
    if (accessToken) void loadDates(accessToken, dates);
  }, [accessToken, dates, loadDates]);

  function monthDay(date: string) {
    return parseDateKey(date).getDate();
  }

  return (
    <AppShell className="product-shell initial-schedule-shell" activeNav="일정" showBottomNav>
      <main className="initial-schedule-screen" data-node-id="291:4155">
        <section className="initial-schedule-intro">
          <p className="product-eyebrow">초기 일정 등록</p>
          <h1>{user?.name ?? '나'}님의 평소 일정을<br />등록해 보세요!</h1>
        </section>
        <section className="schedule-week-picker" aria-label="초기 일정 날짜 선택">
          <strong>{formatKoreanMonth(selectedDate)}</strong>
          <div className="schedule-week-picker__days">
            {dates.map((date, index) => (
              <button key={date} type="button" className={`schedule-week-picker__day ${date === selectedDate ? 'is-selected' : ''} ${index === 0 ? 'is-sunday' : ''} ${index === 6 ? 'is-saturday' : ''}`} onClick={() => setSelectedDate(date)} aria-pressed={date === selectedDate}>
                <span>{['일', '월', '화', '수', '목', '금', '토'][index]}</span>
                <b>{monthDay(date)}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="initial-schedule-list" aria-live="polite">
          {loading && !selectedSchedules.length ? <p className="schedule-empty">일정을 불러오는 중이에요.</p> : null}
          {!loading && !selectedSchedules.length ? <p className="schedule-empty">등록된 일정이 없어요.<br />아래에서 평소 일정을 추가해 주세요.</p> : null}
          {selectedSchedules.map((schedule) => <ScheduleChip key={schedule.id} schedule={schedule} onClick={() => { setFormOpen(false); navigate(`/schedule/${schedule.id}/edit`, { state: { schedule } }); }} />)}
          <button className="schedule-chip schedule-chip--add" type="button" onClick={() => setFormOpen(true)}>+ 일정 추가</button>
        </section>
        {error ? <p className="schedule-page__error" role="alert">{error}</p> : null}
        <button className="tape-button schedule-finish-button" type="button" onClick={() => navigate('/onboarding/complete')}>
          <img src="/assets/tape-primary.png" alt="" aria-hidden="true" />
          <span>다음</span>
        </button>
        {formOpen && accessToken ? (
          <section className="schedule-form-sheet" aria-label="일정 추가">
            <ScheduleForm accessToken={accessToken} defaultDate={selectedDate} compact onCancel={() => setFormOpen(false)} onSaved={(schedule) => { setSelectedDate(schedule.date); setFormOpen(false); }} />
          </section>
        ) : null}
        <button className="initial-schedule-skip" type="button" onClick={() => navigate('/onboarding/complete')}>나중에 등록하기</button>
      </main>
    </AppShell>
  );
}
