const STATS = [
  { key: 'active',   label: 'ACTIVE',   color: '#202124', darkColor: '#E3E3E3' },
  { key: 'fire',     label: 'FIRE',     color: '#EA4335', darkColor: '#EA4335' },
  { key: 'medical',  label: 'MEDICAL',  color: '#4285F4', darkColor: '#8AB4F8' },
  { key: 'security', label: 'SECURITY', color: '#F29900', darkColor: '#FDD663' },
  { key: 'mttm',     label: 'AVG MTTM', color: '#34A853', darkColor: '#81C995' },
];

function formatMTTM(seconds) {
  if (!seconds || seconds === 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

export function StatsBar({ incidents }) {
  const active = incidents.filter(i => i.status !== 'resolved');
  const resolved = incidents.filter(i => i.status === 'resolved');

  // Compute average MTTM from resolved incidents
  const mttmValues = resolved
    .map(i => i.mttm_seconds)
    .filter(v => v && v > 0);
  const avgMttm = mttmValues.length > 0
    ? Math.round(mttmValues.reduce((a, b) => a + b, 0) / mttmValues.length)
    : 0;

  // Total toil saved
  const totalToil = incidents.reduce((sum, i) => sum + (i.toil_saved || i.autonomous_actions?.length || 0), 0);

  return (
    <div className="stat-strip">
      <div className="stat-chip" style={{ borderLeft: '3px solid var(--color-danger)' }}>
        <span className="stat-count t-mono" style={{ color: 'var(--color-danger)' }}>
          {active.length}
        </span>
        <div className="tooltip-container">
          <span className="stat-label">ACTIVE ALERTS</span>
          <div className="stat-sub">{resolved.length} resolved</div>
        </div>
      </div>

      <div className="stat-chip" style={{ borderLeft: '3px solid var(--color-success)' }}>
        <span className="stat-count t-mono" style={{ color: 'var(--color-success)' }}>
          {formatMTTM(avgMttm)}
        </span>
        <div className="tooltip-container">
          <span className="stat-label">AVG MTTM</span>
          <div className="stat-sub">Containment Time</div>
        </div>
      </div>

      <div className="stat-chip" style={{ borderLeft: '3px solid #9C27B0' }}>
        <span className="stat-count t-mono" style={{ color: '#9C27B0' }}>
          {totalToil}
        </span>
        <div className="tooltip-container">
          <span className="stat-label">TOIL SAVED</span>
          <div className="stat-sub">AI Automation</div>
        </div>
      </div>
    </div>
  );
}
