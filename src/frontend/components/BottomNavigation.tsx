import { Link } from 'react-router-dom';

type NavItem = { label: string; to: string; icon: string; iconClass: string };

const items: NavItem[] = [
  { label: '홈', to: '/home', icon: 'icon-home.svg', iconClass: 'nav-icon--home' },
  { label: '일정', to: '/schedule', icon: 'icon-calendar.svg', iconClass: 'nav-icon--calendar' },
  { label: 'Plan B', to: '/plan-b', icon: 'icon-map.svg', iconClass: 'nav-icon--map' },
  { label: '아카이브', to: '/archive', icon: 'icon-library.svg', iconClass: 'nav-icon--library' },
  { label: '내 페이지', to: '/my-page', icon: 'icon-me.svg', iconClass: 'nav-icon--me' }
];

export function BottomNavigation({ active }: { active?: string }) {
  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴" data-node-id="327:1514">
      <div className="bottom-navigation__art" aria-hidden="true" />
      <div className="bottom-navigation__icons">
        {items.map((item) => (
          <Link className={`bottom-navigation__item ${item.label === active ? 'is-active' : ''}`} to={item.to} key={item.label}>
            <img className={`bottom-navigation__icon ${item.iconClass}`} src={`/assets/${item.icon}`} alt="" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
