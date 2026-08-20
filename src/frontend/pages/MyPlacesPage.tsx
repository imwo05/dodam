import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyPlaces } from '../../api/places';
import type { Place } from '../components/map/map.types';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

export function MyPlacesPage() {
  const { accessToken } = useAuth();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getMyPlaces(accessToken).then((next) => {
      if (active) setPlaces(next);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : '내 장소를 불러오지 못했어요.');
    });
    return () => { active = false; };
  }, [accessToken]);

  return (
    <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav>
      <main className="my-places-screen">
        <PageHeader title="내가 만든 장소" backTo="/plan-b" className="page-header--product" />
        {error ? <p className="place-form-error" role="alert">{error}</p> : null}
        {!places && !error ? <p className="place-loading">내 장소를 불러오는 중이에요.</p> : null}
        {places ? (places.length ? <div className="my-places-list">{places.map((place) => <Link className="my-place-card" to={'/places/' + place.id} key={place.id}><span className="my-place-card__image">{place.image ? <img src={place.image} alt="" /> : null}</span><span><strong>{place.name}</strong><small>{place.category ?? '장소'} · {place.geometryType}</small><em>{place.address ?? '주소 없음'}</em></span></Link>)}</div> : <p className="place-empty">아직 만든 장소가 없어요.</p>) : null}
      </main>
    </AppShell>
  );
}
