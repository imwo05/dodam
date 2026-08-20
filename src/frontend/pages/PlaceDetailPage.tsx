import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPlace, savePlace, unsavePlace, type PlaceDetail } from '../../api/places';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell } from '../components/AppShell';
import { PlaceScreenHeader } from '../components/PlaceScreenHeader';

type PlaceReview = {
  id: string;
  reaction: string;
  content: string;
  author?: { maskedUsername: string | null };
  createdAt: string;
};

function pointText(point: { latitude: number; longitude: number } | null | undefined) {
  return point ? point.latitude.toFixed(6) + ', ' + point.longitude.toFixed(6) : '';
}

function dateText() {
  return new Intl.DateTimeFormat('en-CA').format(new Date()).replaceAll('-', '.') + '.';
}

function reviewItems(value: unknown[]): PlaceReview[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const review = item as Partial<PlaceReview>;
    if (typeof review.id !== 'string' || typeof review.content !== 'string') return [];
    return [{
      id: review.id,
      reaction: typeof review.reaction === 'string' ? review.reaction : 'RECOMMEND',
      content: review.content,
      author: review.author,
      createdAt: typeof review.createdAt === 'string' ? review.createdAt : ''
    }];
  });
}

function PlaceImage({ place }: { place: PlaceDetail }) {
  const imageUrl = place.imageUrls[0];
  return (
    <div className="place-detail-image-frame">
      {imageUrl ? <img src={imageUrl} alt={place.name + ' 대표 사진'} loading="lazy" /> : (
        <>
          <img className="place-detail-image-frame__paper" src="/assets/place-frame-92.png" alt="" aria-hidden="true" />
          <img className="place-detail-image-frame__surface" src="/assets/place-frame-93.png" alt="" aria-hidden="true" />
          <span>장소 등록자가 업로드한 사진</span>
        </>
      )}
    </div>
  );
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

  const reviews = place ? reviewItems(place.reviews) : [];

  return (
    <AppShell className="product-shell place-shell" activeNav="Plan B" showBottomNav>
      <main className="place-detail-screen" data-node-id="291:5155">
        <PlaceScreenHeader title={dateText()} backTo="/plan-b" plusTo="/places/create/point" />
        {error ? <p className="place-form-error" role="alert">{error}</p> : null}
        {!place && !error ? <p className="place-loading">장소를 불러오는 중이에요.</p> : null}
        {place ? <>
          <section className="place-detail-heading">
            <p className="place-detail-kicker">첫 번째 장소</p>
            <span className="place-detail-chip">{place.category ?? '장소'}</span>
            <h1>{place.name}</h1>
            <p>{place.address || '상세 주소 정보가 없어요.'}</p>
            {place.durationMinutes ? <p className="place-detail-duration">소요 시간 {place.durationMinutes}분</p> : null}
            <button type="button" className="place-save-button" onClick={toggleSaved} disabled={isSaving}>{place.isSaved ? '저장 해제' : '저장하기'}</button>
          </section>

          <section className="place-detail-card" data-node-id="291:5213">
            <PlaceImage place={place} />
            <p className="place-detail-card__description">{place.description}</p>
            {place.tip ? <p className="place-detail-card__tip">{place.tip}</p> : null}
          </section>

          <section className="place-detail-location" aria-label="장소 위치">
            <strong>{place.geometryType === 'POINT' ? '선택한 위치' : '선택한 구간'}</strong>
            {place.geometryType === 'POINT' ? <p>{pointText(place.geometry.point)}</p> : <><p>시작 {pointText(place.geometry.start)}</p><p>끝 {pointText(place.geometry.end)}</p></>}
          </section>

          <section className="place-detail-neighbors" data-node-id="291:5271">
            <h2>이웃들의 목소리</h2>
            {reviews.length ? reviews.map((review) => (
              <article className="place-review" key={review.id}>
                <span className="place-review__avatar" aria-hidden="true">♙</span>
                <div><strong>{review.author?.maskedUsername ?? '이웃'}</strong><p>{review.content || '추천합니다!'}</p></div>
              </article>
            )) : <p className="place-review-empty">아직 남겨진 후기가 없어요.</p>}
          </section>

          <Link className="tape-button place-detail-complete" to="/plan-b" data-node-id="291:5597">완료하기</Link>
        </> : null}
      </main>
    </AppShell>
  );
}
