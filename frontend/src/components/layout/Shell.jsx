import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Navbar from './Navbar';
import ArchitectureModal from '../dashboard/ArchitectureModal';
import AlertBanner from './AlertBanner';
import { useIncidents } from '../../hooks/useIncidents';

const RAIL_NAV = [
  {
    id: 'home', path: '/', label: 'OPS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
  },
  {
    id: 'maps', path: '/map', label: 'MAP',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
  },
  {
    id: 'twin', path: '/twin', label: 'TWIN',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5h16v14"/><path d="M8 9h8"/><path d="M8 13h8"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="17" r="1"/></svg>
  },
  {
    id: 'history', path: '/audit', label: 'AUDIT',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  },
  {
    id: 'guest', path: '/guest', label: 'GUEST',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  },
];

const GUEST_RAIL = [
  {
    id: 'report', path: '/guest', label: 'STATUS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  },
];

export default function Shell({ children }) {
  const location = useLocation();
  const { incidents, error } = useIncidents();
  const isGuest = location.pathname === '/guest';
  const railItems = isGuest ? GUEST_RAIL : RAIL_NAV;
  const currentPath = location.pathname;
  const railStatus = error ? 'OFFLINE FALLBACK' : 'SYSTEM ONLINE';

  const [showArch, setShowArch] = useState(false);
  return (
    <div className="app-shell">
        <Navbar currentPath={currentPath} onShowArch={() => setShowArch(true)} error={error} />
      
      {showArch && <ArchitectureModal onClose={() => setShowArch(false)} />}

      {/* 72px Icon Rail */}
      <nav className="left-rail">
        {Array.isArray(railItems) ? railItems.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`rail-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            {item.icon}
            <span className="rail-label">{item.label}</span>
          </Link>
        )) : null}

        <div className="rail-spacer" />
        <div className="rail-divider" />

        <div className="rail-status">
          <div className="status-dot-sm" style={{ background: error ? 'var(--color-error)' : undefined }} />
          <span className="rail-label" style={{ color: error ? 'var(--color-error)' : 'var(--color-success)', fontSize: '0.45rem' }}>
            {railStatus}
          </span>
        </div>
      </nav>

      {/* Content Area */}
      <div className="content-area page-transition">
        <AlertBanner incidents={incidents} />
        {children}
      </div>
    </div>
  );
}
