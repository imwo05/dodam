import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPlace, deletePlace, getMyPlaces, getPlaceDetail, savePlace, unsavePlace, updatePlace, type PlaceDetail, type PlaceWriteInput } from '../../api/places';
import type { Coordinates, GeometryType, Place } from '../components/map/map.types';
import { MapView } from '../components/map/MapView';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

const CATEGORY_OPTIONS = [
  ['WALK', '산책'],
  ['EXERCISE', '운동'],
  ['DIET', '식사'],
  ['RUNNING', '달리기'],
  ['MENTAL_HEALTH', '마음 돌보기'],
  ['CUSTOM', '직접 입력']
] as const;

const INTENSITY_OPTIONS = [['LOW', '낮음'], ['MEDIUM', '보통'], ['HIGH', '높음']] as const;

function requestError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function DetailMap({ place }: { place: PlaceDetail }) {
  if (place.geometryType === 'SEGMENT' && place.geometry?.type === 'SEGMENT') return <MapView mode="SEGMENT" startPoint={place.geometry.startPoint} endPoint={place.geometry.endPoint} initialCenter={place.geometry.startPoint} ariaLabel={`${place.name} 구간 지도`} />;
  if (place.geometry?.type === 'POINT') return <MapView mode="POINT" point={place.geometry.point} initialCenter={place.geometry.point} ariaLabel={`${place.name} 위치 지도`} />;
  return <div className="map-view map-view--empty" role="region" aria-label="장소 위치 지도"><span className="map-view__status">좌표 정보가 없는 장소예요.</span></div>;
}

function PlaceFields({ value, onChange }: { value: { name: string; address: string; category: string; duration: string; intensity: string; description: string; tip: string; tags: string }; onChange: (value: { name: string; address: string; category: string; duration: string; intensity: string; description: string; tip: string; tags: string }) => void }) {
  function setField<K extends keyof typeof value>(key: K, next: (typeof value)[K]) { onChange({ ...value, [key]: next }); }
  return <div className="place-form__fields"><label>장소 이름<input required value={value.name} onChange={(event) => setField('name', event.target.value)} maxLength={100} /></label><label>주소<input required value={value.address} onChange={(event) => setField('address', event.target.value)} maxLength={255} /></label><label>활동 카테고리<select required value={value.category} onChange={(event) => setField('category', event.target.value)}><option value="">선택해 주세요</option>{CATEGORY_OPTIONS.map(([option, label]) => <option value={option} key={option}>{label}</option>)}</select></label><label>예상 시간(분)<input required type="number" min="1" max="1440" value={value.duration} onChange={(event) => setField('duration', event.target.value)} /></label><label>강도<select value={value.intensity} onChange={(event) => setField('intensity', event.target.value)}><option value="">선택 안 함</option>{INTENSITY_OPTIONS.map(([option, label]) => <option value={option} key={option}>{label}</option>)}</select></label><label>장소 설명<textarea value={value.description} onChange={(event) => setField('description', event.target.value)} maxLength={2000} /></label><label>TIP<textarea value={value.tip} onChange={(event) => setField('tip', event.target.value)} maxLength={500} /></label><label>분위기 태그<input value={value.tags} onChange={(event) => setField('tags', event.target.value)} placeholder="쉼표로 나눠 주세요" /></label></div>;
}

