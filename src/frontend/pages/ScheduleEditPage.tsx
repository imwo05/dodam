import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { ScheduleForm } from '../components/ScheduleForm';
import { todayKey } from '../utils/date';

export function ScheduleEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { accessToken } = useAuth();
  const { schedules } = useSchedules();
  const stateSchedule = (location.state as { schedule?: Schedule } | null)?.schedule;
  const schedule = stateSchedule ?? schedules.find((item) => item.id === params.id);
  const isEdit = Boolean(params.id);
  const defaultDate = useMemo(() => new URLSearchParams(location.search).get('date') ?? schedule?.date ?? todayKey(), [location.search, schedule?.date]);

  if (!accessToken) return null;

  return (
    <AppShell className="product-shell schedule-edit-shell" activeNav="일정" showBottomNav>
      <main className="schedule-edit-screen" data-node-id="291:4706">
        <div className="schedule-toolbar"><Link to={schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule'} aria-label="일정으로 돌아가기">‹</Link><span>{isEdit ? '일정 수정' : '일정 추가'}</span></div>
        {isEdit && !schedule ? <p className="schedule-empty">일정 정보를 찾지 못했어요. 일정 화면에서 다시 열어 주세요.</p> : <ScheduleForm accessToken={accessToken} initialSchedule={schedule} defaultDate={defaultDate} onSaved={(saved) => navigate(`/schedule/daily?date=${saved.date}`)} onCancel={() => navigate(schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule')} onDeleted={() => navigate(schedule ? `/schedule/daily?date=${schedule.date}` : '/schedule')} />}
      </main>
    </AppShell>
  );
}
