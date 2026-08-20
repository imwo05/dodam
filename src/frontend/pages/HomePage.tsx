import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHome, type HomePlace, type HomeResponse } from '../../api/home';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { AppShell } from '../components/AppShell';
import { GardenView } from '../components/GardenView';
import { schedulePresentation } from '../components/ScheduleChip';
import { formatHeaderDate, formatTimeRange, todayKey } from '../utils/date';

function PlaceCard({ place }: { place: HomePlace }) {
  return (
    <article className="home-place-card">
      {place.imageUrl ? <img src={place.imageUrl} alt="" /> : <div className="home-place-card__placeholder" aria-hidden="true" />}
      <div><strong>{place.name}</strong>{place.category ? <span>{place.category}</span> : null}</div>
    </article>
  );
}

function SchedulePreview({ data, schedules }: { data: HomeResponse; schedules: Schedule[] }) {
  return (
    <section className="home-section home-daily-section">
      <div className="home-section__heading"><h2>데일리 일정</h2><Link to={`/schedule/daily?date=${data.date}`} aria-label="데일리 일정 보기">&gt;</Link></div>
      {data.dailySchedules.length ? data.dailySchedules.slice(0, 3).flatMap((schedule) => {
        const normalized = schedules.find((item) => item.id === schedule.id);
        if (!normalized) return [];
        const presentation = schedulePresentation(normalized);
        return [<div className={`home-schedule-row ${presentation.className}`} key={schedule.id}><span>{formatTimeRange(schedule.startTime, schedule.endTime)}</span><strong className={`home-schedule-row__title--${presentation.titleWeight}`}>{schedule.title}</strong></div>];
      }) : <p className="home-empty">오늘 등록된 일정이 없어요.</p>}
    </section>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { schedules, loadDates } = useSchedules();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState('');
  const date = todayKey();

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getHome(accessToken, date).then((next) => {
      if (active) setData(next);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : '홈 정보를 불러오지 못했어요.');
    });
    void loadDates(accessToken, [date]).catch(() => undefined);
    return () => { active = false; };
  }, [accessToken, date, loadDates]);

  const name = data?.user.name ?? user?.name ?? '나';
  return (
    <AppShell className="product-shell home-shell" activeNav="홈" showBottomNav>
      <main className="home-screen" data-node-id="291:4318">
        <div className="home-top-actions"><button type="button" onClick={() => navigate('/places/new/point')} aria-label="장소 추가">+</button></div>
        <p className="product-eyebrow">{formatHeaderDate(date)}</p>
        <h1>{name}님, 오늘도 성장하는<br />하루 보내시길 바랍니다</h1>
        {error ? <p className="home-empty" role="alert">{error}</p> : null}
        {data ? <SchedulePreview data={data} schedules={schedules.filter((schedule) => schedule.date === date)} /> : <p className="home-empty">홈 정보를 불러오는 중이에요.</p>}
        <section className="home-section">
          <h2>실시간 추천 장소</h2>
          {data?.realtimeRecommendedPlaces.length ? data.realtimeRecommendedPlaces.map((place) => <PlaceCard key={place.id} place={place} />) : <p className="home-empty">추천 장소가 아직 없어요.</p>}
        </section>
        <section className="home-section">
          <h2>저장된 장소</h2>
          {data?.savedPlaces.length ? data.savedPlaces.map((place) => <PlaceCard key={place.id} place={place} />) : <p className="home-empty">저장된 장소가 아직 없어요.</p>}
        </section>
        <GardenView className="home-section home-garden-section" garden={data?.garden ?? null} isLoading={!data && !error} />
      </main>
    </AppShell>
  );
}
