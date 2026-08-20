import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPlace, getPlace, reverseGeocode, uploadPlaceImage, type PlaceCategory } from '../../api/places';
import type { Coordinates } from '../components/map/map.types';
import { MapView } from '../components/map/MapView';
import { AppShell } from '../components/AppShell';
import { PlaceScreenHeader } from '../components/PlaceScreenHeader';
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

function PlacePhotoField({ previews, onChange }: { previews: string[]; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="place-create-photo-field">
      <span className="place-create-field-label">대표 사진 <b>*</b></span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onChange} aria-label="대표 사진 선택" />
      <span className="place-create-photo-surface">
        {previews.length ? previews.map((preview, index) => <img src={preview} alt={'선택한 대표 사진 ' + (index + 1)} key={preview} />) : (
          <>
            <img className="place-create-photo-surface__paper" src="/assets/place-frame-92.png" alt="" aria-hidden="true" />
            <img className="place-create-photo-surface__frame" src="/assets/place-frame-93.png" alt="" aria-hidden="true" />
            <img className="place-create-photo-surface__plus" src="/assets/place-plus.svg" alt="" aria-hidden="true" />
          </>
        )}
      </span>
    </label>
  );
}

function GeometryToggle({ mode }: { mode: GeometryMode }) {
  return (
    <div className="place-geometry-toggle" aria-label="위치 유형">
      <Link className={mode === 'POINT' ? 'is-selected' : ''} to="/places/create/point" aria-current={mode === 'POINT' ? 'page' : undefined}>
        <img src={mode === 'POINT' ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" />
        <span>지점</span>
      </Link>
      <Link className={mode === 'SEGMENT' ? 'is-selected' : ''} to="/places/create/segment" aria-current={mode === 'SEGMENT' ? 'page' : undefined}>
        <img src={mode === 'SEGMENT' ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" />
        <span>구간</span>
      </Link>
    </div>
  );
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
      <main className={`place-create-screen place-create-screen--${mode.toLowerCase()}`} data-node-id={mode === 'POINT' ? '291:5368' : '440:2030'}>
        <PlaceScreenHeader title="나만의 장소 생성" backTo="/plan-b" plusTo="/places/create/point" />
        <section className="place-create-intro">
          <p className="product-eyebrow">나만의 장소 만들기</p>
          <h1>세상에 단 하나뿐인<br />나만의 장소를 등록해 보세요.</h1>
        </section>

        <PlacePhotoField previews={previews} onChange={handleFiles} />

        <label className="place-create-address-field">
          <span className="place-create-field-label">상세 주소 <b>*</b></span>
          <span className="place-create-surface-control">
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="선택한 위치의 주소를 입력해 주세요" aria-label="장소 주소" />
          </span>
          {addressStatus === 'loading' ? <small>주소를 확인하는 중이에요.</small> : null}
          {addressStatus === 'failed' ? <small>주소를 찾지 못했어요. 좌표는 그대로 사용할 수 있어요.</small> : null}
        </label>

        <section className="place-create-geometry" aria-label="위치 선택">
          <p className="place-create-field-label">위치 유형 <b>*</b></p>
          <GeometryToggle mode={mode} />
          <p className="place-create-instruction">{mode === 'POINT' ? '지도에서 위치를 눌러 한 지점을 선택해 주세요.' : '시작점과 종료점을 차례로 눌러 구간을 지정해 주세요.'}</p>
          <div className="place-create-map-wrap">
            {mode === 'POINT' ? (
              <MapView mode="POINT" point={point} onPointChange={setPoint} className="place-create-map" ariaLabel="장소 등록 위치 선택 지도" />
            ) : (
              <MapView mode="SEGMENT" startPoint={startPoint} endPoint={endPoint} onSegmentChange={(value) => { setStartPoint(value.startPoint); setEndPoint(value.endPoint); }} className="place-create-map" ariaLabel="구간 등록 위치 선택 지도" />
            )}
          </div>
          <p className="place-create-selection" role="status"><span>선택 위치</span>{selectedPointText}</p>
        </section>

        <form className="place-create-form" onSubmit={handleSubmit}>
          <label className="place-form-field place-form-field--surface"><span className="place-create-field-label">장소 이름 <b>*</b></span><span className="place-create-surface-control"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 마음이 편해지는 공원" /></span></label>
          <div className="place-form-row">
            <label className="place-form-field place-form-field--surface"><span className="place-create-field-label">활동 유형 <b>*</b></span><span className="place-create-surface-control"><select required value={category} onChange={(event) => setCategory(event.target.value as PlaceCategory)}>{categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></span></label>
            <label className="place-form-field place-form-field--surface"><span className="place-create-field-label">소요 시간 <b>*</b></span><span className="place-create-surface-control"><input type="number" min="1" max="1440" required value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="30분" /></span></label>
          </div>
          <label className="place-form-field place-form-field--surface"><span className="place-create-field-label">장소 설명 <b>*</b></span><span className="place-create-textarea-control"><textarea required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="이 장소에서 무엇을 할 수 있나요?" rows={4} /></span></label>
          <label className="place-form-field place-form-field--surface"><span className="place-create-field-label">나만의 팁</span><span className="place-create-textarea-control"><textarea required value={tip} onChange={(event) => setTip(event.target.value)} placeholder="다른 사람에게 알려주고 싶은 팁" rows={3} /></span></label>
          <details className="place-create-optional-fields">
            <summary>추가 정보</summary>
            <label className="place-form-field"><span>강도</span><select value={intensity} onChange={(event) => setIntensity(event.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | '')}><option value="">선택 안 함</option><option value="LOW">가벼움</option><option value="MEDIUM">보통</option><option value="HIGH">높음</option></select></label>
          </details>
          {error ? <p className="place-form-error" role="alert">{error}</p> : null}
          <button className="tape-button place-submit" type="submit" disabled={isSaving}>{isSaving ? '저장 중...' : '등록하기'}</button>
        </form>
      </main>
    </AppShell>
  );
}
