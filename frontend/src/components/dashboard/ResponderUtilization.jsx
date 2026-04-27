import { useMemo } from 'react';
import { getResponderUtilization } from '../../utils/incidentRiskScore';

export default function ResponderUtilization({ responders = [], incidents = [] }) {
  const utilization = useMemo(
    () => getResponderUtilization(responders, incidents),
    [responders, incidents]
  );

  const available = responders.length - Math.round((responders.length * utilization) / 100);
  const assigned = Math.round((responders.length * utilization) / 100);

  const utilizationColor =
    utilization > 80
      ? '#EA4335' // critical
      : utilization > 60
        ? '#FBBC04' // high
        : utilization > 40
          ? '#F29900' // medium
          : '#34A853'; // low

  return (
    <div className="panel-card" style={{ display: 'grid', gap: 14 }}>
      <div className="section-header" style={{ marginBottom: 0 }}>
        <div>
          <h3>Responder Utilization</h3>
          <p className="section-subtitle">Team capacity and deployment status.</p>
        </div>
        <span className="status-pill" style={{ background: `${utilizationColor}20`, color: utilizationColor }}>
          {utilization}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '12px', background: 'var(--color-surface-container)', borderRadius: 12 }}>
          <p className="t-caption" style={{ margin: '0 0 8px', color: 'var(--color-on-surface-variant)' }}>
            AVAILABLE
          </p>
          <strong style={{ fontSize: '1.5rem', color: '#34A853' }}>{available}</strong>
        </div>
        <div style={{ padding: '12px', background: 'var(--color-surface-container)', borderRadius: 12 }}>
          <p className="t-caption" style={{ margin: '0 0 8px', color: 'var(--color-on-surface-variant)' }}>
            ASSIGNED
          </p>
          <strong style={{ fontSize: '1.5rem', color: utilizationColor }}>{assigned}</strong>
        </div>
      </div>

      <div style={{ position: 'relative', height: '24px', background: 'var(--color-surface-container)', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${utilization}%`,
            background: utilizationColor,
            transition: 'width 0.3s ease-out',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-on-surface)',
          }}
        >
          {responders.length > 0 ? `${assigned}/${responders.length}` : 'No responders'}
        </div>
      </div>
    </div>
  );
}
