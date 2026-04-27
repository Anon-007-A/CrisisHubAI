import { useMemo } from 'react';
import { calculateRiskScore } from '../../utils/incidentRiskScore';

export default function EscalationWarnings({ incidents = [], responders = [] }) {
  const warnings = useMemo(() => {
    const alerts = [];
    const now = new Date();

    incidents
      .filter(i => i.status !== 'resolved')
      .forEach((incident) => {
        const riskScore = calculateRiskScore(incident, responders, incidents);
        const createdTime = incident.created_at ? new Date(incident.created_at) : null;
        const ageMinutes = createdTime ? Math.floor((now - createdTime) / 60000) : 0;

        // Warning 1: High risk with no responders
        if (riskScore >= 75 && (!incident.assigned_responders || incident.assigned_responders.length === 0)) {
          alerts.push({
            id: `${incident.id}-no-responder`,
            severity: 'critical',
            type: 'No Response Assigned',
            description: `High-risk incident (${riskScore}/100) has no responders assigned`,
            incidentId: incident.id,
            recommendation: 'Dispatch responders immediately',
            icon: '🚨',
          });
        }

        // Warning 2: Incident active too long
        if (ageMinutes > 15 && incident.classification?.severity === 'critical') {
          alerts.push({
            id: `${incident.id}-duration`,
            severity: 'high',
            type: 'Extended Duration',
            description: `Critical incident has been active for ${ageMinutes} minutes`,
            incidentId: incident.id,
            recommendation: 'Consider escalation or additional resources',
            icon: '⏱️',
          });
        }

        // Warning 3: Multiple critical incidents
        const criticalCount = incidents.filter(i => i.status !== 'resolved' && i.classification?.severity === 'critical').length;
        if (criticalCount >= 2 && incident.classification?.severity === 'critical') {
          alerts.push({
            id: `${incident.id}-multi-critical`,
            severity: 'high',
            type: 'Multiple Critical',
            description: `${criticalCount} critical incidents active simultaneously`,
            incidentId: incident.id,
            recommendation: 'Coordinate multi-unit response',
            icon: '⚠️',
          });
        }

        // Warning 4: Responders overloaded
        const assignedResponders = new Set();
        incidents
          .filter(i => i.status !== 'resolved')
          .forEach(i => {
            (i.assigned_responders || []).forEach(name => {
              assignedResponders.add(name);
            });
          });
        
        const availableCount = responders.filter(r => r.status === 'available').length;
        if (availableCount < Math.max(1, responders.length * 0.2)) {
          alerts.push({
            id: `${incident.id}-responder-shortage`,
            severity: 'high',
            type: 'Responder Shortage',
            description: `Only ${availableCount} responders available (${Math.round(availableCount / responders.length * 100)}% capacity)`,
            incidentId: incident.id,
            recommendation: 'Request additional resources from backup teams',
            icon: '👥',
          });
        }

        // Warning 5: Evacuation required but not done
        if (incident.classification?.evacuation_required && !incident.evacuation_initiated) {
          alerts.push({
            id: `${incident.id}-evacuation`,
            severity: 'critical',
            type: 'Evacuation Required',
            description: `Evacuation required but not yet initiated`,
            incidentId: incident.id,
            recommendation: 'Initiate immediate evacuation procedures',
            icon: '🚪',
          });
        }
      });

    // Remove duplicates (same incident, same warning type)
    const seen = new Set();
    return alerts.filter(alert => {
      const key = `${alert.incidentId}-${alert.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [incidents, responders]);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(234,67,53,0.08) 0%, transparent 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <div>
          <h3 className="t-title" style={{ margin: 0 }}>Active Warnings</h3>
          <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
            {warnings.length} escalation alert{warnings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {warnings.map((warning) => (
          <div
            key={warning.id}
            style={{
              padding: 12,
              borderRadius: 8,
              background: warning.severity === 'critical' 
                ? 'rgba(234,67,53,0.12)' 
                : 'rgba(251,188,4,0.12)',
              borderLeft: `3px solid ${warning.severity === 'critical' ? '#EA4335' : '#FBBC04'}`,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: '1.25rem', marginTop: 1 }}>{warning.icon}</span>
            <div style={{ flex: 1 }}>
              <p className="t-body-sm" style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>
                {warning.type}
              </p>
              <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
                {warning.description}
              </p>
              <p className="t-caption" style={{ margin: '4px 0 0', color: warning.severity === 'critical' ? '#EA4335' : '#FBBC04', fontWeight: 600 }}>
                → {warning.recommendation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
