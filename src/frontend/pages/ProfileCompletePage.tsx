import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding, getSelfCareProfile } from '../../api/users';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { AppShell } from '../components/AppShell';

function joinOrEmpty(values: string[]) {
  return values.length ? values.join(', ') : '아직 기록된 내용이 없어요.';
}

export function ProfileCompletePage() {
  const navigate = useNavigate();
  const { accessToken, user, refreshUser } = useAuth();
  const { profile } = useOnboarding();
  const [serverProfile, setServerProfile] = useState(profile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getSelfCareProfile(accessToken).then((next) => {
      if (active) setServerProfile(next);
    }).catch(() => {
      // The conversation profile remains the source of truth if a legacy profile is unavailable.
    });
    return () => { active = false; };
  }, [accessToken]);

  async function finish() {
    if (!accessToken || loading) return;
    setLoading(true);
    setError('');
    try {
      await completeOnboarding(accessToken);
      await refreshUser(accessToken);
      navigate('/home');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '프로필을 완료하지 못했어요.');
    } finally {
      setLoading(false);
    }
  }

  const concern = serverProfile.selfCareDifficultyReasons.length
    ? serverProfile.selfCareDifficultyReasons
    : serverProfile.difficultyAfterPlanChange;
  const fallback = serverProfile.availableFallbackMinutes
    ? `${serverProfile.availableFallbackMinutes.min}~${serverProfile.availableFallbackMinutes.max}분`
    : serverProfile.availableMinutes ? `${serverProfile.availableMinutes}분` : '아직 기록된 내용이 없어요.';

  return (
    <AppShell className="product-shell profile-complete-shell" activeNav="홈" showBottomNav>
      <main className="profile-complete-screen" data-node-id="291:4120">
        <h1>프로필이 완성되었습니다.</h1>
        <section className="profile-summary" aria-label="완성된 프로필">
          <p>자기관리 영역: <strong>{joinOrEmpty(serverProfile.selfCareGoals)}</strong></p>
          <p>자기관리 고민: <strong>{joinOrEmpty(concern)}</strong></p>
          <p>가용 시간: <strong>{fallback}</strong></p>
          <p>성향: <strong>{serverProfile.aiStyle === 'T' ? '현실적인 대안 중심' : '공감과 응원 중심'}</strong></p>
        </section>
        <p className="profile-complete-copy">{user?.name ?? '나'}님의 프로필에 맞춰<br />추천 코스 리스트가 완성되었습니다.</p>
        <button className="tape-button profile-start-button" type="button" onClick={() => void finish()} disabled={loading}>
          <img src="/assets/tape-primary.png" alt="" aria-hidden="true" />
          <span>{loading ? '준비 중' : '시작하기'}</span>
        </button>
        {error ? <p className="profile-complete-error" role="alert">{error}</p> : null}
        <button className="tape-button profile-edit-button" type="button" onClick={() => navigate('/onboarding/basic')}>
          <img src="/assets/onboarding-tape.png" alt="" aria-hidden="true" />
          <span>프로필 수정하기</span>
        </button>
      </main>
    </AppShell>
  );
}
