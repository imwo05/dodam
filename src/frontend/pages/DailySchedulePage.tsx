import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { ScheduleChip } from '../components/ScheduleChip';
import { addDays, formatDateLabel, formatHeaderDate, todayKey } from '../utils/date';

export function DailySchedulePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken, user } = useAuth();
  const { schedules, loadDates, loading, error } = useSchedules();
  const queryDate = new URLSearchParams(location.search).get('date');
  const [date, setDate] = useState(queryDate ?? todayKey());
  const selectedSchedules = useMemo(() => schedules.filter((schedule) => schedule.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime)), [date, schedules]);

  useEffect(() => {
    if (queryDate) setDate(queryDate);
  }, [queryDate]);

  useEffect(() => {
    if (accessToken) void loadDates(accessToken, [date]);
  }, [accessToken, date, loadDates]);

  return (
    <AppShell className="product-shell daily-schedule-shell" activeNav="일정" showBottomNav>
      <main className="daily-schedule-screen" data-node-id="291:4639">
        <div className="schedule-toolbar"><Link to="/schedule" aria-label="주간 일정으로 돌아가기">‹</Link><button type="button" onClick={() => navigate(`/schedule/new?date=${date}`)} aria-label="일정 추가">+</button></div>
        <p className="product-eyebrow">{formatHeaderDate(date)}</p>
        <h1>오늘의 일정을 등록해 보세요!</h1>
        <div className="daily-date-controls"><button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="이전 날">‹</button><strong>{user?.name ?? '나'}님의 {formatDateLabel(date)}</strong><button type="button" onClick={() => setDate(addDays(date, 1))} aria-label="다음 날">›</button></div>
        <div className="daily-schedule-list" aria-live="polite">
          {loading ? <p className="schedule-empty">일정을 불러오는 중이에요.</p> : null}
          {!loading && !selectedSchedules.length ? <p className="schedule-empty">오늘 등록된 일정이 없어요.</p> : null}
          {selectedSchedules.map((schedule) => <ScheduleChip key={schedule.id} schedule={schedule} onClick={() => navigate(`/schedule/${schedule.id}/edit`, { state: { schedule } })} />)}
        </div>
        {error ? <p className="schedule-page__error" role="alert">{error}</p> : null}
        <button className="tape-button schedule-finish-button" type="button" onClick={() => navigate(`/schedule/new?date=${date}`)}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>일정 추가</span></button>
      </main>
    </AppShell>
  );
}
