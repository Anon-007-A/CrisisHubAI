import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIncidents } from '../../hooks/useIncidents';
import { auth } from '../../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../../context/ThemeContext';

const CORE_NAV_ITEMS = [
  { id: 'ops', label: 'Operations', path: '/' },
  { id: 'map', label: 'Map', path: '/map' },
  { id: 'twin', label: 'Twin', path: '/twin' },
  { id: 'audit', label: 'Audit', path: '/audit' },
  { id: 'guest', label: 'Guest Portal', path: '/guest' },
];

const SECONDARY_NAV_ITEMS = [
  { id: 'alerts', label: 'Alerts', path: '/alerts' },
  { id: 'cctv', label: 'CCTV', path: '/cctv' },
  { id: 'team', label: 'Team', path: '/team' },
];

export default function Navbar({ onShowArch, error }) {
  const location = useLocation();
  const { incidents, isDemo } = useIncidents();
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => setUser(nextUser || null));
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    if (isDemo) {
      setShowAuthModal(true);
      return;
    }

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.warn('Sign-in failed:', error.message);
    }
  }, [isDemo]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.warn('Sign-out failed:', error.message);
    }
  }, []);

  const resetDemo = useCallback(() => {
    if (window.confirm('Reset demo to initial state? This will reload the page.')) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  const criticalCount = incidents.filter(
    (incident) => incident.status !== 'resolved' && incident.classification?.severity === 'critical',
  ).length;

  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const currentPath = location.pathname;
  const statusLabel = error ? 'OFFLINE FALLBACK' : isDemo ? 'DEMO' : 'LIVE';
  const statusStyles = error
    ? { background: 'rgba(234, 67, 53, 0.12)', borderColor: 'rgba(234, 67, 53, 0.22)' }
    : isDemo
      ? { background: 'var(--color-success-light)', borderColor: 'rgba(52,168,83,0.2)' }
      : {};
  const statusDotStyles = error
    ? { background: 'var(--color-error)' }
    : isDemo
      ? { background: 'var(--color-success)' }
      : {};
  const statusTextStyles = error
    ? { color: 'var(--color-error)' }
    : isDemo
      ? { color: 'var(--color-success-dark)' }
      : {};

  return (
    <>
      <header className="top-nav">
        <div className="nav-main-row">
          <div className="nav-brand">
            <div className={`nav-brand-dot ${criticalCount > 0 ? 'has-critical' : ''}`} />
            <span className="nav-brand-text">Aegis <strong>CrisisHub</strong></span>
          </div>

          <nav className="nav-tabs nav-tabs-desktop">
            {CORE_NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`nav-tab ${currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path)) ? 'active' : ''}`}
              >
                {item.label}
                {item.id === 'ops' && criticalCount > 0 && (
                  <span className="sev-badge sev-critical" style={{ fontSize: '0.5rem', padding: '0 5px', marginLeft: 4 }}>
                    {criticalCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="nav-right">
            <span className="nav-clock">{clock}</span>

            <button className="header-action-btn arch-btn" onClick={onShowArch} title="View system architecture">
              ARCH
            </button>

            <div className="nav-status" style={statusStyles}>
              <div className="nav-status-dot" style={statusDotStyles} />
              <span className="nav-status-text" style={statusTextStyles}>{statusLabel}</span>
            </div>

            {isDemo && (
              <button className="header-action-btn reset-btn" onClick={resetDemo} title="Reset demo to initial state">
                RESET
              </button>
            )}

            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
              {isDark ? 'Dark' : 'Light'}
            </button>

            <button
              className={user ? 'btn-tonal btn-sm' : 'btn-filled btn-sm'}
              onClick={user ? signOutUser : signIn}
            >
              {user ? (user.displayName?.split(' ')[0] || 'Sign out') : 'Sign in'}
            </button>

            <button
              className="mobile-menu-btn"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Toggle navigation"
            >
              <span className={`hamburger ${menuOpen ? 'open' : ''}`} />
            </button>
          </div>
        </div>

        <div className="nav-secondary-row">
          <span className="nav-secondary-label">Supporting tools</span>
          <nav className="nav-tabs nav-tabs-secondary nav-tabs-desktop">
            {SECONDARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`nav-tab secondary ${currentPath === item.path || currentPath.startsWith(item.path) ? 'active' : ''}`}
              >
                {item.label}
              {item.id === 'alerts' && criticalCount > 0 && (
                <span className="sev-badge sev-critical" style={{ fontSize: '0.5rem', padding: '0 5px', marginLeft: 4 }}>
                  {criticalCount}
                </span>
              )}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMenuOpen(false)}>
          <nav className="mobile-nav-menu" onClick={(event) => event.stopPropagation()}>
            {CORE_NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`mobile-nav-item ${currentPath === item.path ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                {item.id === 'ops' && criticalCount > 0 && (
                  <span className="sev-badge sev-critical" style={{ fontSize: '0.55rem', padding: '1px 6px', marginLeft: 'auto' }}>
                    {criticalCount} critical
                  </span>
                )}
              </Link>
            ))}
            <div className="mobile-nav-divider" />
            <p className="t-caption" style={{ margin: 0, padding: '0 16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Secondary tools
            </p>
            {SECONDARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`mobile-nav-item ${currentPath === item.path ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                {item.id === 'alerts' && criticalCount > 0 && (
                  <span className="sev-badge sev-critical" style={{ fontSize: '0.55rem', padding: '1px 6px', marginLeft: 'auto' }}>
                    {criticalCount} critical
                  </span>
                )}
              </Link>
            ))}
            <div className="mobile-nav-divider" />
            <button className="mobile-nav-item" onClick={() => { setMenuOpen(false); onShowArch(); }}>
              Architecture
            </button>
            <button className="mobile-nav-item" onClick={toggleTheme}>
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
            {isDemo && (
              <button className="mobile-nav-item danger" onClick={() => { setMenuOpen(false); resetDemo(); }}>
                Reset demo
              </button>
            )}
          </nav>
        </div>
      )}

      {showAuthModal && (
        <div className="modal-backdrop auth-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="modal-card auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="page-kicker">Authentication</span>
                <h2 className="t-headline" style={{ margin: '6px 0 4px' }}>Operator access</h2>
                <p className="t-caption" style={{ margin: 0 }}>Secure login is swapped for a demo notice while simulation mode is active.</p>
              </div>
              <button className="drawer-close" onClick={() => setShowAuthModal(false)} aria-label="Close authentication dialog">
                ×
              </button>
            </div>

            <div className="auth-summary-grid">
              <div className="auth-summary-card demo">
                <span className="t-overline">Current mode</span>
                <strong>Demo / Simulation</strong>
                <p className="t-body-sm">Sign-in is bypassed so you can move through the product without a Google account.</p>
              </div>
              <div className="auth-summary-card prod">
                <span className="t-overline">Production</span>
                <strong>Google SSO</strong>
                <p className="t-body-sm">Operators authenticate through Firebase Auth when the app is deployed for live use.</p>
              </div>
            </div>

            <div className="auth-note">
              <span>Why this appears</span>
              <p className="t-body-sm" style={{ margin: 0 }}>
                This project is running locally in a simulation-first mode, so the sign-in flow is intentionally informational only.
              </p>
            </div>

            <div className="modal-footer">
              <button className="btn-tonal btn-sm" onClick={() => setShowAuthModal(false)}>
                Continue in demo
              </button>
              <button className="btn-filled btn-sm" style={{ minWidth: 140 }} onClick={() => setShowAuthModal(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
