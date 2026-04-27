import { useMemo, useState } from 'react';

export default function AlertBanner({ incidents }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const activeHazards = useMemo(
    () => incidents.filter((incident) => incident.status !== 'resolved' && incident.classification?.evacuation_required),
    [incidents],
  );
  const criticalIncident = activeHazards.find((incident) => incident.classification?.severity === 'critical');

  if (!activeHazards.length) return null;

  const primaryAlert = criticalIncident || activeHazards[0];
  const summary = primaryAlert
    ? `${primaryAlert.classification.summary} in ${primaryAlert.classification.location}.`
    : `${activeHazards.length} active hazards detected.`;
  const guidance = criticalIncident
    ? 'Immediate evacuation is required. Route guests away from Corridor 1F-B and keep staff visible.'
    : 'Keep guests away from the affected area and follow staff directions.';

  if (collapsed) {
    return (
      <button
        type="button"
        className="alert-banner-collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Expand alert banner"
      >
        <span className="blink-dot" />
        <span className="t-mono">{criticalIncident ? 'Critical alert' : 'Active hazards'} ({activeHazards.length})</span>
      </button>
    );
  }

  return (
    <section className={`alert-banner-shell ${criticalIncident ? 'critical' : ''}`}>
      <div className="alert-banner-copy">
        <div className="alert-banner-topline">
          <span className={`status-pill ${criticalIncident ? 'danger' : ''}`}>
            {criticalIncident ? 'Critical alert' : 'Safety alert'}
          </span>
          <span className="t-caption">{activeHazards.length} active hazard{activeHazards.length === 1 ? '' : 's'}</span>
        </div>

        <div className="alert-banner-body">
          <div className="alert-banner-icon">
            <span>{criticalIncident ? '🔥' : '⚠️'}</span>
          </div>
          <div className="alert-banner-text">
            <h4 className="t-title-sm" style={{ margin: 0 }}>
              {criticalIncident ? 'Immediate action required' : 'Attention needed'}
            </h4>
            <p className="alert-banner-summary">{summary}</p>
            <p className="alert-banner-guidance">{guidance}</p>
          </div>
        </div>

        {expanded && (
          <div className="alert-banner-extra">
            <span className="t-caption" style={{ display: 'block', marginBottom: 6 }}>Suggested action</span>
            <p className="t-body-sm" style={{ margin: 0 }}>
              {criticalIncident
                ? 'Evacuate the affected area, reroute guests through the safest unblocked exit, and keep a staff lead at the corridor.'
                : 'Keep guests calm, maintain clear paths, and watch the nearest safe exits.'}
            </p>
          </div>
        )}
      </div>

      <div className="alert-banner-actions">
        <button className="alert-banner-btn" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide details' : 'View details'}
        </button>
        <button className="alert-banner-btn ghost" type="button" onClick={() => setCollapsed(true)}>
          Dismiss
        </button>
      </div>

      {criticalIncident && <div className="alert-banner-progress" aria-hidden="true"><span /></div>}
    </section>
  );
}
