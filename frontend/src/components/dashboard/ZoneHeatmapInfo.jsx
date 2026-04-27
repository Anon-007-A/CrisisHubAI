import { useMemo } from 'react';
import { calculateZoneHeatmap } from '../../utils/incidentRiskScore';

export default function ZoneHeatmapInfo({ incidents = [] }) {
  const heatmapData = useMemo(() => {
    return calculateZoneHeatmap(incidents);
  }, [incidents]);

  if (heatmapData.length === 0) {
    return null;
  }

  const getHeatmapColor = (risk) => {
    if (risk >= 90) return { bg: 'rgba(234,67,53,0.15)', border: '#EA4335', label: 'Critical Zone' };
    if (risk >= 70) return { bg: 'rgba(251,188,4,0.15)', border: '#FBBC04', label: 'High Risk Zone' };
    if (risk >= 40) return { bg: 'rgba(251,188,4,0.08)', border: '#F57C00', label: 'Medium Risk Zone' };
    return { bg: 'rgba(52,168,83,0.08)', border: '#34A853', label: 'Low Risk Zone' };
  };

  return (
    <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(251,188,4,0.08) 0%, transparent 100%)' }}>
      <div style={{ marginBottom: 14 }}>
        <h3 className="t-title" style={{ margin: 0 }}>Zone Heatmap</h3>
        <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
          Cumulative risk by venue region ({heatmapData.length} zones active)
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {heatmapData.map((zone) => {
          const riskColor = getHeatmapColor(zone.averageRisk);
          return (
            <div
              key={zone.zone}
              style={{
                padding: 12,
                borderRadius: 8,
                background: riskColor.bg,
                borderLeft: `4px solid ${riskColor.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <p className="t-body-sm" style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>
                    {zone.zone}
                  </p>
                  <p className="t-caption" style={{ margin: '2px 0 0', color: riskColor.border }}>
                    {riskColor.label}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: riskColor.border }}>
                    {zone.averageRisk}
                  </div>
                  <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
                    {zone.incidentCount} incident{zone.incidentCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {zone.incidents.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                  {zone.incidents.slice(0, 2).map((incident) => (
                    <p key={incident.id} className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
                      • {incident.summary || `${incident.severity.toUpperCase()} incident`}
                    </p>
                  ))}
                  {zone.incidents.length > 2 && (
                    <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
                      +{zone.incidents.length - 2} more
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
