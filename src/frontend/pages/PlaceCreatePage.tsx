import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPlace, getPlace, reverseGeocode, uploadPlaceImage, type PlaceCategory } from '../../api/places';
import type { Coordinates } from '../components/map/map.types';
import { MapView } from '../components/map/MapView';
import { AppShell, PageHeader } from '../components/AppShell';
import { useAuth } from '../../contexts/AuthContext';

type GeometryMode = 'POINT' | 'SEGMENT';

const categories: Array<{ value: PlaceCategory; label: string }> = [
  { value: 'WALK', label: '산책' },
  { value: 'EXERCISE', label: '운동' },
  { value: 'RUNNING', label: '러닝' },
  { value: 'DIET', label: '식단' },
  { value: 'MENTAL_HEALTH', label: '마음 돌봄' },
  { value: 'CUSTOM', label: '기타' }
];

function coordinateLabel(point?: Coordinates) {
  return point ? point.lat.toFixed(6) + ', ' + point.lng.toFixed(6) : '아직 선택하지 않았어요';
}

export function PlaceCreatePage({ mode }: { mode: GeometryMode }) {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [point, setPoint] = useState<Coordinates>();
  const [startPoint, setStartPoint] = useState<Coordinates>();
  const [endPoint, setEndPoint] = useState<Coordinates>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('WALK');
  const [description, setDescription] = useState('');
  const [tip, setTip] = useState('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | ''>('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [addressStatus, setAddressStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const addressPoint = mode === 'POINT' ? point : startPoint;
  const addressLat = addressPoint?.lat;
  const addressLng = addressPoint?.lng;

  useEffect(() => {
    if (addressLat == null || addressLng == null) {
      setAddressStatus('idle');
      return;
    }
    let active = true;
    setAddressStatus('loading');
    reverseGeocode({ lat: addressLat, lng: addressLng }).then((response) => {
      if (!active) return;
      setAddress(response.address ?? '');
      setAddressStatus(response.address ? 'ready' : 'failed');
    }).catch(() => {
      if (!active) return;
      setAddressStatus('failed');
      setAddress('');
    });
    return () => { active = false; };
  }, [addressLat, addressLng]);

  useEffect(() => () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [previews]);

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.currentTarget.files ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 4);
    setFiles(nextFiles);
    setPreviews(nextFiles.map((file) => URL.createObjectURL(file)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (mode === 'POINT' && !point) {
      setError('지도에서 장소를 한 곳 선택해 주세요.');
      return;
    }
    if (mode === 'SEGMENT' && (!startPoint || !endPoint)) {
      setError('지도에서 시작점과 끝점을 순서대로 선택해 주세요.');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const imageUrls: string[] = [];
      for (const file of files) imageUrls.push(await uploadPlaceImage(accessToken, file));
      const created = await createPlace(accessToken, {
        name: name.trim(),
        address: address.trim(),
        activityType: category,
        geometryType: mode,
        point: mode === 'POINT' && point ? { latitude: point.lat, longitude: point.lng } : undefined,
        startPoint: mode === 'SEGMENT' && startPoint ? { latitude: startPoint.lat, longitude: startPoint.lng } : undefined,
        endPoint: mode === 'SEGMENT' && endPoint ? { latitude: endPoint.lat, longitude: endPoint.lng } : undefined,
        description: description.trim(),
        tip: tip.trim(),
        durationMinutes: duration ? Number(duration) : undefined,
        intensity: intensity || undefined,
        imageUrls
      });
      const persisted = await getPlace(created.id, accessToken);
      navigate('/places/' + persisted.id, { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '장소를 저장하지 못했어요.');
    } finally {
      setIsSaving(false);
    }
  }

  const selectedPointText = mode === 'POINT'
    ? coordinateLabel(point)
    : startPoint && endPoint
      ? '시작 ' + coordinateLabel(startPoint) + ' · 끝 ' + coordinateLabel(endPoint)
      : startPoint
        ? '시작 ' + coordinateLabel(startPoint) + ' · 끝점을 선택해 주세요'
        : '시작점을 먼저 선택해 주세요';

  return (
    <AppShell className="product-shell place-shell" activeNav="Plan B" showBottomNav>
      <main className="place-create-screen" data-node-id={mode === 'POINT' ? '291:5368' : '440:2030'}>
        <PageHeader title={mode === 'POINT' ? '장소 등록' : '산책 구간 등록'} backTo="/plan-b" className="page-header--product" />
        <section className="place-create-intro">
          <p className="product-eyebrow">{mode === 'POINT' ? 'POINT' : 'SEGMENT'}</p>
          <h1>{mode === 'POINT' ? '좋았던 장소를 알려주세요' : '걸었던 구간을 알려주세요'}</h1>
          <p>{mode === 'POINT' ? '지도에서 한 곳을 눌러 위치를 남겨주세요.' : '시작점과 끝점을 차례대로 눌러 연결해 주세요.'}</p>
        </section>

        <div className="place-create-map-wrap">
          {mode === 'POINT' ? (
            <MapView
              mode="POINT"
              point={point}
              onPointChange={setPoint}
              className="place-create-map"
              ariaLabel="장소 등록 위치 선택 지도"
            />
          ) : (
            <MapView
              mode="SEGMENT"
              startPoint={startPoint}
              endPoint={endPoint}
              onSegmentChange={(value) => { setStartPoint(value.startPoint); setEndPoint(value.endPoint); }}
              className="place-create-map"
              ariaLabel="구간 등록 위치 선택 지도"
            />
          )}
        </div>
        <p className="place-create-selection" role="status">{selectedPointText}</p>
        {addressPoint ? (
          <div className="place-create-address-status">
            <span>{addressStatus === 'loading' ? '주소를 확인하는 중이에요.' : addressStatus === 'failed' ? '주소를 찾지 못했어요. 좌표는 그대로 사용할 수 있어요.' : '선택 위치 주소'}</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="주소를 직접 입력할 수도 있어요" aria-label="장소 주소" />
          </div>
        ) : null}

        <form className="place-create-form" onSubmit={handleSubmit}>
          <label className="place-form-field"><span>장소 이름 <b>*</b></span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 마음이 편해지는 공원" /></label>
          <label className="place-form-field"><span>활동 카테고리 <b>*</b></span><select required value={category} onChange={(event) => setCategory(event.target.value as PlaceCategory)}>{categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="place-form-field"><span>장소 설명 <b>*</b></span><textarea required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="이 장소에서 무엇을 할 수 있나요?" rows={4} /></label>
          <label className="place-form-field"><span>추천 팁 <b>*</b></span><textarea required value={tip} onChange={(event) => setTip(event.target.value)} placeholder="다른 사람에게 알려주고 싶은 팁" rows={3} /></label>
          <div className="place-form-row">
            <label className="place-form-field"><span>소요 시간(분)</span><input type="number" min="1" max="1440" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="30" /></label>
            <label className="place-form-field"><span>강도</span><select value={intensity} onChange={(event) => setIntensity(event.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | '')}><option value="">선택 안 함</option><option value="LOW">가벼움</option><option value="MEDIUM">보통</option><option value="HIGH">높음</option></select></label>
          </div>
          <label className="place-form-field"><span>사진</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handleFiles} /><small>최대 4장, 한 장당 10MB까지</small></label>
          {previews.length ? <div className="place-image-previews">{previews.map((preview, index) => <img src={preview} alt={'선택한 사진 ' + (index + 1)} key={preview} />)}</div> : null}
          {error ? <p className="place-form-error" role="alert">{error}</p> : null}
          <button className="tape-button place-submit" type="submit" disabled={isSaving}>{isSaving ? '저장 중...' : '장소 저장하기'}</button>
        </form>
      </main>
    </AppShell>
  );
}