function RepresentativeImagePicker({ initialImageUrl }: { initialImageUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hideExistingImage, setHideExistingImage] = useState(false);
  const [error, setError] = useState('');
  const displayedImage = previewUrl ?? (hideExistingImage ? null : initialImageUrl ?? null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function selectImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 선택할 수 있어요.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    setHideExistingImage(false);
  }

  function removeImage() {
    setPreviewUrl(null);
    setHideExistingImage(Boolean(initialImageUrl));
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return <section className="place-photo-field" aria-labelledby="place-representative-image-label"><div className="place-photo-field__heading"><p id="place-representative-image-label">대표 사진</p><span>선택</span></div><input ref={inputRef} className="place-photo-field__input" type="file" accept="image/*" aria-label="대표 사진 파일 선택" onChange={(event) => { selectImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /><button type="button" className={`place-photo-picker ${displayedImage ? 'has-image' : ''}`} onClick={() => inputRef.current?.click()} aria-describedby="place-photo-picker-hint"><img className="place-photo-picker__surface" src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" />{displayedImage ? <img className="place-photo-picker__preview" src={displayedImage} alt="선택한 대표 사진 미리보기" /> : <span className="place-photo-picker__empty">대표 사진을 선택해 주세요</span>}<span className="place-photo-picker__action">{displayedImage ? '사진 바꾸기' : '사진 선택'}</span></button>{displayedImage ? <button type="button" className="place-photo-picker__remove" onClick={removeImage}>사진 지우기</button> : null}<p id="place-photo-picker-hint" className="place-photo-field__hint">사진은 이 화면에서만 미리 볼 수 있으며, 아직 장소에 저장되지는 않아요.</p>{error ? <p className="place-photo-field__error" role="alert">{error}</p> : null}</section>;
}

type PlaceFormValues = { name: string; address: string; category: string; duration: string; intensity: string; description: string; tip: string; tags: string };
const emptyValues: PlaceFormValues = { name: '', address: '', category: '', duration: '30', intensity: '', description: '', tip: '', tags: '' };

function initialValues(place?: PlaceDetail) {
  return place ? { name: place.name, address: place.address ?? '', category: place.category ?? '', duration: String(place.durationMinutes ?? 30), intensity: place.intensity ?? '', description: place.description ?? '', tip: place.tip ?? '', tags: place.atmosphereTags?.join(', ') ?? '' } : emptyValues;
}

function PlaceForm({ initial, geometryType, initialPoint, initialStart, initialEnd, onSubmit, submitLabel }: { initial?: PlaceDetail; geometryType: GeometryType; initialPoint?: Coordinates; initialStart?: Coordinates; initialEnd?: Coordinates; onSubmit: (input: PlaceWriteInput) => Promise<void>; submitLabel: string }) {
  const [values, setValues] = useState<PlaceFormValues>(() => initialValues(initial));
  const [point, setPoint] = useState<Coordinates | null>(initialPoint ?? null);
  const [startPoint, setStartPoint] = useState<Coordinates | null>(initialStart ?? null);
  const [endPoint, setEndPoint] = useState<Coordinates | null>(initialEnd ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValues(initialValues(initial)); setPoint(initialPoint ?? null); setStartPoint(initialStart ?? null); setEndPoint(initialEnd ?? null); }, [initial, initialPoint, initialStart, initialEnd]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericDuration = Number(values.duration);
    if (!values.category || !Number.isInteger(numericDuration) || numericDuration < 1) { setError('카테고리와 예상 시간을 확인해 주세요.'); return; }
    if (geometryType === 'POINT' && !point) { setError('지도에서 장소 위치를 선택해 주세요.'); return; }
    if (geometryType === 'SEGMENT' && (!startPoint || !endPoint)) { setError('지도에서 시작 위치와 종료 위치를 차례로 선택해 주세요.'); return; }
    const input: PlaceWriteInput = { name: values.name.trim(), address: values.address.trim(), activityType: values.category, geometryType, durationMinutes: numericDuration, ...(values.intensity ? { intensity: values.intensity } : {}), ...(values.description.trim() ? { description: values.description.trim() } : {}), ...(values.tip.trim() ? { tip: values.tip.trim() } : {}), ...(values.tags.trim() ? { atmosphereTags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean) } : {}), ...(geometryType === 'POINT' ? { point: point as Coordinates } : { startPoint: startPoint as Coordinates, endPoint: endPoint as Coordinates }) };
    setSaving(true); setError('');
    try { await onSubmit(input); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '장소를 저장하지 못했어요.')); } finally { setSaving(false); }
  }

  const center = point ?? startPoint ?? undefined;
  return <form className="place-form" onSubmit={(event) => void submit(event)} noValidate><p className="place-form__hint">지도에서 {geometryType === 'POINT' ? '한 곳' : '시작점과 종료점'}을 눌러 위치를 선택해 주세요.</p><RepresentativeImagePicker initialImageUrl={initial?.imageUrls?.[0] ?? initial?.image ?? null} /><MapView mode={geometryType} point={point ?? undefined} onPointChange={setPoint} startPoint={startPoint ?? undefined} endPoint={endPoint ?? undefined} onSegmentChange={(next) => { setStartPoint(next.startPoint); setEndPoint(next.endPoint); }} initialCenter={center} ariaLabel={geometryType === 'POINT' ? '장소 위치 선택 지도' : '구간 시작과 종료 위치 선택 지도'} /><div className="place-form__map-actions"><span>{geometryType === 'POINT' ? (point ? '위치 선택됨' : '위치 미선택') : (startPoint && endPoint ? '시작·종료 위치 선택됨' : startPoint ? '종료 위치를 선택해 주세요' : '시작 위치 미선택')}</span><button type="button" onClick={() => { setPoint(null); setStartPoint(null); setEndPoint(null); }}>위치 다시 선택</button></div><PlaceFields value={values} onChange={setValues} />{error ? <p className="place-form__error" role="alert">{error}</p> : null}<button type="submit" className="tape-button place-form__submit" disabled={saving}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{saving ? '저장 중' : submitLabel}</span></button></form>;
}

