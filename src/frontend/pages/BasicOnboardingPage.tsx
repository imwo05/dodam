import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOnboardingOptions, type OnboardingOptions } from '../../api/onboarding';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { AppShell, PageHeader } from '../components/AppShell';

const PURPOSE_OPTIONS = [
  { value: '스트레스 관리', label: '스트레스 관리' },
  { value: '운동', label: '운동' },
  { value: '식사', label: '식사' },
  { value: '체력 관리', label: '체력 관리' },
  { value: '기분 전환', label: '기분 전환' },
  { value: '수면 개선', label: '수면 개선' }
];
const WEEKLY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value: String(value), label: `${value}회` }));
const MINUTE_OPTIONS = [20, 30, 45, 60, 90, 120].map((value) => ({ value: String(value), label: `${value}분` }));
const REASON_OPTIONS = ['시간 부족', '피곤함', '갑작스러운 일정', '마음이 바뀜', '날씨', '약속'];
const ALLOWED_REGION_CODES = new Set(['JONGNO', 'GWANAK']);

type BasicValues = {
  purpose: string[];
  weeklyTargetCount: string;
  availableMinutes: string;
  residentialRegion: string;
  lifeRegion: string;
  planChangeReasons: string[];
  aiStyle: 'T' | 'F';
};

const initialValues: BasicValues = {
  purpose: [],
  weeklyTargetCount: '',
  availableMinutes: '',
  residentialRegion: '',
  lifeRegion: '',
  planChangeReasons: [],
  aiStyle: 'T'
};

function SurfaceSelect({ id, label, value, options, onChange, disabled = false }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className={`onboarding-surface-control ${value ? 'is-selected' : ''}`}>
      <img src={value ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" />
      <select id={id} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="" />
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="onboarding-surface-control__arrow" aria-hidden="true">⌄</span>
    </div>
  );
}

function CustomChipInput({ value, onChange, onCommit }: { value: string; onChange: (value: string) => void; onCommit: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onCommit();
  }
  return (
    <div className="onboarding-custom-chip">
      <img src="/assets/onboarding-option-surface.png" alt="" aria-hidden="true" />
      <input aria-label="직접 입력한 계획 변경 이유" enterKeyHint="done" value={value} placeholder="직접 입력" onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} />
    </div>
  );
}

