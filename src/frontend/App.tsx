import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { StartPage } from './pages/StartPage';
import { AiOnboardingPage } from './pages/AiOnboardingPage';
import { BasicOnboardingPage } from './pages/BasicOnboardingPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding/basic" element={<BasicOnboardingPage />} />
      <Route path="/onboarding/ai" element={<AiOnboardingPage />} />
      <Route path="/schedule/initial" element={<PlaceholderPage title="초기 일정" />} />
      <Route path="/home" element={<AppShell activeNav="홈" showBottomNav><PlaceholderPage title="홈" /></AppShell>} />
      <Route path="/schedule" element={<AppShell activeNav="일정" showBottomNav><PlaceholderPage title="일정" /></AppShell>} />
      <Route path="/plan-b" element={<AppShell activeNav="Plan B" showBottomNav><PlaceholderPage title="Plan B" /></AppShell>} />
      <Route path="/archive" element={<AppShell activeNav="아카이브" showBottomNav><PlaceholderPage title="아카이브" /></AppShell>} />
      <Route path="/my-page" element={<AppShell activeNav="내 페이지" showBottomNav><PlaceholderPage title="내 페이지" /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