export function PlaceCreatePage() {
  const { geometry = 'point' } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const geometryType: GeometryType = geometry === 'segment' ? 'SEGMENT' : 'POINT';
  async function submit(input: PlaceWriteInput) {
    if (!accessToken) throw new Error('로그인이 필요해요.');
    const created = await createPlace(accessToken, input);
    navigate(`/places/${created.id}`);
  }
  return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="place-create-screen"><PageHeader title={geometryType === 'POINT' ? '장소 만들기' : '구간 만들기'} backTo="/archive/places" className="page-header--product" /><PlaceForm geometryType={geometryType} onSubmit={submit} submitLabel="장소 저장하기" /></main></AppShell>;
}

export function PlaceEditPage() {
  const { placeId = '' } = useParams();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!accessToken || !placeId) return; getPlaceDetail(accessToken, placeId).then(setPlace).catch((requestErrorValue) => setError(requestError(requestErrorValue, '장소를 불러오지 못했어요.'))); }, [accessToken, placeId]);
  if (!place && !error) return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="place-create-screen"><PageHeader title="장소 수정" backTo="/archive/places" className="page-header--product" /><p className="archive-empty">장소를 불러오는 중이에요.</p></main></AppShell>;
  if (!place) return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="place-create-screen"><PageHeader title="장소 수정" backTo="/archive/places" className="page-header--product" /><p className="archive-error" role="alert">{error}</p></main></AppShell>;
  const owned = Boolean(user?.id && place.creator?.id === user.id);
  const geometry = place.geometry?.type ?? place.geometryType;
  return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="place-create-screen"><PageHeader title="장소 수정" backTo={`/places/${place.id}`} className="page-header--product" />{owned ? <PlaceForm initial={place} geometryType={geometry} initialPoint={place.geometry?.type === 'POINT' ? place.geometry.point : undefined} initialStart={place.geometry?.type === 'SEGMENT' ? place.geometry.startPoint : undefined} initialEnd={place.geometry?.type === 'SEGMENT' ? place.geometry.endPoint : undefined} onSubmit={async (input) => { if (!accessToken) throw new Error('로그인이 필요해요.'); const updated = await updatePlace(accessToken, place.id, input); setPlace(updated); navigate(`/places/${updated.id}`); }} submitLabel="수정 저장하기" /> : <p className="archive-error" role="alert">본인이 만든 장소만 수정할 수 있어요.</p>}</main></AppShell>;
}

