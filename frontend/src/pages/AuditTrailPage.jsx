import { useMemo, useState } from 'react';
import { MOCK_AUDIT_EVENTS } from '../data/mockAuditEvents';
import { useAuditLogs } from '../hooks/useAuditLogs';

// ─── Actor type config ────────────────────────────────────────
const ACTOR_CONFIG = {
  AI:       { color: '#4285F4', label: 'AI Agent',   dot: 'ai' },
  Operator: { color: '#34A853', label: 'Operator',   dot: 'human' },
  System:   { color: '#9AA0A6', label: 'System',     dot: 'system' },
  Sensor:   { color: '#FBBC04', label: 'Sensor',     dot: 'sensor' },
  Guest:    { color: '#FF6D00', label: 'Guest',       dot: 'guest' },
};

const APPROVAL_CONFIG = {
  approved:         { label: 'Approved', color: 'var(--color-success)' },
  recommended:      { label: 'AI Recommended', color: 'var(--color-primary)' },
  pending_approval: { label: 'Pending approval', color: 'var(--color-warning)' },
  rejected:         { label: 'Rejected', color: 'var(--color-danger)' },
};

// ─── Normalise ────────────────────────────────────────────────
function normalizeEvent(ev) {
  const actorType = ev.actorType || (ev.type === 'AUTO' ? 'AI' : 'Operator');
  const cfg = ACTOR_CONFIG[actorType] || ACTOR_CONFIG.System;
  const approval = ev.approvalState || (actorType === 'AI' ? 'recommended' : 'approved');
  return {
    ...ev,
    actorType,
    actorColor: cfg.color,
    dotClass: cfg.dot,
    sourceLabel: actorType === 'AI' ? 'recommended by system' : actorType === 'Operator' ? 'executed by operator' : actorType.toLowerCase(),
    reason: ev.reason || 'Action recorded in audit trail.',
    detail: ev.detail || ev.action || ev.actionLabel || 'Audit event',
    approvalState: approval,
    approvalLabel: APPROVAL_CONFIG[approval]?.label || approval,
    approvalColor: APPROVAL_CONFIG[approval]?.color || 'var(--color-on-surface-dim)',
  };
}

