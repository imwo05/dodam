import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createJournal, createPlaceReview, createPlanBRecommendations, completePlanBStop, getPlaceDetail, getPlanBSession, removePlanBStop, reorderPlanBStops, skipPlanBStop, startPlanB, startPlanBStop, type PlanBCategory, type PlanBCondition, type PlanBContinuityMode, type PlanBInput as ApiPlanBInput, type PlanBResponse, type PlanBStop } from '../../api/planB';
import { getOnboardingOptions, type OnboardingOptions } from '../../api/onboarding';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanB, type PlanBInput as StoredPlanBInput } from '../../contexts/PlanBContext';
import { AppShell, PageHeader } from '../components/AppShell';
import { MapView } from '../components/map/MapView';
import { ScheduleTimePicker } from '../components/ScheduleTimePicker';
import { getCurrentPosition } from '../services/geolocation';
import { formatTime, isTimeAfter, todayKey } from '../utils/date';
import { PlanBExecutionView } from '../components/PlanBExecutionView';
import { getMapPlaces } from '../../api/places';
import type { MapBounds, Place } from '../components/map/map.types';

const CATEGORY_LABELS: Record<string, string> = { EXERCISE: '운동', DIET: '식사', WALK: '산책', RUNNING: '달리기', MENTAL_HEALTH: '마음 돌보기', CUSTOM: '직접 입력' };
const CONDITION_LABELS: Record<string, string> = { VERY_GOOD: '아주 좋아요', GOOD: '좋아요', NORMAL: '보통이에요', TIRED: '조금 피곤해요', VERY_TIRED: '많이 피곤해요' };
const CONTINUITY_LABELS: Record<string, string> = { SIMILAR: '비슷한 활동 이어가기', EASY: '더 쉬운 활동으로 바꾸기', MINIMUM: '최소한으로 이어가기', AUTO: '담이에게 맡기기' };
const INVALID_TIME_RANGE_MESSAGE = '종료 시간은 시작 시간보다 늦게 설정해 주세요.';

