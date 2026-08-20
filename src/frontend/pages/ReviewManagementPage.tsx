import { useEffect, useState } from 'react';
import { deleteReview, getMyReviews, type ArchiveReview } from '../../api/archive';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

export function ReviewManagementPage() {
  const { accessToken } = useAuth();
  const [reviews, setReviews] = useState<ArchiveReview[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accessToken) return;
    getMyReviews(accessToken).then((response) => setReviews(response.reviews)).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '리뷰를 불러오지 못했어요.'));
  }, [accessToken]);
  async function remove(reviewId: string) {
    if (!accessToken) return;
    setDeletingId(reviewId);
    try { await deleteReview(accessToken, reviewId); setReviews((current) => current?.filter((review) => review.id !== reviewId) ?? current); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '리뷰를 삭제하지 못했어요.'); } finally { setDeletingId(null); }
  }
  return <AppShell className="product-shell archive-shell" activeNav="아카이브" showBottomNav><main className="archive-detail-screen"><PageHeader title="장소 / 리뷰 관리" backTo="/archive" className="page-header--product" />{error ? <p className="archive-error" role="alert">{error}</p> : null}{!reviews && !error ? <p className="archive-empty">리뷰를 불러오는 중이에요.</p> : null}{reviews && (reviews.length ? <div className="review-detail-list">{reviews.map((review) => <article key={review.id}><div><h2>{review.place?.name ?? '장소 정보 없음'}</h2><p>{review.content || '작성한 내용이 없어요.'}</p><small>{review.reaction} · {review.createdAt.slice(0, 10)}</small></div><button type="button" onClick={() => void remove(review.id)} disabled={deletingId === review.id}>{deletingId === review.id ? '삭제 중' : '삭제'}</button></article>)}</div> : <p className="archive-empty">작성한 리뷰가 아직 없어요.</p>)}</main></AppShell>;
}
