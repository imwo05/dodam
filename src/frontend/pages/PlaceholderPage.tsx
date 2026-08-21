import { Link } from 'react-router-dom';
import { PageHeader } from '../components/AppShell';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="placeholder-page">
      <PageHeader title={title} />
      <div className="placeholder-page__body">
        <p className="placeholder-page__eyebrow">DODAM MVP</p>
        <h2>{title} 화면을 준비하고 있어요.</h2>
        <p>이 경로는 다음 Figma 구현 phase에서 실제 데이터와 함께 연결됩니다.</p>
        <Link to="/" className="tape-button tape-button--placeholder">시작 화면으로</Link>
      </div>
    </main>
  );
}
