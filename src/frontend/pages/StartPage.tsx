import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';

export function StartPage() {
  return (
    <AppShell className="start-shell">
      <main className="start-screen" data-node-id="291:3960">
        <h1 className="start-screen__title">도담: 도시를 담다</h1>
        <p className="start-screen__description">
          <span>계획이 바뀐 순간,</span>
          <span>AI가 오늘 가능한 웰니스 Plan B를 추천하는 생활권 플랫폼</span>
        </p>
        <img className="start-screen__illustration" src="/assets/start-afternoon.png" alt="도시와 공원에서 오늘의 계획을 살펴보는 다람쥐 담이" data-node-id="291:3975" />
        <Link className="start-screen__login" to="/login" data-node-id="452:2533">
          <img src="/assets/tape-primary.png" alt="" aria-hidden="true" />
          <span>로그인</span>
        </Link>
        <Link className="start-screen__signup" to="/signup" data-node-id="452:2535">회원가입</Link>
      </main>
    </AppShell>
  );
}
