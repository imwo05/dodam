import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { StartPage } from './pages/StartPage';
import { AiOnboardingPage } from './pages/AiOnboardingPage';
import { BasicOnboardingPage } from './pages/BasicOnboardingPage';
import { InitialSchedulePage } from './pages/InitialSchedulePage';
import { ProfileCompletePage } from './pages/ProfileCompletePage';
import { HomePage } from './pages/HomePage';
import { SchedulePage } from './pages/SchedulePage';
import { DailySchedulePage } from './pages/DailySchedulePage';
import { ScheduleEditPage } from './pages/ScheduleEditPage';
import { useAuth } from '../contexts/AuthContext';

function RouteLoading() {
  return <div className="route-loading" role="status" aria-live="polite">인증 정보를 확인하고 있어요.</div>;
}

function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <RouteLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function HomeRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading || (isAuthenticated && !user)) return <RouteLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: '/home' }} />;
  if (!user?.onboardingCompleted) return <Navigate to="/onboarding/basic" replace />;
  return <HomePage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding/basic" element={<AuthenticatedRoute><BasicOnboardingPage /></AuthenticatedRoute>} />
      <Route path="/onboarding/chat" element={<AuthenticatedRoute><AiOnboardingPage /></AuthenticatedRoute>} />
      <Route path="/schedule/initial" element={<AuthenticatedRoute><InitialSchedulePage /></AuthenticatedRoute>} />
      <Route path="/onboarding/complete" element={<AuthenticatedRoute><ProfileCompletePage /></AuthenticatedRoute>} />
      <Route path="/home" element={<HomeRoute />} />
      <Route path="/onboarding/*" element={<AuthenticatedRoute><Navigate to="/onboarding/basic" replace /></AuthenticatedRoute>} />
      <Route path="/schedule" element={<AuthenticatedRoute><SchedulePage /></AuthenticatedRoute>} />
      <Route path="/schedule/daily" element={<AuthenticatedRoute><DailySchedulePage /></AuthenticatedRoute>} />
      <Route path="/schedule/new" element={<AuthenticatedRoute><ScheduleEditPage /></AuthenticatedRoute>} />
      <Route path="/schedule/:id/edit" element={<AuthenticatedRoute><ScheduleEditPage /></AuthenticatedRoute>} />
      <Route path="/plan-b" element={<AppShell activeNav="Plan B" showBottomNav><PlaceholderPage title="Plan B" /></AppShell>} />
      <Route path="/archive" element={<AppShell activeNav="아카이브" showBottomNav><PlaceholderPage title="아카이브" /></AppShell>} />
      <Route path="/my-page" element={<AppShell activeNav="내 페이지" showBottomNav><PlaceholderPage title="내 페이지" /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
