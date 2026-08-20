import { useEffect, useState } from 'react';
import { getSavedPlaces, type SavedPlace } from '../../api/archive';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

export function SavedPlacesPage() {
  const { accessToken } = useAuth();
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accessToken) return;
    getSavedPlaces(accessToken).then((response) => setPlaces(response.places)).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '저장한 장소를 불러오지 못했어요.'));
  }, [accessToken]);
  return <AppShell className="product-shell archive-shell" activeNav="아카이브" showBottomNav><main className="archive-detail-screen"><PageHeader title="저장한 장소" backTo="/archive" className="page-header--product" />{error ? <p className="archive-error" role="alert">{error}</p> : null}{!places && !error ? <p className="archive-empty">장소를 불러오는 중이에요.</p> : null}{places && (places.length ? <div className="detail-card-list">{places.map((place) => <article className="detail-card" key={place.id}>{place.imageUrl ? <img src={place.imageUrl} alt="" /> : <span className="detail-card__placeholder" aria-hidden="true" />}<div><h2>{place.name}</h2>{place.address ? <p>{place.address}</p> : null}{place.category ? <small>{place.category}</small> : null}</div></article>)}</div> : <p className="archive-empty">저장한 장소가 아직 없어요.</p>)}</main></AppShell>;
}
