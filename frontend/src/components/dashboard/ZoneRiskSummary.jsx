import { useMemo } from 'react';
import { groupIncidentsByZone, getZoneRiskLevel } from '../../utils/incidentRiskScore';

export default function ZoneRiskSummary({ incidents = [] }) {
  const zones = useMemo(() => {
    const grouped = groupIncidentsByZone(incidents.filter(i => i.status !== 'resolved'));
    return Object.entries(grouped)
      .map(([zone, incidentsList]) => ({
        zone,
        count: incidentsList.length,
        critical: incidentsList.filter(i => i.classification?.severity === 'critical').length,
        high: incidentsList.filter(i => i.classification?.severity === 'high').length,
        riskLevel: getZoneRiskLevel(incidentsList),
      }))
      .sort((a, b) => {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      });
  }, [incidents]);

  const riskColors = {
    critical: '#EA4335',
    high: '#FBBC04',
    medium: '#F29900',
    low: '#34A853',
  };

  if (zones.length === 0) {
    return (
      <div className="panel-card" style={{ padding: 18 }}>
        <h3>Zone Risk Summary</h3>
        <div style={{ color: 'var(--color-on-surface-variant)', marginTop: 12 }}>
          <span className="t-body-sm">All zones secure</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card" style={{ padding: 18 }}>
      <div className="section-header" style={{ marginBottom: 0 }}>
        <h3>Zone Risk Summary</h3>
        <span className="status-pill">{zones.length} active zones</span>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {zones.map((z) => (
          <div
            key={z.zone}
            style={{
              padding: 12,
              background: 'var(--color-surface-container)',
              borderRadius: 12,
              borderLeft: `3px solid ${riskColors[z.riskLevel]}`,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <p
                className="t-body-sm"
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: riskColors[z.riskLevel],
                }}
              >
                {z.zone}
              </p>
              <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
                {z.count} incident{z.count !== 1 ? 's' : ''} •{' '}
                <span style={{ color: '#EA4335', fontWeight: 600 }}>{z.critical} critical</span>
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                className="sev-badge"
                style={{
                  background: `${riskColors[z.riskLevel]}20`,
                  color: riskColors[z.riskLevel],
                  fontSize: '0.625rem',
                  textTransform: 'uppercase',
                }}
              >
                {z.riskLevel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
