import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyPage, type MyPageResponse } from '../../api/myPage';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';
import { GardenView } from '../components/GardenView';

export function MyPagePage() {
  const { accessToken, user } = useAuth();
  const [data, setData] = useState<MyPageResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    getMyPage(accessToken).then(setData).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '내 페이지를 불러오지 못했어요.'));
  }, [accessToken]);

  const displayName = user?.name ?? data?.user.username ?? '나';
  return (
    <AppShell className="product-shell archive-shell" activeNav="내 페이지" showBottomNav>
      <main className="my-page-screen">
        <PageHeader title="내 페이지" backTo="/home" className="page-header--product" />
        {error ? <p className="archive-error" role="alert">{error}</p> : null}
        {!data && !error ? <p className="archive-empty">내 페이지를 불러오는 중이에요.</p> : null}
        {data ? <>
          <section className="profile-card">
            <div className="profile-card__avatar">{data.user.profileImageUrl ? <img src={data.user.profileImageUrl} alt="" /> : <img src="/assets/dami-default.png" alt="" />}</div>
            <div><h1>{displayName}</h1><p>@{data.user.username}</p></div><Link className="profile-card__edit" to="/onboarding/basic" aria-label="프로필 수정">✎</Link>
          </section>
          <section className="archive-paper-section">
            <h2>자기 관리 성향</h2>
            <p>{data.selfCareProfile?.summary || '아직 자기 관리 성향이 기록되지 않았어요.'}</p>
          </section>
          <section className="archive-paper-section neighbors-section">
            <div className="archive-section-heading"><h2>이웃 목록</h2><span>{data.neighbors.count}명</span></div>
            {data.neighbors.preview.length ? <div className="neighbor-list">{data.neighbors.preview.map((neighbor) => <div className="neighbor-list__item" key={neighbor.id}>{neighbor.profileImageUrl ? <img src={neighbor.profileImageUrl} alt="" /> : <span aria-hidden="true" /> }<strong>{neighbor.username}</strong></div>)}</div> : <p>아직 이웃이 없어요.</p>}
          </section>
        </> : null}
        <GardenView garden={data?.garden ?? null} isLoading={!data && !error} />
      </main>
    </AppShell>
  );
}