function ReasonOption({ label, selected, onClick, className = '' }: { label: string; selected: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`onboarding-reason-option ${className} ${selected ? 'is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <img src={selected ? '/assets/onboarding-selected-surface.png' : '/assets/onboarding-option-surface.png'} alt="" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function MultiSurfaceOptions({ label, options, selectedValues, onToggle }: { label: string; options: Array<{ value: string; label: string }>; selectedValues: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="onboarding-purpose-options" role="group" aria-label={label}>
      {options.map((option) => (
        <ReasonOption
          key={option.value}
          className="onboarding-purpose-option"
          label={option.label}
          selected={selectedValues.includes(option.value)}
          onClick={() => onToggle(option.value)}
        />
      ))}
    </div>
  );
}

export function BasicOnboardingPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { profile, saveBasicProfile, loading, error: onboardingError } = useOnboarding();
  const [values, setValues] = useState<BasicValues>(initialValues);
  const [customReason, setCustomReason] = useState('');
  const [regions, setRegions] = useState<OnboardingOptions['regions']>([]);
  const [optionsError, setOptionsError] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    let active = true;
    getOnboardingOptions()
      .then((options) => {
        if (active) setRegions(options.regions.filter((region) => ALLOWED_REGION_CODES.has(region.code)));
      })
      .catch(() => {
        if (active) setOptionsError('지역 선택지를 불러오지 못했어요.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profile.purpose && !profile.weeklyTargetCount && !profile.availableMinutes) return;
    setValues((current) => ({
      ...current,
      purpose: profile.selfCareGoals?.length ? profile.selfCareGoals : profile.purpose ? [profile.purpose] : current.purpose,
      weeklyTargetCount: profile.weeklyTargetCount ? String(profile.weeklyTargetCount) : current.weeklyTargetCount,
      availableMinutes: profile.availableMinutes ? String(profile.availableMinutes) : current.availableMinutes,
      residentialRegion: profile.residentialRegion,
      lifeRegion: profile.lifeRegion,
      planChangeReasons: profile.planChangeReasons,
      aiStyle: profile.aiStyle
    }));
  }, [profile]);

  const customReasons = values.planChangeReasons.filter((reason) => !REASON_OPTIONS.includes(reason));

  function updateValue<K extends keyof BasicValues>(key: K, value: BasicValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setValidationError('');
  }

  function toggleReason(reason: string) {
    setValues((current) => ({
      ...current,
      planChangeReasons: current.planChangeReasons.includes(reason)
        ? current.planChangeReasons.filter((item) => item !== reason)
        : [...current.planChangeReasons, reason]
    }));
    setValidationError('');
  }

  function togglePurpose(purpose: string) {
    setValues((current) => ({
      ...current,
      purpose: current.purpose.includes(purpose)
        ? current.purpose.filter((item) => item !== purpose)
        : [...current.purpose, purpose]
    }));
    setValidationError('');
  }

  function addCustomReason() {
    const reason = customReason.trim().replace(/\s+/g, ' ');
    if (!reason) {
      setCustomReason('');
      return;
    }
    if (values.planChangeReasons.includes(reason)) {
      setValidationError('이미 선택한 이유예요.');
      return;
    }
    setValues((current) => ({ ...current, planChangeReasons: [...current.planChangeReasons, reason] }));
    setCustomReason('');
    setValidationError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setValidationError('로그인 후 기본 정보를 저장해 주세요.');
      return;
    }
    if (!values.purpose.length || !values.weeklyTargetCount || !values.availableMinutes || !values.residentialRegion || !values.lifeRegion || !values.planChangeReasons.length) {
      setValidationError('모든 기본 정보를 선택해 주세요.');
      return;
    }

    try {
      await saveBasicProfile(accessToken, {
        purpose: values.purpose[0],
        selfCareGoals: values.purpose,
        weeklyTargetCount: Number(values.weeklyTargetCount),
        availableMinutes: Number(values.availableMinutes),
        residentialRegion: values.residentialRegion,
        lifeRegion: values.lifeRegion,
        planChangeReasons: values.planChangeReasons,
        aiStyle: values.aiStyle
      });
      navigate('/onboarding/chat');
    } catch {
      // The context retains the values and server error so the user can retry.
    }
  }

  const regionOptions = regions.map((region) => ({ value: region.code, label: region.label }));

  return (
    <AppShell className="onboarding-shell onboarding-shell--basic">
      <main className="onboarding-screen basic-onboarding-screen" data-node-id="291:4008">
        <PageHeader title="온보딩" backTo="/signup" className="page-header--onboarding" />
        <section className="basic-onboarding-intro">
          <p>자기관리 정보</p>
          <h2>다음 옵션을 선택해 주세요.</h2>
        </section>
        <form className="basic-onboarding-form" onSubmit={handleSubmit} noValidate>
          <div className="basic-onboarding-field">
            <p className="basic-onboarding-label">자기관리 목적 <span>*</span></p>
            <MultiSurfaceOptions label="자기관리 목적" options={PURPOSE_OPTIONS} selectedValues={values.purpose} onToggle={togglePurpose} />
          </div>
          <div className="basic-onboarding-field">
            <label htmlFor="basic-weekly">주 당 횟수 <span>*</span></label>
            <SurfaceSelect id="basic-weekly" label="주 당 횟수" value={values.weeklyTargetCount} options={WEEKLY_OPTIONS} onChange={(value) => updateValue('weeklyTargetCount', value)} />
          </div>
          <div className="basic-onboarding-field">
            <label htmlFor="basic-minutes">가용시간 <span>*</span></label>
            <SurfaceSelect id="basic-minutes" label="가용시간" value={values.availableMinutes} options={MINUTE_OPTIONS} onChange={(value) => updateValue('availableMinutes', value)} />
          </div>
          <div className="basic-onboarding-field">
            <label htmlFor="basic-region">거주 지역 <span>*</span></label>
            <SurfaceSelect id="basic-region" label="거주 지역" value={values.residentialRegion} options={regionOptions} disabled={!regionOptions.length} onChange={(value) => updateValue('residentialRegion', value)} />
          </div>
          <div className="basic-onboarding-field">
            <label htmlFor="basic-life-region">직장 / 학교 등 생활권 <span>*</span></label>
            <SurfaceSelect id="basic-life-region" label="직장 / 학교 등 생활권" value={values.lifeRegion} options={regionOptions} disabled={!regionOptions.length} onChange={(value) => updateValue('lifeRegion', value)} />
          </div>
          <div className="basic-onboarding-field basic-onboarding-field--reasons">
            <p className="basic-onboarding-label">주로 계획이 바뀌는 이유 <span>*</span></p>
            <div className="onboarding-reason-grid">
              {REASON_OPTIONS.map((reason) => <ReasonOption key={reason} label={reason} selected={values.planChangeReasons.includes(reason)} onClick={() => toggleReason(reason)} />)}
              {customReasons.map((reason) => <ReasonOption key={reason} label={reason} selected onClick={() => toggleReason(reason)} />)}
              <CustomChipInput value={customReason} onChange={setCustomReason} onCommit={addCustomReason} />
            </div>
          </div>
          <div className="basic-onboarding-field basic-onboarding-field--style">
            <p className="basic-onboarding-label">담이가 어떻게 이야기해 주면 좋나요?</p>
            <div className="onboarding-style-options">
              <ReasonOption label="T  - 현실적인 대안 중심" selected={values.aiStyle === 'T'} onClick={() => updateValue('aiStyle', 'T')} />
              <ReasonOption label="F  - 공감과 응원 중심" selected={values.aiStyle === 'F'} onClick={() => updateValue('aiStyle', 'F')} />
            </div>
          </div>
          {optionsError ? <p className="onboarding-hint">{optionsError}</p> : null}
          {validationError || onboardingError ? <p className="onboarding-error">{validationError || onboardingError}</p> : null}
          <button className="onboarding-tape-button" type="submit" disabled={loading}>
            <img src="/assets/onboarding-tape.png" alt="" aria-hidden="true" />
            <span>{loading ? '저장 중' : '시작하기'}</span>
          </button>
        </form>
      </main>
    </AppShell>
  );
}