function labelFor(value: string, labels: Record<string, string>) { return labels[value] ?? value; }
function requestError(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

function SurfaceSelect({ id, label, value, options, placeholder, onChange, disabled = false }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }>; placeholder: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className={`plan-b-surface-select ${value ? 'is-selected' : ''}`}><img src={value ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" /><select id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">{placeholder}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><span aria-hidden="true">⌄</span></div>;
}

function GoalSummary({ session }: { session: PlanBResponse }) {
  return <section className="plan-b-goal-summary"><p className="plan-b-section-label">담이의 목표 재구성</p><h2>{session.reframedGoal.newGoal}</h2><p><span>원래 목표</span> {session.reframedGoal.originalGoal}</p><p>{session.reframedGoal.reason}</p>{session.summary ? <p className="plan-b-goal-summary__summary">{session.summary}</p> : null}</section>;
}

function DamiStateCard({ session }: { session: PlanBResponse }) {
  return <section className="plan-b-dami-card"><img src="/assets/dami-default.png" alt="담이" /><div><strong>담이의 추천</strong><p>{session.courseConcept ?? session.summary ?? ''}</p><small>상태 · {session.damiState ?? 'DEFAULT'} · {session.aiStyle} 스타일</small></div></section>;
}

function PageError({ message }: { message: string }) { return <p className="plan-b-error" role="alert">{message}</p>; }
function PageLoading() { return <p className="plan-b-empty" role="status">Plan B 정보를 불러오는 중이에요.</p>; }

export function PlanBEntryPage() {
  const { accessToken } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [bounds, setBounds] = useState<MapBounds | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    setLoading(true);
    getMapPlaces(accessToken ?? undefined, bounds).then((response) => { if (active) setPlaces(response.places); }).catch((requestErrorValue) => { if (active) setError(requestError(requestErrorValue, '장소를 불러오지 못했어요.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, bounds]);
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><main className="plan-b-screen plan-b-entry-screen"><PageHeader title="Plan B" backTo="/home" className="page-header--product" /><section className="plan-b-entry-copy"><p className="product-eyebrow">계획이 바뀐 순간</p><h1>오늘 가능한<br />다른 선택을 찾아볼까요?</h1><p>남은 시간과 컨디션을 알려주면 담이가 지금 할 수 있는 Plan B를 추천해요.</p></section><MapView mode="EXPLORE" places={places} className="plan-b-map-boundary" ariaLabel="Plan B 장소 지도 영역" onBoundsChange={setBounds} onPlaceSelect={(place) => navigate(`/places/${place.id}`)} isLoading={loading} error={error} /><p className="plan-b-map-note">장소를 누르면 상세 정보를 확인할 수 있어요.</p><Link className="tape-button plan-b-primary-action" to="/plan-b/input"><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>Plan B 시작하기</span></Link></main></AppShell>;
}

function TimeField({ id, label, value, minCanonical, onChange, onOpen }: { id: string; label: string; value: string; minCanonical?: string | null; onChange: (value: string) => void; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="plan-b-time-field"><span>{label}</span><button type="button" className={`plan-b-time-button ${value ? 'is-selected' : ''}`} id={id} onClick={() => { onOpen?.(); setOpen(true); }} aria-haspopup="dialog">{value ? formatTime(value) : '시간 선택'}</button>{open ? <ScheduleTimePicker value={value} onChange={onChange} onClose={() => setOpen(false)} minCanonical={minCanonical} minuteStep={5} /> : null}</div>;
}

export function PlanBInputPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { accessToken } = useAuth();
  const { input, setInput } = usePlanB();
  const [options, setOptions] = useState<OnboardingOptions | null>(null);
  const query = useMemo(() => new URLSearchParams(routerLocation.search), [routerLocation.search]);
  const [values, setValues] = useState<StoredPlanBInput>(() => ({ date: input.date || query.get('date') || todayKey(), startTime: input.startTime || '13:00', endTime: input.endTime || '14:00', selfCareCategory: input.selfCareCategory, customCategory: input.customCategory, condition: input.condition, continuityMode: input.continuityMode, currentLocation: input.currentLocation, brokenScheduleId: input.brokenScheduleId ?? query.get('brokenScheduleId') }));
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => { getOnboardingOptions().then(setOptions).catch((requestErrorValue) => setOptionsError(requestError(requestErrorValue, 'Plan B 선택지를 불러오지 못했어요.'))); }, []);
  function update<K extends keyof StoredPlanBInput>(key: K, value: StoredPlanBInput[K]) { setValues((current) => ({ ...current, [key]: value })); setError(''); }
  function updateStartTime(next: string) {
    const hasEndTime = Boolean(values.endTime);
    const endTimeIsInvalid = hasEndTime && !isTimeAfter(next, values.endTime);
    setValues((current) => ({ ...current, startTime: next, endTime: endTimeIsInvalid ? '' : current.endTime }));
    setTimeError((current) => endTimeIsInvalid ? INVALID_TIME_RANGE_MESSAGE : (hasEndTime ? '' : current));
    setError('');
  }
  function updateEndTime(next: string) {
    if (!isTimeAfter(values.startTime, next)) {
      setValues((current) => ({ ...current, endTime: '' }));
      setTimeError(INVALID_TIME_RANGE_MESSAGE);
      setError('');
      return;
    }
    setValues((current) => ({ ...current, endTime: next }));
    setTimeError('');
    setError('');
  }
  async function requestLocation() {
    setLocationLoading(true); setLocationMessage('');
    try { const position = await getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }); update('currentLocation', position); setLocationMessage('현재 위치를 사용해 추천할게요.'); }
    catch { setLocationMessage('위치를 가져오지 못했어요. 위치 없이도 추천을 받을 수 있어요.'); }
    finally { setLocationLoading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) { setError('로그인 후 Plan B를 시작해 주세요.'); return; }
    if (!values.date) { setTimeError('날짜를 선택해 주세요.'); setError(''); return; }
    if (!values.startTime || !values.endTime) { setTimeError('시작 시간과 종료 시간을 선택해 주세요.'); setError(''); return; }
    if (!isTimeAfter(values.startTime, values.endTime)) { setTimeError(INVALID_TIME_RANGE_MESSAGE); setError(''); return; }
    if (!options || !values.selfCareCategory || !values.condition || !values.continuityMode) { setTimeError(''); setError('시간과 모든 Plan B 선택지를 확인해 주세요.'); return; }
    if (values.selfCareCategory === 'CUSTOM' && !values.customCategory.trim()) { setError('직접 입력할 자기관리 활동을 적어 주세요.'); return; }
    setLoading(true); setTimeError(''); setError('');
    const request: ApiPlanBInput = { date: values.date, startTime: values.startTime, endTime: values.endTime, brokenScheduleId: values.brokenScheduleId ?? null, selfCareCategory: values.selfCareCategory as PlanBCategory, customCategory: values.selfCareCategory === 'CUSTOM' ? values.customCategory.trim() : null, condition: values.condition as PlanBCondition, continuityMode: values.continuityMode as PlanBContinuityMode, location: values.currentLocation ? { latitude: values.currentLocation.lat, longitude: values.currentLocation.lng } : null };
    try { const response = await createPlanBRecommendations(accessToken, request); setInput({ ...values, date: response.date || values.date }); navigate(`/plan-b/${response.sessionId}/recommendations`); }
    catch (requestErrorValue) { setError(requestError(requestErrorValue, '추천을 만들지 못했어요.')); }
    finally { setLoading(false); }
  }
  const categoryOptions = (options?.selfCareCategories ?? []).map((value) => ({ value, label: labelFor(value, CATEGORY_LABELS) }));
  const conditionOptions = (options?.conditions ?? []).map((value) => ({ value, label: labelFor(value, CONDITION_LABELS) }));
  const continuityOptions = (options?.continuityModes ?? []).map((value) => ({ value, label: labelFor(value, CONTINUITY_LABELS) }));
  return (
    <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav>
      <main className="plan-b-screen plan-b-input-screen">
        <PageHeader title="Plan B 입력" backTo="/plan-b" className="page-header--product" />
        <form onSubmit={submit} className="plan-b-form" noValidate>
          <p className="plan-b-section-label">오늘의 조건</p>
          <label className="plan-b-field-label" htmlFor="plan-b-date">날짜</label>
          <div className="plan-b-native-input"><img src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" /><input id="plan-b-date" type="date" value={values.date} onChange={(event) => update('date', event.target.value)} /></div>
          <div className="plan-b-time-row">
            <TimeField id="plan-b-start" label="시작 시간" value={values.startTime} onChange={updateStartTime} />
            <TimeField id="plan-b-end" label="종료 시간" value={values.endTime} minCanonical={values.startTime} onChange={updateEndTime} onOpen={() => setTimeError('')} />
          </div>
          <SurfaceSelect id="plan-b-category" label="자기관리 활동" value={values.selfCareCategory} options={categoryOptions} placeholder="자기관리 활동을 선택하세요" onChange={(value) => update('selfCareCategory', value)} disabled={!options} />
          {values.selfCareCategory === 'CUSTOM' ? <div className="plan-b-native-input"><img src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" /><input aria-label="직접 입력할 자기관리 활동" value={values.customCategory} onChange={(event) => update('customCategory', event.target.value)} placeholder="활동을 직접 입력하세요" /></div> : null}
          <SurfaceSelect id="plan-b-condition" label="현재 컨디션" value={values.condition} options={conditionOptions} placeholder="현재 컨디션을 선택하세요" onChange={(value) => update('condition', value)} disabled={!options} />
          <SurfaceSelect id="plan-b-continuity" label="이어가기 방식" value={values.continuityMode} options={continuityOptions} placeholder="이어가기 방식을 선택하세요" onChange={(value) => update('continuityMode', value)} disabled={!options} />
          <section className="plan-b-location-section"><div><p className="plan-b-section-label">현재 위치</p><p>{values.currentLocation ? `위치가 설정되었어요 (${values.currentLocation.lat.toFixed(4)}, ${values.currentLocation.lng.toFixed(4)})` : '선택 사항 · 위치 없이도 추천을 받을 수 있어요.'}</p></div><button type="button" className="plan-b-outline-action" onClick={() => void requestLocation()} disabled={locationLoading}>{locationLoading ? '확인 중' : '현재 위치 사용'}</button></section>
          {locationMessage ? <p className="plan-b-hint">{locationMessage}</p> : null}
          {optionsError ? <PageError message={optionsError} /> : null}
          {timeError ? <PageError message={timeError} /> : error ? <PageError message={error} /> : null}
          <button type="submit" className="tape-button plan-b-primary-action" disabled={loading || !options}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{loading ? '추천을 만드는 중' : '추천 받아보기'}</span></button>
        </form>
      </main>
    </AppShell>
  );
}

function StopOption({ stop, selected, onToggle }: { stop: PlanBStop; selected: boolean; onToggle: () => void }) {
  const image = stop.place.imageUrl ?? stop.place.imageUrls[0] ?? null;
  return <button type="button" className={`plan-b-stop-option ${selected ? 'is-selected' : ''}`} onClick={onToggle} aria-pressed={selected}><img className="plan-b-stop-option__surface" src={selected ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" /><span className="plan-b-stop-option__check" aria-hidden="true">{selected ? '✓' : ''}</span>{image ? <img className="plan-b-stop-option__photo" src={image} alt="" /> : null}<span className="plan-b-stop-option__body"><strong>{stop.place.name}</strong><small>{stop.place.primaryCategory ?? stop.place.category ?? '자기관리'} · {stop.durationMinutes}분</small>{stop.reason ? <em>{stop.reason}</em> : null}</span></button>;
}

export function PlanBRecommendationsPage() {
  const { sessionId = '' } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<PlanBResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!accessToken || !sessionId) return; getPlanBSession(accessToken, sessionId).then((response) => { setSession(response); setSelectedIds(response.course.stops.map((stop) => stop.id)); }).catch((requestErrorValue) => setError(requestError(requestErrorValue, '추천을 불러오지 못했어요.'))).finally(() => setLoading(false)); }, [accessToken, sessionId]);
  async function confirm() { if (!accessToken || !session || !selectedIds.length) { setError('최소 한 곳은 선택해 주세요.'); return; } setSaving(true); setError(''); try { let next = session; for (const stop of session.course.stops.filter((stop) => !selectedIds.includes(stop.id))) next = await removePlanBStop(accessToken, session.sessionId, stop.id); setSession(next); navigate(`/plan-b/${session.sessionId}/course`); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '추천 선택을 저장하지 못했어요.')); } finally { setSaving(false); } }
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><main className="plan-b-screen plan-b-recommendations-screen"><PageHeader title="추천 결과" backTo="/plan-b/input" className="page-header--product" />{loading ? <PageLoading /> : session ? <><GoalSummary session={session} /><DamiStateCard session={session} /><section className="plan-b-list-section"><div className="plan-b-list-heading"><div><p className="plan-b-section-label">추천 장소</p><h2>함께할 장소를 골라 주세요</h2></div><span>{selectedIds.length}/{session.course.stops.length}</span></div>{session.course.stops.length ? session.course.stops.map((stop) => <StopOption key={stop.id} stop={stop} selected={selectedIds.includes(stop.id)} onToggle={() => setSelectedIds((current) => current.includes(stop.id) ? (current.length === 1 ? current : current.filter((id) => id !== stop.id)) : [...current, stop.id])} />) : <p className="plan-b-empty">조건에 맞는 추천 장소가 없어요.</p>}</section>{error ? <PageError message={error} /> : null}<button type="button" className="tape-button plan-b-primary-action" onClick={() => void confirm()} disabled={saving || !session.course.stops.length}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{saving ? '저장 중' : '이 장소들로 구성하기'}</span></button></> : <PageError message={error || '추천을 찾지 못했어요.'} />}</main></AppShell>;
}

