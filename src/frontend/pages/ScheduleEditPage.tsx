import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { ScheduleForm } from '../components/ScheduleForm';
import { getWeekDates, todayKey } from '../utils/date';

export function ScheduleEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { accessToken } = useAuth();
  const { schedules, loadDates, loading } = useSchedules();
  const stateSchedule = (location.state as { schedule?: Schedule } | null)?.schedule;
  const schedule = stateSchedule ?? schedules.find((item) => item.id === params.id);
  const isEdit = Boolean(params.id);
  const queryDate = new URLSearchParams(location.search).get('date');
  const defaultDate = useMemo(() => queryDate ?? schedule?.date ?? todayKey(), [queryDate, schedule?.date]);
  const recoveryDates = useMemo(() => queryDate ? [queryDate] : getWeekDates(todayKey(), 'monday'), [queryDate]);

  useEffect(() => {
    if (!accessToken || !params.id || schedule) return;
    void loadDates(accessToken, recoveryDates);
  }, [accessToken, loadDates, params.id, recoveryDates, schedule]);

  if (!accessToken) return null;

  return (
    <AppShell className="product-shell schedule-edit-shell" activeNav="일정" showBottomNav>
      <main className="schedule-edit-screen" data-node-id="291:4706">
        <div className="schedule-toolbar"><Link to={schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule'} aria-label="일정으로 돌아가기">‹</Link><span>{isEdit ? '일정 수정' : '일정 추가'}</span></div>
        {isEdit && !schedule && loading ? <p className="schedule-empty">일정 정보를 불러오는 중이에요.</p> : null}
        {isEdit && !schedule && !loading ? <p className="schedule-empty">일정 정보를 찾지 못했어요. 일정 화면에서 다시 열어 주세요.</p> : null}
        {!isEdit || schedule ? <><ScheduleForm accessToken={accessToken} initialSchedule={schedule} defaultDate={defaultDate} onSaved={(saved) => navigate(`/schedule/daily?date=${saved.date}`)} onCancel={() => navigate(schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule')} onDeleted={() => navigate(schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule')} />{schedule?.selfCareCategory ? <Link className="schedule-plan-b-link" to={`/plan-b/input?brokenScheduleId=${encodeURIComponent(schedule.id)}&date=${encodeURIComponent(schedule.date)}`} state={{ planBEntry: 'new' }}>이 일정이 바뀌었나요? Plan B 만들기</Link> : null}</> : null}
      </main>
    </AppShell>
  );
}
