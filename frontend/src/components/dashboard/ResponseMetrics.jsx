import { useMemo } from 'react';

export default function ResponseMetrics({ incidents = [], responders = [] }) {
  const metrics = useMemo(() => {
    const now = new Date();
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved');
    const activeIncidents = incidents.filter(i => i.status !== 'resolved');

    // Calculate Mean Time To Respond (MTTR)
    let totalResponseTime = 0;
    let respondedCount = 0;
    resolvedIncidents.forEach((incident) => {
      if (incident.created_at && (incident.assigned_responders?.length || 0) > 0) {
        const createdTime = new Date(incident.created_at);
        const responseTime = Math.floor((now - createdTime) / 60000);
        totalResponseTime += responseTime;
        respondedCount++;
      }
    });
    const avgResponseTime = respondedCount > 0 ? Math.floor(totalResponseTime / respondedCount) : 0;

    // Coverage calculation
    const coveredIncidents = incidents.filter(i => (i.assigned_responders?.length || 0) > 0).length;
    const coveragePercent = incidents.length > 0 ? Math.round((coveredIncidents / incidents.length) * 100) : 0;

    // Responder efficiency
    const assignedResponders = new Set();
    activeIncidents.forEach(inc => {
      (inc.assigned_responders || []).forEach(name => {
        assignedResponders.add(name);
      });
    });
    const utilization = responders.length > 0 ? Math.round((assignedResponders.size / responders.length) * 100) : 0;

    // Critical incident response
    const criticalIncidents = incidents.filter(i => i.classification?.severity === 'critical').length;
    const criticalWithResponse = incidents.filter(
      i => i.classification?.severity === 'critical' && (i.assigned_responders?.length || 0) > 0
    ).length;
    const criticalResponsePercent = criticalIncidents > 0 ? Math.round((criticalWithResponse / criticalIncidents) * 100) : 0;

    // Resolution rate
    const resolutionRate = incidents.length > 0 ? Math.round((resolvedIncidents.length / incidents.length) * 100) : 0;

    return {
      avgResponseTime,
      coveragePercent,
      utilization,
      criticalResponsePercent,
      resolutionRate,
      totalIncidents: incidents.length,
      activeIncidents: activeIncidents.length,
      resolvedCount: resolvedIncidents.length,
    };
  }, [incidents, responders]);

  const getMetricColor = (percent) => {
    if (percent >= 80) return '#34A853'; // Green
    if (percent >= 60) return '#FBBC04'; // Orange
    return '#EA4335'; // Red
  };

  return (
    <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(66,133,244,0.08) 0%, transparent 100%)' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 className="t-title" style={{ margin: 0 }}>Response Metrics</h3>
        <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
          Operational performance and efficiency tracking
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            AVG RESPONSE TIME
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
            <strong style={{ fontSize: '1.5rem' }}>{metrics.avgResponseTime}</strong>
            <span className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>min</span>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            COVERAGE
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
            <strong style={{ fontSize: '1.5rem', color: getMetricColor(metrics.coveragePercent) }}>
              {metrics.coveragePercent}%
            </strong>
            <span className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>responded</span>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            TEAM UTILIZATION
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
            <strong style={{ fontSize: '1.5rem', color: getMetricColor(metrics.utilization) }}>
              {metrics.utilization}%
            </strong>
            <span className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>deployed</span>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            CRITICAL RESPONSE
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
            <strong style={{ fontSize: '1.5rem', color: getMetricColor(metrics.criticalResponsePercent) }}>
              {metrics.criticalResponsePercent}%
            </strong>
            <span className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>assigned</span>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-outline)', paddingTop: 12 }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)', marginBottom: 8 }}>
          INCIDENT SUMMARY
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
              {metrics.activeIncidents}
            </div>
            <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
              Active
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#34A853' }}>
              {metrics.resolvedCount}
            </div>
            <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
              Resolved
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: getMetricColor(metrics.resolutionRate) }}>
              {metrics.resolutionRate}%
            </div>
            <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
              Resolved Rate
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