export function PlaceDetailPage() {
  const { placeId = '' } = useParams();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!accessToken || !placeId) return; getPlaceDetail(accessToken, placeId).then(setPlace).catch((requestErrorValue) => setError(requestError(requestErrorValue, '장소를 불러오지 못했어요.'))); }, [accessToken, placeId]);
  async function toggleSaved() {
    if (!accessToken || !place) return;
    setSaving(true); setError('');
    try { const result = place.isSaved ? await unsavePlace(accessToken, place.id) : await savePlace(accessToken, place.id); setPlace({ ...place, isSaved: result.isSaved }); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '저장 상태를 바꾸지 못했어요.')); } finally { setSaving(false); }
  }
  async function remove() {
    if (!accessToken || !place || place.creator?.id !== user?.id) return;
    setSaving(true); setError('');
    try { await deletePlace(accessToken, place.id); navigate('/archive/places'); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '장소를 삭제하지 못했어요.')); } finally { setSaving(false); }
  }
  const reviewCount = place?.reviewSummary ? (place.reviewSummary.count ?? place.reviewSummary.recommendCount + place.reviewSummary.disappointedCount) : null;
  return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="place-detail-screen"><PageHeader title="장소 상세" backTo="/plan-b" className="page-header--product" />{!place && !error ? <p className="archive-empty">장소를 불러오는 중이에요.</p> : null}{error && !place ? <p className="archive-error" role="alert">{error}</p> : null}{place ? <><DetailMap place={place} /><section className="place-detail-copy"><p className="product-eyebrow">{place.category ?? '자기관리'}</p><h1>{place.name}</h1>{place.address ? <p>{place.address}</p> : null}<div className="place-detail-meta">{place.durationMinutes ? <span>{place.durationMinutes}분</span> : null}{place.intensity ? <span>강도 {place.intensity}</span> : null}{reviewCount !== null ? <span>리뷰 {reviewCount}개</span> : null}</div>{place.description ? <p>{place.description}</p> : null}{place.tip ? <p>TIP · {place.tip}</p> : null}</section><div className="place-detail-actions"><button type="button" onClick={() => void toggleSaved()} disabled={saving}>{place.isSaved ? '저장 해제' : '장소 저장'}</button>{place.creator?.id === user?.id ? <><Link to={`/places/${place.id}/edit`}>수정</Link><button type="button" onClick={() => void remove()} disabled={saving}>삭제</button></> : null}</div>{error ? <p className="archive-error" role="alert">{error}</p> : null}<section className="place-reviews"><h2>리뷰</h2>{place.reviews.length ? place.reviews.map((review) => <article key={review.id}><strong>{review.reaction === 'RECOMMEND' ? '추천해요' : '아쉬워요'}</strong><p>{review.content || '내용 없음'}</p></article>) : <p>아직 리뷰가 없어요.</p>}</section></> : null}</main></AppShell>;
}

export function MyPlacesPage() {
  const { accessToken } = useAuth();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!accessToken) return; getMyPlaces(accessToken).then(setPlaces).catch((requestErrorValue) => setError(requestError(requestErrorValue, '내 장소를 불러오지 못했어요.'))); }, [accessToken]);
  return <AppShell className="product-shell place-shell" activeNav="아카이브" showBottomNav><main className="archive-detail-screen"><PageHeader title="내가 만든 장소" backTo="/archive" className="page-header--product" /><div className="place-create-links"><Link to="/places/new/point">POINT 장소 만들기</Link><Link to="/places/new/segment">SEGMENT 구간 만들기</Link></div>{error ? <p className="archive-error" role="alert">{error}</p> : null}{!places && !error ? <p className="archive-empty">내 장소를 불러오는 중이에요.</p> : null}{places?.length ? <div className="detail-card-list">{places.map((place) => <Link className="detail-card" key={place.id} to={`/places/${place.id}`}><span className="detail-card__placeholder" aria-hidden="true" /><div><h2>{place.name}</h2>{place.address ? <p>{place.address}</p> : null}<small>{place.geometryType} · {place.category ?? '자기관리'}</small></div></Link>)}</div> : null}{places && !places.length ? <p className="archive-empty">아직 만든 장소가 없어요.</p> : null}</main></AppShell>;
}
