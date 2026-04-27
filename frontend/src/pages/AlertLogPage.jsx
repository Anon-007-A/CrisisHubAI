import { useMemo, useState } from 'react';
import { useBackendIncidents } from '../hooks/useBackendIncidents';
import { MOCK_ALERTS } from '../data/mockAlerts';

function timeSince(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function minutesSince(timestamp) {
  return Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
}

const SEVERITY = {
  critical: { color: '#EA4335', bg: '#FDE8E6', label: 'Critical' },
  high: { color: '#F97316', bg: '#FEF3E7', label: 'High' },
  medium: { color: '#EAB308', bg: '#FEF7DC', label: 'Medium' },
  low: { color: '#22C55E', bg: '#E6F4EA', label: 'Low' },
};

function SlaTimer({ createdAt, slaMins = 10, status }) {
  const elapsed = minutesSince(createdAt);
  const remaining = slaMins - elapsed;
  const breached = remaining <= 0 && status !== 'resolved';
  const pct = Math.min(100, (elapsed / slaMins) * 100);

  if (status === 'resolved') {
    return <span style={{ color: 'var(--color-success-dark)', fontSize: 12, fontWeight: 700 }}>Resolved</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--color-surface-container)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: breached ? '#EA4335' : pct > 70 ? '#EAB308' : '#22C55E' }} />
      </div>
      <span style={{ color: breached ? '#EA4335' : 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {breached ? `+${Math.abs(remaining)}m` : `${remaining}m left`}
      </span>
    </div>
  );
}

