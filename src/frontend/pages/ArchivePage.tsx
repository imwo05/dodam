import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getArchive, getJournalCalendar, type ArchiveResponse } from '../../api/archive';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';
import { todayKey } from '../utils/date';

type StatKey = 'visitedPlaceCount' | 'completedPlanBCount' | 'activityCount' | 'createdPlaceCount' | 'reviewCount';
const statisticLabels: Array<[StatKey, string]> = [
  ['visitedPlaceCount', '방문한 장소'],
  ['completedPlanBCount', '완료한 Plan B'],
  ['activityCount', '활동 기록'],
  ['createdPlaceCount', '만든 장소'],
  ['reviewCount', '리뷰']
];

export function ArchivePage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<ArchiveResponse | null>(null);
  const [calendar, setCalendar] = useState<Array<{ date: string; journalCount: number }>>([]);
  const [error, setError] = useState('');
  const today = todayKey();
  const monthDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth() + 1;

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([getArchive(accessToken), getJournalCalendar(accessToken, year, month)]).then(([archive, journalCalendar]) => {
      setData(archive);
      setCalendar(journalCalendar.dates);
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '아카이브를 불러오지 못했어요.'));
  }, [accessToken, month, year]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarByDate = new Map(calendar.map((item) => [item.date, item.journalCount]));
  return (
    <AppShell className="product-shell archive-shell" activeNav="아카이브" showBottomNav>
      <main className="archive-screen">
        <PageHeader title="아카이브" backTo="/home" className="page-header--product" />
        {error ? <p className="archive-error" role="alert">{error}</p> : null}
        {!data && !error ? <p className="archive-empty">아카이브를 불러오는 중이에요.</p> : null}
        {data ? <>
          <section className="archive-paper-section">
            <div className="archive-section-heading"><h2>나의 기록</h2><span>전체 보기</span></div>
            <div className="archive-stat-grid">{statisticLabels.map(([key, label]) => <div key={key}><strong>{data.statistics[key] ?? 0}</strong><span>{label}</span></div>)}</div>
          </section>
          <section className="archive-paper-section"><div className="archive-section-heading"><h2>저장한 장소</h2><Link to="/archive/saved-places">전체 보기 &gt;</Link></div>{data.savedPlacePreview.length ? <div className="archive-preview-list">{data.savedPlacePreview.map((place) => <Link to={`/archive/saved-places`} key={place.id}><strong>{place.name}</strong></Link>)}</div> : <p>저장한 장소가 아직 없어요.</p>}</section>
          <section className="archive-paper-section"><div className="archive-section-heading"><h2>나의 활동 기록</h2><Link to="/archive/activities">전체 보기 &gt;</Link></div>{data.recentActivities.length ? <div className="archive-activity-list">{data.recentActivities.slice(0, 4).map((activity) => <Link to="/archive/activities" key={activity.id}><span>{activity.date}</span><strong>{activity.category}</strong>{activity.durationMinutes ? <small>{activity.durationMinutes}분</small> : null}</Link>)}</div> : <p>활동 기록이 아직 없어요.</p>}</section>
          <section className="archive-paper-section"><div className="archive-section-heading"><h2>장소 / 리뷰 관리</h2><Link to="/archive/manage">리뷰 관리 &gt;</Link></div><p><Link to="/archive/places">내가 만든 장소 관리 &gt;</Link></p></section>
          <section className="archive-paper-section archive-journal-section"><div className="archive-section-heading"><h2>나의 일지</h2><span>{month}월</span></div><div className="journal-calendar" role="grid" aria-label={`${year}년 ${month}월 일지`}>{Array.from({ length: firstDay }).map((_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const count = calendarByDate.get(date) ?? 0; return count ? <Link key={date} to={`/archive/journal?date=${date}`} className="has-journal" aria-label={`${date}, 일지 ${count}개`}>{day}</Link> : <span key={date}>{day}</span>; })}</div></section>
        </> : null}
      </main>
    </AppShell>
  );
}