// ─── Event detail drawer ──────────────────────────────────────
function EventDrawer({ event, onClose }) {
  if (!event) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>Audit event detail</h3>
          <button className="drawer-close" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field">
            <span className="t-overline">Event ID</span>
            <span className="t-mono">{event.id}</span>
          </div>
          <div className="drawer-field">
            <span className="t-overline">Timestamp</span>
            <span className="t-body-sm">{new Date(event.timestamp).toLocaleString()}</span>
          </div>
          <div className="drawer-field">
            <span className="t-overline">Actor</span>
            <span className="t-label" style={{ color: event.actorColor }}>{event.actor}</span>
          </div>
          <div className="drawer-field">
            <span className="t-overline">Actor type</span>
            <span className={`audit-dot ${event.dotClass}`} style={{ display: 'inline-block', marginRight: 6 }} />
            <span className="t-body-sm">{event.actorType}</span>
          </div>
          <div className="drawer-field">
            <span className="t-overline">Action</span>
            <span className="t-body" style={{ fontWeight: 500 }}>{event.detail}</span>
          </div>
          <div className="drawer-field">
            <span className="t-overline">Approval state</span>
            <span className="status-pill" style={{ color: event.approvalColor, borderColor: event.approvalColor }}>
              {event.approvalLabel}
            </span>
          </div>
          {event.confidence != null && (
            <div className="drawer-field">
              <span className="t-overline">AI confidence</span>
              <span className="t-label">{event.confidence}%</span>
            </div>
          )}
          {event.incidentId && (
            <div className="drawer-field">
              <span className="t-overline">Linked incident</span>
              <span className="t-mono">{event.incidentId}</span>
            </div>
          )}
          {event.linkedEntityType && (
            <div className="drawer-field">
              <span className="t-overline">Linked entity</span>
              <span className="t-body-sm">{event.linkedEntityType} · {event.linkedEntityId}</span>
            </div>
          )}
          <div className="drawer-reason">
            <span className="t-overline" style={{ display: 'block', marginBottom: 8 }}>Reason / evidence</span>
            <p className="t-body-sm reason-text">{event.reason}</p>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn-tonal btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AuditTrailPage() {
  const [actorFilter, setActorFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState('');

  const { logs: auditLogs, loading, isDemo } = useAuditLogs();

  const events = useMemo(() => {
    const rawEvents = (isDemo ? MOCK_AUDIT_EVENTS : auditLogs) || [];
    return rawEvents.map(normalizeEvent).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [auditLogs, isDemo]);

  const filtered = useMemo(() => events.filter((ev) => {
    if (actorFilter !== 'ALL' && ev.actorType !== actorFilter) return false;
    if (incidentFilter && ev.incidentId !== incidentFilter) return false;
    if (search) {
      const hay = [ev.actor, ev.detail, ev.incidentId, ev.reason, ev.actorType, ev.approvalLabel].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [events, actorFilter, search, incidentFilter]);

  const exportCsv = () => {
    const header = ['Timestamp', 'Actor', 'Actor Type', 'Approval', 'Confidence', 'Incident', 'Action', 'Reason'];
    const rows = filtered.map((ev) => [
      new Date(ev.timestamp).toLocaleString(),
      ev.actor, ev.actorType, ev.approvalLabel,
      ev.confidence ?? '', ev.incidentId || 'system', ev.detail, ev.reason,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'aegis-audit-trail.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'aegis-audit-trail.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const incidentIds = useMemo(() => [...new Set(events.map((e) => e.incidentId).filter(Boolean))], [events]);
  const auditSummary = useMemo(() => {
    const aiEvents = events.filter((event) => event.actorType === 'AI').length;
    const operatorEvents = events.filter((event) => event.actorType === 'Operator').length;
    const coveredIncidents = incidentIds.filter((incidentId) => events.some((event) => event.incidentId === incidentId && event.actorType === 'Operator')).length;

    return [
      { label: 'Total events', value: events.length, detail: 'Immutable entries in the ledger' },
      { label: 'AI recommendations', value: aiEvents, detail: 'System-generated action proposals' },
      { label: 'Operator actions', value: operatorEvents, detail: 'Human-approved response steps' },
      { label: 'Incident coverage', value: `${incidentIds.length ? Math.round((coveredIncidents / incidentIds.length) * 100) : 100}%`, detail: `${coveredIncidents}/${incidentIds.length || 0} incidents with operator proof` },
    ];
  }, [events, incidentIds]);

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <p className="page-kicker">Audit and governance</p>
          <h1 className="page-title">Operational transparency</h1>
          <p className="page-subtitle">
            Immutable record of AI suggestions, operator approvals, and the evidence behind each response.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="status-pill success">
              {isDemo ? 'DEMO LEDGER' : 'LIVE LEDGER'}
            </span>
            <span className="status-pill">Judge-safe proof</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn-tonal btn-sm" onClick={() => setSearch('')}>Clear search</button>
          <button className="btn-tonal btn-sm" onClick={exportJson}>Export JSON</button>
          <button className="btn-filled btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="kpi-bar" style={{ marginBottom: 16 }}>
        {auditSummary.map((metric) => (
          <div key={metric.label} className="metric-card" style={{ textAlign: 'left' }}>
            <span className="t-caption" style={{ fontSize: '0.66rem', letterSpacing: '0.08em' }}>{metric.label}</span>
            <strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{metric.value}</strong>
            <span className="t-caption" style={{ marginTop: 2 }}>{metric.detail}</span>
          </div>
        ))}
      </div>

      {/* Trust model */}
      <div className="panel-card trust-bar">
        <div className="trust-item">
          <div className="audit-dot ai" />
          <div>
            <span className="t-label" style={{ color: '#4285F4' }}>AI Suggestion</span>
            <p className="t-caption">Generated by Gemini and always waiting for human review</p>
          </div>
        </div>
        <div className="trust-item">
          <div className="audit-dot human" />
          <div>
            <span className="t-label" style={{ color: '#34A853' }}>Operator Approval</span>
            <p className="t-caption">Reviewed and executed by a human, tied to a named actor</p>
          </div>
        </div>
        <div className="trust-item">
          <div className="audit-dot system" />
          <div>
            <span className="t-label" style={{ color: '#9AA0A6' }}>System / Sensor</span>
            <p className="t-caption">Telemetry, sensor events, and policy-driven actions</p>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="panel-card" style={{ marginBottom: 16 }}>
        <div className="audit-filter-row">
          <input
            className="form-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, incident, reason…"
          />
          <div className="filter-group">
            <span className="t-caption filter-label">Actor type</span>
            {['ALL', 'AI', 'Operator', 'System', 'Sensor', 'Guest'].map((v) => (
              <button key={v} className={actorFilter === v ? 'btn-filled btn-sm' : 'btn-tonal btn-sm'} onClick={() => setActorFilter(v)}>
                {v}
              </button>
            ))}
          </div>
          <div className="filter-group">
            <span className="t-caption filter-label">Incident</span>
            <button className={incidentFilter === '' ? 'btn-filled btn-sm' : 'btn-tonal btn-sm'} onClick={() => setIncidentFilter('')}>All</button>
            {incidentIds.map((id) => (
              <button key={id} className={incidentFilter === id ? 'btn-filled btn-sm' : 'btn-tonal btn-sm'} onClick={() => setIncidentFilter(id)}>
                {id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="panel-card">
          <div className="section-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Audit timeline</h2>
            <p className="section-subtitle">{filtered.length} events match the current proof set.</p>
          </div>
          <span className="status-pill">Immutable log</span>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="ai-spinner" style={{ margin: '0 auto 16px' }} />
            <h3>Syncing immutable ledger...</h3>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" style={{ fontSize: 40 }}>📋</div>
            <h3>No matching entries</h3>
            <p>Clear filters to return to the full operational record.</p>
          </div>
        ) : (
          <div className="audit-timeline">
            {filtered.map((ev) => (
              <article
                key={ev.id}
                className="audit-timeline-item"
                onClick={() => setSelectedEvent(ev)}
                style={{ cursor: 'pointer' }}
              >
                <div className={`audit-dot ${ev.dotClass}`} />
                <div className="audit-item-content">
                  <div className="audit-row">
                    <strong style={{ color: ev.actorColor }}>{ev.actor}</strong>
                    <span className="status-pill" style={{ color: ev.approvalColor, borderColor: ev.approvalColor }}>
                      {ev.approvalLabel}
                    </span>
                    {ev.confidence != null && (
                      <span className="conf-mini">{ev.confidence}%</span>
                    )}
                    <small>{new Date(ev.timestamp).toLocaleString()}</small>
                  </div>
                  <p className="t-body-sm" style={{ margin: '5px 0 3px', fontWeight: 500 }}>{ev.detail}</p>
                  <p className="t-caption reason-preview">
                    {ev.incidentId ? `Incident: ${ev.incidentId} · ` : ''}
                    {ev.reason?.slice(0, 120)}{ev.reason?.length > 120 ? '…' : ''}
                  </p>
                  <span className="audit-expand-hint">Click to view full detail</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