function CourseStop({ stop, index, total, editable, onRemove, onMove }: { stop: PlanBStop; index: number; total: number; editable: boolean; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  return <article className="plan-b-course-stop"><div className="plan-b-course-stop__order">{index + 1}</div><div className="plan-b-course-stop__content"><strong>{stop.place.name}</strong><span>{stop.place.primaryCategory ?? stop.place.category ?? '자기관리'} · {stop.durationMinutes}분 · 이동 {stop.travelMinutes}분</span>{stop.startTime && stop.endTime ? <small>{stop.startTime}–{stop.endTime}</small> : null}</div>{editable ? <div className="plan-b-course-stop__actions"><button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`${stop.place.name} 위로 이동`}>↑</button><button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`${stop.place.name} 아래로 이동`}>↓</button><button type="button" onClick={onRemove} disabled={total === 1}>삭제</button></div> : null}</article>;
}

export function PlanBCoursePage() {
  const { sessionId = '' } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<PlanBResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!accessToken || !sessionId) return; getPlanBSession(accessToken, sessionId).then(setSession).catch((requestErrorValue) => setError(requestError(requestErrorValue, '코스를 불러오지 못했어요.'))).finally(() => setLoading(false)); }, [accessToken, sessionId]);
  async function remove(stopId: string) { if (!accessToken || !session || session.course.stops.length <= 1) return; setActionLoading(true); try { setSession(await removePlanBStop(accessToken, session.sessionId, stopId)); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '장소를 삭제하지 못했어요.')); } finally { setActionLoading(false); } }
  async function move(index: number, direction: -1 | 1) { if (!accessToken || !session) return; const next = [...session.course.stops]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setActionLoading(true); try { setSession(await reorderPlanBStops(accessToken, session.sessionId, next.map((stop) => stop.id))); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '코스 순서를 저장하지 못했어요.')); } finally { setActionLoading(false); } }
  async function begin() { if (!accessToken || !session) return; if (session.status === 'IN_PROGRESS') { navigate(`/plan-b/${session.sessionId}/execute`); return; } setActionLoading(true); try { await startPlanB(accessToken, session.sessionId); navigate(`/plan-b/${session.sessionId}/execute`); } catch (requestErrorValue) { setError(requestError(requestErrorValue, 'Plan B를 시작하지 못했어요.')); } finally { setActionLoading(false); } }
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><main className="plan-b-screen plan-b-course-screen"><PageHeader title="Plan B 코스" backTo={`/plan-b/${sessionId}/recommendations`} className="page-header--product" />{loading ? <PageLoading /> : session ? <><GoalSummary session={session} /><section className="plan-b-course-summary"><strong>{session.course.totalMinutes}분</strong><span>담이가 장소별 이동 시간을 포함해 계산했어요.</span></section><section className="plan-b-list-section"><div className="plan-b-list-heading"><div><p className="plan-b-section-label">실행 순서</p><h2>{session.course.stops.length}곳 코스</h2></div><span>{session.status}</span></div>{session.course.stops.map((stop, index, stops) => <CourseStop key={stop.id} stop={stop} index={index} total={stops.length} editable={session.status === 'RECOMMENDED'} onRemove={() => void remove(stop.id)} onMove={(direction) => void move(index, direction)} />)}</section>{error ? <PageError message={error} /> : null}<button type="button" className="tape-button plan-b-primary-action" onClick={() => void begin()} disabled={actionLoading || !session.course.stops.length || session.status === 'COMPLETED'}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{session.status === 'IN_PROGRESS' ? '이어서 실행하기' : 'Plan B 시작하기'}</span></button></> : <PageError message={error || '코스를 찾지 못했어요.'} />}</main></AppShell>;
}

