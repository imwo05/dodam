import { useEffect, useState } from 'react';
import { getActivities, type ArchiveActivity } from '../../api/archive';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

export function MyActivityPage() {
  const { accessToken } = useAuth();
  const [activities, setActivities] = useState<ArchiveActivity[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accessToken) return;
    getActivities(accessToken, { limit: 100 }).then((response) => setActivities(response.activities)).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '활동 기록을 불러오지 못했어요.'));
  }, [accessToken]);
  return <AppShell className="product-shell archive-shell" activeNav="아카이브" showBottomNav><main className="archive-detail-screen"><PageHeader title="나의 활동 기록" backTo="/archive" className="page-header--product" />{error ? <p className="archive-error" role="alert">{error}</p> : null}{!activities && !error ? <p className="archive-empty">활동 기록을 불러오는 중이에요.</p> : null}{activities && (activities.length ? <div className="activity-detail-list">{activities.map((activity) => <article key={activity.id}><div><strong>{activity.category}</strong><span>{activity.date}</span></div>{activity.durationMinutes ? <b>{activity.durationMinutes}분</b> : null}</article>)}</div> : <p className="archive-empty">아직 활동 기록이 없어요.</p>)}</main></AppShell>;
}
