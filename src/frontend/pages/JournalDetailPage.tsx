import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteJournal, getJournal, getJournals, type Journal } from '../../api/archive';
import { useAuth } from '../../contexts/AuthContext';
import { AppShell, PageHeader } from '../components/AppShell';

export function JournalDetailPage() {
  const { accessToken } = useAuth();
  const { journalId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const date = new URLSearchParams(location.search).get('date');
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accessToken) return;
    const request = journalId ? getJournal(accessToken, journalId) : date ? getJournals(accessToken, date).then((response) => response.journals[0] ?? null) : Promise.resolve(null);
    request.then(setJournal).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '일지를 불러오지 못했어요.'));
  }, [accessToken, date, journalId]);
  async function remove() {
    if (!accessToken || !journal) return;
    try { await deleteJournal(accessToken, journal.id); navigate('/archive'); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '일지를 삭제하지 못했어요.'); }
  }
  return <AppShell className="product-shell archive-shell" activeNav="아카이브" showBottomNav><main className="journal-detail-screen"><PageHeader title="나의 일지" backTo="/archive" className="page-header--product" />{error ? <p className="archive-error" role="alert">{error}</p> : null}{!journal && !error ? <p className="archive-empty">일지를 불러오는 중이에요.</p> : null}{journal ? <article className="journal-detail-card"><p className="journal-detail-card__date">{journal.date}</p><div className="journal-detail-card__content">{journal.content || '작성한 내용이 없어요.'}</div>{journal.tags.length ? <div className="journal-tags">{journal.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}{journal.imageUrls.length ? <div className="journal-images">{journal.imageUrls.map((imageUrl) => <img key={imageUrl} src={imageUrl} alt="일지 첨부 이미지" />)}</div> : null}<button type="button" className="journal-delete-button" onClick={() => void remove()}>일지 삭제</button></article> : null}</main></AppShell>;
}
