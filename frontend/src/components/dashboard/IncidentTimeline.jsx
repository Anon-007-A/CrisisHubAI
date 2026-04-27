import { useMemo } from 'react';

export default function IncidentTimeline({ incident }) {
  const timeline = useMemo(() => {
    if (!incident) return [];
    const events = [];

    // Created event
    if (incident.created_at) {
      events.push({
        timestamp: incident.created_at,
        type: 'created',
        label: 'Incident created',
        description: `${incident.classification?.incident_type || 'Unknown'} at ${incident.classification?.location || 'Unknown'}`,
        icon: '📍',
      });
    }

    // Classification event
    if (incident.classification) {
      events.push({
        timestamp: incident.created_at ? new Date(new Date(incident.created_at).getTime() + 10000) : new Date(),
        type: 'classified',
        label: 'Classified',
        description: `Severity: ${incident.classification.severity || 'unknown'}, Confidence: ${incident.classification.confidence || '0'}%`,
        icon: '🏷️',
      });
    }

    // Responder assignments
    if (incident.assigned_responders && incident.assigned_responders.length > 0) {
      incident.assigned_responders.forEach((responder, idx) => {
        events.push({
          timestamp: incident.created_at ? new Date(new Date(incident.created_at).getTime() + (20000 + idx * 15000)) : new Date(),
          type: 'dispatch',
          label: 'Responder dispatched',
          description: responder,
          icon: '👤',
        });
      });
    }

    // Autonomous actions
    if (incident.autonomous_actions && incident.autonomous_actions.length > 0) {
      incident.autonomous_actions.forEach((action, idx) => {
        events.push({
          timestamp: incident.created_at ? new Date(new Date(incident.created_at).getTime() + (50000 + idx * 12000)) : new Date(),
          type: 'action',
          label: action,
          description: 'System action',
          icon: '⚙️',
        });
      });
    }

    // Resolution
    if (incident.status === 'resolved') {
      events.push({
        timestamp: new Date(),
        type: 'resolved',
        label: 'Incident resolved',
        description: 'All actions completed',
        icon: '✅',
      });
    }

    return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [incident]);

  if (!incident) return null;

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 18, borderBottom: '1px solid var(--color-outline)' }}>
        <h3 className="t-title" style={{ margin: 0 }}>Incident Timeline</h3>
        <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)' }}>
          Event history ({timeline.length} events)
        </p>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {timeline.length === 0 ? (
          <div style={{ padding: 18, color: 'var(--color-on-surface-variant)' }}>
            No timeline events recorded yet.
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline line */}
            <div
              style={{
                position: 'absolute',
                left: 26,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--color-outline)',
              }}
            />

            {/* Events */}
            {timeline.map((event, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: '12px 18px',
                  position: 'relative',
                  borderBottom: idx < timeline.length - 1 ? '1px solid var(--color-surface-variant)' : 'none',
                }}
              >
                {/* Timeline dot */}
                <div
                  style={{
                    width: 52,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--color-surface)',
                      border: '2px solid var(--color-outline)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {event.icon}
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <p className="t-body-sm" style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>
                      {event.label}
                    </p>
                    <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
                      {formatTime(event.timestamp)}
                    </p>
                  </div>
                  <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)' }}>
                    {event.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
