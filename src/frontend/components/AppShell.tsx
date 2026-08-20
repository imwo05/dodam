import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { StatusBar } from './StatusBar';

type AppShellProps = { children: ReactNode; activeNav?: string; showBottomNav?: boolean; className?: string; statusBarOffset?: number };

export function AppShell({ children, activeNav, showBottomNav = false, className = '', statusBarOffset = 0 }: AppShellProps) {
  return (
    <div className={`phone-shell app-shell ${showBottomNav ? 'app-shell--with-bottom-nav' : ''} ${className}`.trim()}>
      <StatusBar offset={statusBarOffset} />
      <div className="app-shell__scroll-region">{children}</div>
      {showBottomNav ? <BottomNavigation active={activeNav} /> : null}
    </div>
  );
}

export function PageHeader({ title, backTo = '/', className = '', backSrc = '/assets/header-back.svg', profileSurfaceSrc = '/assets/header-profile-surface.svg', profileIconSrc = '/assets/header-profile.svg' }: { title: string; backTo?: string; className?: string; backSrc?: string; profileSurfaceSrc?: string; profileIconSrc?: string }) {
  return (
    <header className={`page-header ${className}`} data-node-id="335:1545">
      <Link className="page-header__back" to={backTo} aria-label="뒤로"><img src={backSrc} alt="" /></Link>
      <h1>{title}</h1>
      <span className="page-header__profile" aria-hidden="true">
        <img className="page-header__profile-surface" src={profileSurfaceSrc} alt="" />
        <img className="page-header__profile-icon" src={profileIconSrc} alt="" />
      </span>
    </header>
  );
}
