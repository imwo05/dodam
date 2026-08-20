import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHome, type HomePlace, type HomeResponse } from '../../api/home';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell } from '../components/AppShell';
import { formatHeaderDate, formatTimeRange, todayKey } from '../utils/date';

function PlaceCard({ place }: { place: HomePlace }) {
  return (
    <article className="home-place-card">
      {place.imageUrl ? <img src={place.imageUrl} alt="" /> : <div className="home-place-card__placeholder" aria-hidden="true" />}
      <div><strong>{place.name}</strong>{place.category ? <span>{place.category}</span> : null}</div>
    </article>
  );
}

function SchedulePreview({ data }: { data: HomeResponse }) {
  return (
    <section className="home-section home-daily-section">
      <div className="home-section__heading"><h2>데일리 일정</h2><Link to={`/schedule/daily?date=${data.date}`} aria-label="데일리 일정 보기">&gt;</Link></div>
      {data.dailySchedules.length ? data.dailySchedules.slice(0, 3).map((schedule) => (
        <div className="home-schedule-row" key={schedule.id}><span>{formatTimeRange(schedule.startTime, schedule.endTime)}</span><strong>{schedule.title}</strong></div>
      )) : <p className="home-empty">오늘 등록된 일정이 없어요.</p>}
    </section>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
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
    return () => { active = false; };
  }, [accessToken, date]);

  const name = data?.user.name ?? user?.name ?? '나';
  return (
    <AppShell className="product-shell home-shell" activeNav="홈" showBottomNav>
      <main className="home-screen" data-node-id="291:4318">
        <div className="home-top-actions"><button type="button" onClick={() => navigate('/schedule/new')} aria-label="일정 추가">+</button></div>
        <p className="product-eyebrow">{formatHeaderDate(date)}</p>
        <h1>{name}님, 오늘도 성장하는<br />하루 보내시길 바랍니다</h1>
        {error ? <p className="home-empty" role="alert">{error}</p> : null}
        {data ? <SchedulePreview data={data} /> : <p className="home-empty">홈 정보를 불러오는 중이에요.</p>}
        <section className="home-section">
          <h2>실시간 추천 장소</h2>
          {data?.realtimeRecommendedPlaces.length ? data.realtimeRecommendedPlaces.map((place) => <PlaceCard key={place.id} place={place} />) : <p className="home-empty">추천 장소가 아직 없어요.</p>}
        </section>
        <section className="home-section">
          <h2>저장된 장소</h2>
          {data?.savedPlaces.length ? data.savedPlaces.map((place) => <PlaceCard key={place.id} place={place} />) : <p className="home-empty">저장된 장소가 아직 없어요.</p>}
        </section>
        <section className="home-section home-garden-section">
          <h2>다람쥐의 정원</h2>
          <p className="home-empty">정원 기능은 다음 단계에서 준비할게요.</p>
        </section>
      </main>
    </AppShell>
  );
}
