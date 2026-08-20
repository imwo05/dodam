import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Schedule } from '../../api/schedules';
import { getHome, type HomeResponse } from '../../api/home';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { ScheduleChip } from '../components/ScheduleChip';
import { addDays, formatDateLabel, formatHeaderDate, getWeekDates, timeToMinutes, todayKey, weekOfMonthLabel } from '../utils/date';

const CALENDAR_START = 6 * 60;
const CALENDAR_END = 24 * 60;
const HOUR_HEIGHT = 54;

function overlap(schedule: Schedule, other: Schedule) {
  return timeToMinutes(schedule.startTime) < timeToMinutes(other.endTime) && timeToMinutes(other.startTime) < timeToMinutes(schedule.endTime);
}

function layoutFor(schedule: Schedule, schedules: Schedule[]) {
  const overlapping = schedules.filter((item) => overlap(schedule, item)).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  const column = Math.max(0, overlapping.findIndex((item) => item.id === schedule.id));
  return { column, columns: Math.max(1, overlapping.length) };
}

function CalendarColumn({ date, schedules, onOpen }: { date: string; schedules: Schedule[]; onOpen: (schedule: Schedule) => void }) {
  const ordered = [...schedules].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return (
    <div className="calendar-board__column" data-date={date}>
      {ordered.map((schedule) => {
        const top = Math.max(0, timeToMinutes(schedule.startTime) - CALENDAR_START) * HOUR_HEIGHT / 60;
        const bottom = Math.min(CALENDAR_END, timeToMinutes(schedule.endTime)) - Math.max(CALENDAR_START, timeToMinutes(schedule.startTime));
        const height = Math.max(34, bottom * HOUR_HEIGHT / 60);
        const layout = layoutFor(schedule, ordered);
        return <button key={schedule.id} type="button" className={`calendar-event calendar-event--${schedule.isFixed ? 'fixed' : 'flexible'} ${schedule.selfCareCategory ? 'calendar-event--self-care' : ''}`} style={{ top, height, left: `${(layout.column / layout.columns) * 100}%`, width: `${100 / layout.columns}%` }} onClick={() => onOpen(schedule)} title={schedule.title}><span>{schedule.startTime}</span><strong>{schedule.title}</strong></button>;
      })}
    </div>
  );
}

function WeeklyCalendar({ dates, schedules, onOpen }: { dates: string[]; schedules: Schedule[]; onOpen: (schedule: Schedule) => void }) {
  const hours = Array.from({ length: 19 }, (_, index) => index + 6);
  return (
    <div className="calendar-scroll" aria-label="주간 일정">
      <div className="calendar-board" style={{ height: `${(CALENDAR_END - CALENDAR_START) * HOUR_HEIGHT / 60 + 44}px` }}>
        <div className="calendar-board__header">
          <span aria-hidden="true" />
          {dates.map((date) => <span key={date}>{new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(new Date(`${date}T00:00:00`))}<b>{new Date(`${date}T00:00:00`).getDate()}</b></span>)}
        </div>
        <div className="calendar-board__body">
          <div className="calendar-board__hours">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
          <div className="calendar-board__columns">{dates.map((date) => <CalendarColumn key={date} date={date} schedules={schedules.filter((schedule) => schedule.date === date)} onOpen={onOpen} />)}</div>
          <div className="calendar-board__rows" aria-hidden="true">{hours.slice(0, -1).map((hour) => <div key={hour} />)}</div>
        </div>
      </div>
    </div>
  );
}

export function SchedulePage() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { schedules, loadDates, loading, error } = useSchedules();
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [homeData, setHomeData] = useState<HomeResponse | null>(null);
  const dates = useMemo(() => getWeekDates(selectedDate, 'monday'), [selectedDate]);
  const weekSchedules = useMemo(() => schedules.filter((schedule) => dates.includes(schedule.date)), [dates, schedules]);

  useEffect(() => {
    if (!accessToken) return;
    void loadDates(accessToken, dates);
    void getHome(accessToken, selectedDate).then(setHomeData).catch(() => setHomeData(null));
  }, [accessToken, dates, loadDates, selectedDate]);

  return (
    <AppShell className="product-shell schedule-shell" activeNav="일정" showBottomNav>
      <main className="schedule-screen" data-node-id="291:4359">
        <div className="schedule-toolbar"><Link to="/home" aria-label="홈으로 돌아가기">‹</Link><button type="button" onClick={() => navigate('/schedule/new')} aria-label="일정 추가">+</button></div>
        <p className="product-eyebrow">{formatHeaderDate(selectedDate)}</p>
        <h1>{user?.name ?? '나'}님의 일정</h1>
        <div className="schedule-week-controls">
          <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, -7))} aria-label="이전 주">‹</button>
          <strong>{weekOfMonthLabel(dates[0])}</strong>
          <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, 7))} aria-label="다음 주">›</button>
        </div>
        <WeeklyCalendar dates={dates} schedules={weekSchedules} onOpen={(schedule) => navigate(`/schedule/${schedule.id}/edit`, { state: { schedule } })} />
        {loading ? <p className="schedule-empty">일정을 불러오는 중이에요.</p> : null}
        {error ? <p className="schedule-page__error" role="alert">{error}</p> : null}
        <section className="schedule-section">
          <div className="schedule-section__heading"><h2>데일리 일정</h2><Link to={`/schedule/daily?date=${selectedDate}`}>&gt;</Link></div>
          {weekSchedules.filter((schedule) => schedule.date === selectedDate).length ? <div className="schedule-chip-list">{weekSchedules.filter((schedule) => schedule.date === selectedDate).map((schedule) => <ScheduleChip key={schedule.id} schedule={schedule} compact onClick={() => navigate(`/schedule/${schedule.id}/edit`, { state: { schedule } })} />)}</div> : <p className="schedule-empty">{formatDateLabel(selectedDate)} 일정이 없어요.</p>}
        </section>
        <PlaceStrip heading="추천 장소" places={homeData?.realtimeRecommendedPlaces ?? []} />
        <PlaceStrip heading="저장된 장소" places={homeData?.savedPlaces ?? []} />
      </main>
    </AppShell>
  );
}

function PlaceStrip({ heading, places }: { heading: string; places: Array<{ id: string; name: string; imageUrl?: string | null }> }) {
  return (
    <section className="schedule-section schedule-places-section">
      <h2>{heading}</h2>
      {places.length ? <div className="schedule-place-list">{places.map((place) => <article key={place.id} className="schedule-place-card">{place.imageUrl ? <img src={place.imageUrl} alt="" /> : null}<strong>{place.name}</strong></article>)}</div> : <p className="schedule-empty">표시할 장소가 아직 없어요.</p>}
    </section>
  );
}
