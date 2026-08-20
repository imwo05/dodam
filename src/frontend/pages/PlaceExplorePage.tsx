import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMapPlaces } from '../../api/places';
import type { Place } from '../components/map/map.types';
import { MapView } from '../components/map/MapView';
import { AppShell, PageHeader } from '../components/AppShell';

export function PlaceExplorePage() {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMapPlaces().then((next) => {
      if (active) setPlaces(next);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : '장소를 불러오지 못했어요.');
    });
    return () => { active = false; };
  }, []);

  return (
    <AppShell className="product-shell place-shell" activeNav="Plan B" showBottomNav>
      <main className="place-explore-screen" data-node-id="291:4400">
        <PageHeader title="장소 탐색" backTo="/home" className="page-header--product" />
        <section className="place-explore-heading">
          <div><p className="product-eyebrow">EXPLORE</p><h1>오늘의 장소를 찾아볼까요?</h1></div>
          <Link to="/archive/my-places" className="place-text-link">내가 만든 장소</Link>
        </section>
        <MapView mode="EXPLORE" places={places} onPlaceSelect={(place) => navigate('/places/' + place.id)} className="place-explore-map" ariaLabel="장소 탐색 지도" />
        <div className="place-create-actions"><Link to="/places/create/point">POINT 등록</Link><Link to="/places/create/segment">SEGMENT 등록</Link></div>
        {error ? <p className="place-form-error" role="alert">{error}</p> : null}
        <section className="place-explore-list">
          <h2>지도에 표시된 장소</h2>
          {places.length ? places.map((place) => <button type="button" className="place-explore-card" key={place.id} onClick={() => navigate('/places/' + place.id)}><span className="place-explore-card__marker" aria-hidden="true" /><span><strong>{place.name}</strong><small>{place.category ?? '장소'} · {place.geometryType}</small></span></button>) : <p className="place-loading">장소를 불러오는 중이에요.</p>}
        </section>
      </main>
    </AppShell>
  );
}
