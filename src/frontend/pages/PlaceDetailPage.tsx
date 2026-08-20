import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPlace, placeDetailToMapPlace, savePlace, unsavePlace, type PlaceDetail } from '../../api/places';
import { useAuth } from '../../contexts/AuthContext';
import { MapView } from '../components/map/MapView';
import { AppShell, PageHeader } from '../components/AppShell';

function pointText(point: { latitude: number; longitude: number } | null | undefined) {
  return point ? point.latitude.toFixed(6) + ', ' + point.longitude.toFixed(6) : '';
}

export function PlaceDetailPage() {
  const { placeId } = useParams();
  const { accessToken } = useAuth();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!placeId) return;
    let active = true;
    getPlace(placeId, accessToken ?? undefined).then((next) => {
      if (active) setPlace(next);
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : '장소를 불러오지 못했어요.');
    });
    return () => { active = false; };
  }, [accessToken, placeId]);

  async function toggleSaved() {
    if (!placeId || !accessToken || !place) return;
    setIsSaving(true);
    try {
      if (place.isSaved) await unsavePlace(accessToken, placeId);
      else await savePlace(accessToken, placeId);
      setPlace(await getPlace(placeId, accessToken));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '저장 상태를 바꾸지 못했어요.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell className="product-shell place-shell" activeNav="Plan B" showBottomNav>
      <main className="place-detail-screen" data-node-id="291:5155">
        <PageHeader title="장소 상세" backTo="/plan-b" className="page-header--product" />
        {error ? <p className="place-form-error" role="alert">{error}</p> : null}
        {!place && !error ? <p className="place-loading">장소를 불러오는 중이에요.</p> : null}
        {place ? <>
          <section className="place-detail-heading">
            <p className="product-eyebrow">{place.category ?? '장소'}</p>
            <h1>{place.name}</h1>
            {place.address ? <p>{place.address}</p> : <p>주소 정보가 없어요.</p>}
            <button type="button" className="place-save-button" onClick={toggleSaved} disabled={isSaving}>{place.isSaved ? '저장 해제' : '저장하기'}</button>
          </section>
          <MapView mode="EXPLORE" places={[placeDetailToMapPlace(place)]} className="place-detail-map" ariaLabel="장소 상세 위치 지도" />
          <section className="place-detail-copy" data-node-id="291:5213">
            <h2>이 장소에서</h2>
            <p>{place.description}</p>
            {place.tip ? <><h2>담이의 팁</h2><p>{place.tip}</p></> : null}
            {place.durationMinutes ? <p className="place-detail-meta">약 {place.durationMinutes}분</p> : null}
            {place.geometryType === 'POINT' ? <p className="place-detail-coordinates">좌표 {pointText(place.geometry.point)}</p> : <div className="place-detail-coordinates"><p>시작 {pointText(place.geometry.start)}</p><p>끝 {pointText(place.geometry.end)}</p></div>}
          </section>
          {place.imageUrls.length ? <section className="place-detail-images" data-node-id="291:5271">{place.imageUrls.map((imageUrl, index) => <img src={imageUrl} alt={place.name + ' 사진 ' + (index + 1)} key={imageUrl + '-' + index} />)}</section> : null}
          <section className="place-detail-footer" data-node-id="291:5597"><span>{place.creator?.maskedUsername ? 'by ' + place.creator.maskedUsername : '도담 장소'}</span><span>{place.isSaved ? '저장됨' : '아직 저장하지 않음'}</span></section>
        </> : null}
      </main>
    </AppShell>
  );
}