function usePlanBSession(sessionId: string, accessToken: string | null) {
  const [session, setSession] = useState<PlanBResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => { if (!accessToken || !sessionId) return null; const next = await getPlanBSession(accessToken, sessionId); setSession(next); return next; }, [accessToken, sessionId]);
  useEffect(() => { reload().catch((requestErrorValue) => setError(requestError(requestErrorValue, 'Plan B 정보를 불러오지 못했어요.'))).finally(() => setLoading(false)); }, [accessToken, sessionId]);
  return { session, setSession, loading, error, setError, reload };
}

export function PlanBExecutionPage() {
  const { sessionId = '' } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { session, loading, error, setError, reload } = usePlanBSession(sessionId, accessToken);
  const [actionLoading, setActionLoading] = useState(false);
  const [placeDetail, setPlaceDetail] = useState<PlanBStop['place'] | null>(null);
  const startingStop = useRef<string | null>(null);
  const currentStop = useMemo(() => session?.course.stops.find((stop) => stop.order === session.currentStopOrder) ?? session?.course.stops.find((stop) => ['NOT_STARTED', 'IN_PROGRESS'].includes(stop.status)), [session]);
  const currentPlaceId = currentStop?.place.id ?? '';
  useEffect(() => {
    let active = true;
    setPlaceDetail(null);
    if (!accessToken || !currentPlaceId) return () => { active = false; };
    getPlaceDetail(accessToken, currentPlaceId).then((detail) => { if (active) setPlaceDetail(detail); }).catch(() => { /* The serialized stop remains a valid fallback. */ });
    return () => { active = false; };
  }, [accessToken, currentPlaceId]);
  useEffect(() => { if (!session || session.status === 'COMPLETED') { if (session?.status === 'COMPLETED') navigate(`/plan-b/${session.sessionId}/review`, { replace: true }); return; } if (session.status !== 'IN_PROGRESS' || !currentStop || currentStop.status !== 'NOT_STARTED' || !accessToken || startingStop.current === currentStop.id) return; startingStop.current = currentStop.id; startPlanBStop(accessToken, session.sessionId, currentStop.id).then(() => reload()).catch((requestErrorValue) => setError(requestError(requestErrorValue, '현재 장소를 시작하지 못했어요.'))); }, [accessToken, currentStop, navigate, reload, session, setError]);
  async function finish(action: 'complete' | 'skip') { if (!accessToken || !session || !currentStop) return; setActionLoading(true); try { const result = action === 'complete' ? await completePlanBStop(accessToken, session.sessionId, currentStop.id) : await skipPlanBStop(accessToken, session.sessionId, currentStop.id); if (result.sessionStatus === 'COMPLETED' || !result.hasNextStop) navigate(`/plan-b/${session.sessionId}/review`); else { startingStop.current = null; await reload(); } } catch (requestErrorValue) { setError(requestError(requestErrorValue, '현재 장소 상태를 저장하지 못했어요.')); } finally { setActionLoading(false); } }
  const executionStop = currentStop && placeDetail?.id === currentPlaceId ? { ...currentStop, place: placeDetail } : currentStop;
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><PageHeader title="Plan B 실행" backTo={`/plan-b/${sessionId}/course`} className="page-header--product" />{loading ? <PageLoading /> : error ? <PageError message={error} /> : session && executionStop ? <PlanBExecutionView session={session} currentStop={executionStop} index={Math.max(0, session.course.stops.findIndex((stop) => stop.id === executionStop.id))} total={session.course.stops.length} loading={actionLoading} onComplete={() => void finish('complete')} onSkip={() => void finish('skip')} /> : <PageError message="실행할 장소가 없어요." />}</AppShell>;
}