function GuestReportCard({ incident }) {
  const [expanded, setExpanded] = useState(false);
  const cls = incident.classification || {};
  const sev = SEVERITY[cls.severity] || SEVERITY.medium;

  return (
    <article style={{ background: 'var(--color-surface)', border: `1px solid ${sev.color}33`, borderLeft: `4px solid ${sev.color}`, borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-1)' }}>
      {incident.input?.image_data && (
        <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
          <img src={incident.input.image_data} alt="Evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
          <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            Evidence photo
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            Guest report
          </span>
          <span style={{ background: sev.bg, color: sev.color, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            {sev.label}
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--color-on-surface-variant)', fontSize: 12 }}>
            {timeSince(incident.timestamp)}
          </span>
        </div>

        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: 'var(--color-on-surface)' }}>
          {cls.incident_type?.toUpperCase() || 'INCIDENT'} - {cls.location || 'Unknown location'}
        </h3>
        <p style={{ margin: '0 0 14px', color: 'var(--color-on-surface-variant)', fontSize: 13, lineHeight: 1.6 }}>
          {cls.summary || incident.input?.report_text?.slice(0, 150) || 'Processing report'}
        </p>

        {cls.ai_reasoning && (
          <div style={{ background: 'var(--color-surface-dim)', border: '1px solid var(--color-outline-variant)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>AI</span>
              <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>ANALYSIS</span>
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, marginLeft: 'auto' }}>
                Confidence: {Math.round((cls.confidence || 0) * 100)}%
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--color-primary-dark)', fontSize: 13, lineHeight: 1.6 }}>
              {expanded ? cls.ai_reasoning : `${cls.ai_reasoning.slice(0, 150)}${cls.ai_reasoning.length > 150 ? '...' : ''}`}
            </p>
          </div>
        )}

        {cls.evacuation_required && (
          <div style={{ background: 'rgba(234,67,53,0.10)', border: '1px solid rgba(234,67,53,0.20)', borderRadius: 12, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Alert</span>
            <span style={{ color: 'var(--color-danger-dark)', fontWeight: 700, fontSize: 13 }}>Evacuation required. Safe zone: {cls.suggested_safe_zone || 'Assembly point'}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlaTimer createdAt={incident.timestamp} slaMins={cls.severity === 'critical' ? 5 : cls.severity === 'high' ? 10 : 20} status={incident.status} />
          <button
            type="button"
            className="btn-tonal"
            onClick={() => setExpanded((value) => !value)}
            style={{ minWidth: 96, position: 'relative', zIndex: 1 }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>

        {expanded && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--color-outline-variant)', paddingTop: 14, display: 'grid', gap: 10 }}>
            {incident.assigned_responders?.length > 0 && (
              <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12 }}>
                <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Assigned responders</div>
                <div style={{ color: 'var(--color-on-surface)', fontSize: 13 }}>{incident.assigned_responders.join(', ')}</div>
              </div>
            )}

            {incident.autonomous_actions?.length > 0 && (
              <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12 }}>
                <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Autonomous actions</div>
                {incident.autonomous_actions.map((action, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--color-on-surface)', marginTop: index > 0 ? 4 : 0 }}>
                    <span style={{ color: 'var(--color-success-dark)' }}>Done</span>
                    <span>{action.action}: {action.detail}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12 }}>
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Original guest message</div>
              <div style={{ color: 'var(--color-on-surface)', fontSize: 12, fontStyle: 'italic' }}>
                "{incident.input?.report_text}"
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function AlertCard({ alert, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY[alert.severity] || SEVERITY.medium;

  return (
    <article style={{ background: 'var(--color-surface)', border: `1px solid ${sev.color}33`, borderLeft: `4px solid ${sev.color}`, borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-1)' }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-on-surface)' }}>{alert.title}</div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 12, marginTop: 2 }}>
              {alert.sourceLabel} - {timeSince(alert.createdAt)}
            </div>
          </div>
          <span style={{ background: sev.bg, color: sev.color, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            {sev.label}
          </span>
        </div>

        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 13, lineHeight: 1.6, margin: '0 0 12px' }}>
          {alert.description}
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SlaTimer createdAt={alert.createdAt} slaMins={alert.slaTargetMinutes} status={alert.status} />
          <button
            type="button"
            className="btn-tonal"
            onClick={() => onStatusChange(alert.id, 'acknowledged')}
            disabled={alert.status !== 'new'}
          >
            Ack
          </button>
          <button type="button" className="btn-tonal" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Less' : 'More'}
          </button>
        </div>

        {expanded && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--color-outline-variant)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12 }}>
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Status</div>
              <div style={{ color: sev.color, fontWeight: 700, fontSize: 13 }}>{alert.status?.toUpperCase()}</div>
            </div>
            <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12 }}>
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Confidence</div>
              <div style={{ color: 'var(--color-on-surface)', fontWeight: 700, fontSize: 13 }}>{alert.confidence}%</div>
            </div>
            {alert.assignedTo && (
              <div style={{ background: 'var(--color-surface-dim)', borderRadius: 12, padding: 12, gridColumn: '1 / -1' }}>
                <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Assigned to</div>
                <div style={{ color: 'var(--color-on-surface)', fontSize: 13 }}>{alert.assignedTo}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function AlertLogPage() {
  const { incidents } = useBackendIncidents();
  const [mockAlerts, setMockAlerts] = useState(MOCK_ALERTS);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [query, setQuery] = useState('');

  const guestReports = useMemo(
    () => incidents.filter((incident) => incident.input?.reporter_role === 'guest'),
    [incidents],
  );
  const activeGuestReports = useMemo(
    () => guestReports.filter((incident) => incident.status !== 'resolved'),
    [guestReports],
  );

  const visibleAlerts = useMemo(
    () => mockAlerts.filter((alert) => {
      if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
      if (statusFilter === 'active' && alert.status === 'resolved') return false;
      if (statusFilter === 'resolved' && alert.status !== 'resolved') return false;
      if (query) {
        const haystack = [alert.title, alert.description, alert.sourceLabel].join(' ').toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    }),
    [mockAlerts, severityFilter, statusFilter, query],
  );

  const criticalCount = incidents.filter((incident) => incident.classification?.severity === 'critical' && incident.status !== 'resolved').length
    + mockAlerts.filter((alert) => alert.severity === 'critical' && alert.status !== 'resolved').length;

  const stats = [
    { label: 'Critical', value: criticalCount, color: '#EA4335' },
    { label: 'Guest reports', value: guestReports.length, color: '#4285F4' },
    { label: 'Active', value: incidents.filter((incident) => incident.status !== 'resolved').length, color: '#8B5CF6' },
    { label: 'System alerts', value: mockAlerts.filter((alert) => alert.status !== 'resolved').length, color: '#F97316' },
  ];

  const pageStyles = {
    page: {
      minHeight: '100%',
      background: 'linear-gradient(180deg, var(--color-surface-dim) 0%, var(--color-surface) 100%)',
      color: 'var(--color-on-surface)',
    },
    header: {
      padding: '24px 24px 18px',
      borderBottom: '1px solid var(--color-outline-variant)',
      background: 'var(--color-surface)',
    },
    section: {
      padding: '0 24px 24px',
      maxWidth: 1400,
      margin: '0 auto',
      paddingBottom: 40,
    },
    sectionHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '22px 0 14px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: 16,
    },
    pill: (active) => ({
      padding: '6px 14px',
      borderRadius: 999,
      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
      background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
      color: active ? 'var(--color-primary-dark)' : 'var(--color-on-surface-variant)',
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 700,
    }),
  };

  return (
    <div style={pageStyles.page}>
      <header style={pageStyles.header}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="page-kicker">Alert intelligence</div>
              <h1 className="page-title" style={{ marginTop: 4 }}>Alert Intelligence Center</h1>
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                Real-time monitoring, AI-powered triage, and guest reports in one place.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="status-dot-sm" />
              <span style={{ color: 'var(--color-success-dark)', fontSize: 12, fontWeight: 800 }}>LIVE ALERTS</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{ background: 'var(--color-surface)', border: `1px solid ${stat.color}22`, borderRadius: 14, padding: '12px 16px', minWidth: 140 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', fontWeight: 700, marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--color-primary-dark)' }}>G</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Guest-filed reports</h2>
            <p style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)', fontSize: 13 }}>
              Submitted via the guest portal. Showing {activeGuestReports.length} active.
            </p>
          </div>
          {activeGuestReports.length > 0 && (
            <span style={{ marginLeft: 'auto', background: 'rgba(234,67,53,0.12)', border: '1px solid rgba(234,67,53,0.20)', color: 'var(--color-danger-dark)', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {activeGuestReports.length} needs attention
            </span>
          )}
        </div>

        {guestReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--color-surface)', border: '1px dashed var(--color-outline-variant)', borderRadius: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>Inbox</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-on-surface)' }}>No guest reports yet</h3>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: 14 }}>
              Reports submitted from <strong style={{ color: 'var(--color-primary-dark)' }}>/guest</strong> will appear here with AI analysis and attached evidence.
            </p>
          </div>
        ) : (
          <div style={pageStyles.grid}>
            {guestReports.map((incident) => <GuestReportCard key={incident.id} incident={incident} />)}
          </div>
        )}
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#F97316' }}>S</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>System sensor alerts</h2>
            <p style={{ margin: '2px 0 0', color: 'var(--color-on-surface-variant)', fontSize: 13 }}>
              Thermal, CCTV, access control, and environmental sensors.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: 14, padding: '8px 14px', flex: 1, minWidth: 220 }}>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search system alerts..."
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-on-surface)', fontSize: 13, flex: 1 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', 'critical', 'high', 'medium', 'low'].map((severity) => (
              <button key={severity} style={pageStyles.pill(severityFilter === severity)} onClick={() => setSeverityFilter(severity)}>
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: 14, padding: 4 }}>
            {['active', 'resolved'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: statusFilter === status ? 'var(--color-primary)' : 'transparent',
                  color: statusFilter === status ? '#fff' : 'var(--color-on-surface-variant)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {visibleAlerts.length > 0 ? (
          <div style={pageStyles.grid}>
            {visibleAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} onStatusChange={(id, status) => setMockAlerts((current) => current.map((item) => (item.id === id ? { ...item, status } : item)))} />)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--color-surface)', border: '1px dashed var(--color-outline-variant)', borderRadius: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>Shield</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-on-surface)' }}>No system alerts match filters</h3>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: 14 }}>All alerts are resolved or currently filtered out.</p>
          </div>
        )}
      </section>
    </div>
  );
}
