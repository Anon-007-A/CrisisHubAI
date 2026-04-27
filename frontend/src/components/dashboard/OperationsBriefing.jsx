import { useMemo } from 'react';
import { calculateRiskScore } from '../../utils/incidentRiskScore';

export default function OperationsBriefing({ incidents = [], responders = [] }) {
  const briefing = useMemo(() => {
    const active = incidents.filter(i => i.status !== 'resolved');
    if (active.length === 0) return null;

    // Find highest risk incident
    const incidentsByRisk = active
      .map(inc => ({
        incident: inc,
        risk: calculateRiskScore(inc, responders, incidents),
      }))
      .sort((a, b) => b.risk - a.risk);

    const topIncident = incidentsByRisk[0]?.incident;
    const criticalCount = active.filter(i => i.classification?.severity === 'critical').length;
    const highCount = active.filter(i => i.classification?.severity === 'high').length;

    const assignedResponders = new Set();
    active.forEach(inc => {
      (inc.assigned_responders || []).forEach(name => {
        assignedResponders.add(name);
      });
    });

    const availableCount = responders.filter(r => r.status === 'available').length;

    return {
      topIncident,
      criticalCount,
      highCount,
      totalIncidents: active.length,
      assignedResponders: assignedResponders.size,
      availableResponders: availableCount,
      recommendAction:
        criticalCount > 0 && availableCount === 0
          ? 'Request additional responders — all critical cases need coverage'
          : criticalCount > 0
            ? 'Focus on CRITICAL incidents — escalation may be needed'
            : highCount > 1
              ? 'Coordinate multi-zone response'
              : 'Monitor situation — standard protocols active',
    };
  }, [incidents, responders]);

  if (!briefing) {
    return (
      <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(52,168,83,0.08) 0%, transparent 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '2rem' }}>✅</span>
          <div>
            <h3 className="t-title" style={{ margin: 0, color: 'var(--color-success)' }}>
              All Clear
            </h3>
            <p className="t-body-sm" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
              No active incidents. Systems normal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(234,67,53,0.08) 0%, rgba(251,188,4,0.04) 100%)' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <h3 className="t-title" style={{ margin: 0 }}>
            OPERATIONAL BRIEFING
          </h3>
          <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
            Current crisis state and recommendations
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ padding: 10, background: 'rgba(234,67,53,0.12)', borderRadius: 8 }}>
            <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
              CRITICAL
            </p>
            <strong style={{ fontSize: '1.25rem', color: '#EA4335', display: 'block', marginTop: 4 }}>
              {briefing.criticalCount}
            </strong>
          </div>
          <div style={{ padding: 10, background: 'rgba(251,188,4,0.12)', borderRadius: 8 }}>
            <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
              HIGH SEVERITY
            </p>
            <strong style={{ fontSize: '1.25rem', color: '#FBBC04', display: 'block', marginTop: 4 }}>
              {briefing.highCount}
            </strong>
          </div>
          <div style={{ padding: 10, background: 'rgba(66,133,244,0.12)', borderRadius: 8 }}>
            <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
              AVAILABLE
            </p>
            <strong style={{ fontSize: '1.25rem', color: '#4285F4', display: 'block', marginTop: 4 }}>
              {briefing.availableResponders}
            </strong>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, borderLeft: '3px solid #FBBC04' }}>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase' }}>
            Recommended Action
          </p>
          <p className="t-body-sm" style={{ margin: '6px 0 0', color: 'var(--color-on-surface)' }}>
            {briefing.recommendAction}
          </p>
        </div>

        {briefing.topIncident && (
          <div style={{ padding: 12, background: 'rgba(234,67,53,0.08)', borderRadius: 8 }}>
            <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase' }}>
              Top Priority
            </p>
            <p className="t-body-sm" style={{ margin: '6px 0 0', fontWeight: 600, color: '#EA4335' }}>
              {briefing.topIncident.classification?.summary || briefing.topIncident.classification?.location}
            </p>
            <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
              {briefing.topIncident.assigned_responders?.length || 0} responders assigned
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