export function PlanBReviewPage() {
  const { sessionId = '' } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { session, loading, error, setError } = usePlanBSession(sessionId, accessToken);
  const [selectedStopId, setSelectedStopId] = useState('');
  const [reaction, setReaction] = useState<'RECOMMEND' | 'DISAPPOINTED'>('RECOMMEND');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const stops = session?.course.stops.filter((stop) => stop.status === 'COMPLETED' || stop.status === 'SKIPPED') ?? [];
  useEffect(() => { if (!selectedStopId && stops[0]) setSelectedStopId(stops[0].id); }, [selectedStopId, stops]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const stop = stops.find((item) => item.id === selectedStopId); if (!accessToken || !session || !stop) { setError('리뷰를 남길 장소를 선택해 주세요.'); return; } setSaving(true); try { await createPlaceReview(accessToken, stop.place.id, { reaction, content: content.trim() || undefined, planBSessionId: session.sessionId }); navigate(`/plan-b/${session.sessionId}/journal`); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '리뷰를 저장하지 못했어요.')); } finally { setSaving(false); } }
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><main className="plan-b-screen plan-b-review-screen"><PageHeader title="실행 돌아보기" backTo={`/plan-b/${sessionId}/execute`} className="page-header--product" />{loading ? <PageLoading /> : session ? <form onSubmit={submit}><p className="plan-b-section-label">오늘의 Plan B는 어땠나요?</p><h1 className="plan-b-review-title">실행한 장소를<br />짧게 돌아봐요.</h1><div className="plan-b-review-stops">{stops.map((stop) => <button type="button" key={stop.id} className={`plan-b-review-stop ${selectedStopId === stop.id ? 'is-selected' : ''}`} onClick={() => setSelectedStopId(stop.id)} aria-pressed={selectedStopId === stop.id}><img src={selectedStopId === stop.id ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" /><span>{stop.place.name}</span><small>{stop.status === 'SKIPPED' ? '건너뜀' : '완료'}</small></button>)}</div><div className="plan-b-reaction-options"><button type="button" className={reaction === 'RECOMMEND' ? 'is-selected' : ''} onClick={() => setReaction('RECOMMEND')} aria-pressed={reaction === 'RECOMMEND'}>추천해요</button><button type="button" className={reaction === 'DISAPPOINTED' ? 'is-selected' : ''} onClick={() => setReaction('DISAPPOINTED')} aria-pressed={reaction === 'DISAPPOINTED'}>아쉬워요</button></div><textarea className="plan-b-textarea" value={content} onChange={(event) => setContent(event.target.value)} placeholder="짧은 메모를 남겨 보세요 (선택)" maxLength={2000} />{error ? <PageError message={error} /> : null}<button type="submit" className="tape-button plan-b-primary-action" disabled={saving || !stops.length}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{saving ? '저장 중' : '리뷰 남기기'}</span></button>{!stops.length ? <p className="plan-b-hint">완료하거나 건너뛴 장소가 없어 리뷰를 남길 수 없어요.</p> : null}</form> : <PageError message={error || '실행 기록을 찾지 못했어요.'} />}</main></AppShell>;
}

export function PlanBJournalPage() {
  const { sessionId = '' } = useParams();
  const { accessToken } = useAuth();
  const { input } = usePlanB();
  const navigate = useNavigate();
  const { session, loading, error, setError } = usePlanBSession(sessionId, accessToken);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stop = session?.course.stops.find((item) => item.status === 'COMPLETED') ?? session?.course.stops[0];
  const sessionDate = session?.date || input.date || todayKey();
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  function selectPhoto(file: File | undefined) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(file ? URL.createObjectURL(file) : null); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!accessToken || !session || !content.trim()) { setError('일지 내용을 한 글자 이상 입력해 주세요.'); return; } setSaving(true); try { await createJournal(accessToken, { date: sessionDate, placeId: stop?.place.id ?? null, planBSessionId: session.sessionId, content: content.trim(), imageUrls: [], tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }); navigate('/archive'); } catch (requestErrorValue) { setError(requestError(requestErrorValue, '일지를 저장하지 못했어요.')); } finally { setSaving(false); } }
  return <AppShell className="product-shell plan-b-shell" activeNav="Plan B" showBottomNav><main className="plan-b-screen plan-b-journal-screen"><PageHeader title="일지 남기기" backTo={`/plan-b/${sessionId}/review`} className="page-header--product" />{loading ? <PageLoading /> : session ? <form onSubmit={submit}><p className="plan-b-section-label">오늘의 기록</p><h1 className="plan-b-review-title">오늘의 Plan B를<br />기록해 둘까요?</h1><div className="plan-b-journal-place"><strong>{stop?.place.name ?? 'Plan B'}</strong><span>{sessionDate}</span></div><textarea className="plan-b-textarea plan-b-journal-textarea" value={content} onChange={(event) => setContent(event.target.value)} placeholder="오늘 느낀 점을 적어 보세요" maxLength={2000} required /><label className="plan-b-native-input plan-b-tag-input"><span>태그</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="쉼표로 태그를 나눠 입력하세요" /></label><label className="plan-b-photo-boundary"><span>사진 추가</span><input type="file" accept="image/*" onChange={(event) => selectPhoto(event.target.files?.[0])} />{previewUrl ? <img src={previewUrl} alt="선택한 사진 미리보기" /> : <small>사진은 현재 미리보기만 제공하며, 저장 요청에는 업로드되지 않아요.</small>}</label>{error ? <PageError message={error} /> : null}<button type="submit" className="tape-button plan-b-primary-action" disabled={saving}><img src="/assets/tape-primary.png" alt="" aria-hidden="true" /><span>{saving ? '저장 중' : '일지 저장하기'}</span></button></form> : <PageError message={error || '일지 대상을 찾지 못했어요.'} />}</main></AppShell>;
}
