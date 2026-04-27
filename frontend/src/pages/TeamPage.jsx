import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_RESPONDERS } from '../lib/mockData';
import ResponderCard from '../components/ResponderCard';
import { useResponders } from '../hooks/useResponders';

const UNITS = [
  { id: 'all', label: 'All units', roles: ['fire_team', 'medical', 'security', 'management', 'admin'] },
  { id: 'fire', label: 'Fire & safety', roles: ['fire_team'] },
  { id: 'medical', label: 'Medical', roles: ['medical'] },
  { id: 'security', label: 'Security', roles: ['security'] },
  { id: 'management', label: 'Management', roles: ['management', 'admin'] },
];

const COMMAND_CHAIN = [
  { role: 'Incident Commander', name: 'Ops Manager (on call)', status: 'Decision authority - all units' },
  { role: 'Fire & Safety Lead', name: 'Alex Chen', status: 'Evacuation - fire response' },
  { role: 'Medical Lead', name: 'Sarah Kim', status: 'Guest care - AED protocol' },
  { role: 'Security Lead', name: 'Mike Torres', status: 'Access control - de-escalation' },
];

function etaMinutes(responder) {
  if (responder.status === 'offline') return null;
  if (responder.status === 'responding') return '< 1 min';
  if (responder.status === 'available') return '2-3 min';
  return '4-6 min';
}

function ReadinessBar({ responders }) {
  const onDuty = responders.filter((r) => r.status !== 'offline').length;
  const responding = responders.filter((r) => r.status === 'responding').length;
  const available = responders.filter((r) => r.status === 'available').length;
  const pct = Math.round((onDuty / Math.max(responders.length, 1)) * 100);

  return (
    <div className="readiness-bar panel-card">
      <div className="readiness-stats">
        <div className="metric-card"><strong>{onDuty}</strong><span>On duty</span></div>
        <div className="metric-card"><strong style={{ color: 'var(--color-primary)' }}>{responding}</strong><span>Responding</span></div>
        <div className="metric-card"><strong style={{ color: 'var(--color-success)' }}>{available}</strong><span>Available</span></div>
        <div className="metric-card"><strong>{pct}%</strong><span>Readiness</span></div>
      </div>
      <div className="readiness-track" aria-hidden="true">
        <div className="readiness-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TeamPage() {
  const navigate = useNavigate();
  const { responders: liveResponders, refresh } = useResponders();
  const [localResponders, setLocalResponders] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [dispatchNotice, setDispatchNotice] = useState('');

  const responders = localResponders.length > 0
    ? localResponders
    : (liveResponders.length > 0 ? liveResponders : MOCK_RESPONDERS);

  const activeUnit = UNITS.find((unit) => unit.id === selectedUnit);
  const visibleResponders = useMemo(() => (
    selectedUnit === 'all'
      ? responders
      : responders.filter((responder) => activeUnit?.roles.includes(responder.role))
  ), [activeUnit, responders, selectedUnit]);

  const unitCounts = useMemo(() => UNITS.map((unit) => ({
    ...unit,
    count: unit.id === 'all'
      ? responders.length
      : responders.filter((responder) => unit.roles.includes(responder.role)).length,
  })), [responders]);

  const dispatchResponder = (responder) => {
    const msg = `${responder.name} dispatched to the active incident`;
    setLocalResponders((current) => {
      const source = current.length > 0 ? current : responders;
      return source.map((item) => (item.id === responder.id ? { ...item, status: 'responding' } : item));
    });
    setDispatchNotice(msg);
    window.setTimeout(() => setDispatchNotice(''), 4000);
  };

  const acknowledgeAll = () => {
    setLocalResponders((current) => {
      const source = current.length > 0 ? current : responders;
      return source.map((item) => (item.status === 'available' ? { ...item, status: 'on_duty' } : item));
    });
  };

  return (
    <div className="page-shell">
      <div className="page-hero team-hero">
        <div className="team-hero-copy">
          <p className="page-kicker">Team coordination</p>
          <h1 className="page-title">Responder command view</h1>
          <p className="page-subtitle">
            Track unit readiness, roles, ETAs, assignments, communication state, and chain of command in one place.
          </p>
        </div>
        <div className="top-actions team-hero-actions">
          <button className="btn-tonal btn-sm" onClick={() => navigate('/audit')}>Open audit trail</button>
          <button className="btn-tonal btn-sm" onClick={refresh}>Refresh roster</button>
          <button className="btn-filled btn-sm" onClick={acknowledgeAll}>Acknowledge all</button>
        </div>
      </div>

      {dispatchNotice && (
        <div className="alert-banner team-alert" style={{ marginBottom: 12 }}>
          <span>{dispatchNotice}</span>
        </div>
      )}

      <ReadinessBar responders={responders} />

      <div className="team-layout">
        <section className="panel-card team-panel">
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <h2>Chain of command</h2>
              <p className="section-subtitle">Escalation path for human-in-the-loop decisions.</p>
            </div>
            <span className="status-pill success">Human lead active</span>
          </div>

          <div className="command-chain">
            {COMMAND_CHAIN.map((person, index) => (
              <div key={person.role} className="command-row">
                <span>{index + 1}</span>
                <div>
                  <strong>{person.role}</strong>
                  <p className="t-caption">{person.name}</p>
                  <p className="t-caption" style={{ color: 'var(--color-on-surface-dim)' }}>{person.status}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-card team-panel">
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <h2>Unit filter</h2>
              <p className="section-subtitle">Filter the roster by response unit.</p>
            </div>
          </div>

          <div className="unit-filter-grid" role="tablist" aria-label="Team unit filter">
            {unitCounts.map((unit) => (
              <button
                key={unit.id}
                type="button"
                role="tab"
                aria-selected={selectedUnit === unit.id}
                className={`unit-filter-btn ${selectedUnit === unit.id ? 'active' : ''}`}
                onClick={() => setSelectedUnit(unit.id)}
              >
                <span className="unit-filter-label">{unit.label}</span>
                <span className="unit-filter-count">{unit.count}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="responder-grid">
        {visibleResponders.map((responder) => {
          const eta = etaMinutes(responder);

          return (
            <div key={responder.id} className="responder-wrap responder-card-shell">
              <ResponderCard responder={responder} />

              <div className="responder-meta">
                <div className="responder-meta-row">
                  {eta && <span className="status-pill">ETA {eta}</span>}
                  <span className={`status-pill status-${responder.status}`}>
                    {responder.status?.replace(/_/g, ' ')}
                  </span>
                </div>

                <p className="t-caption" style={{ margin: '6px 0' }}>
                  Task: {responder.current_incident ? `Support ${responder.current_incident}` : 'Stand by for dispatch'}
                </p>

                {responder.status !== 'offline' && responder.status !== 'responding' && (
                  <button
                    className="btn-filled btn-sm dispatch-btn"
                    onClick={() => dispatchResponder(responder)}
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    Dispatch to active incident
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
