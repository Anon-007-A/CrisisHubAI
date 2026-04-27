const ROLE_LABELS = {
  fire_team: 'Fire Safety Officer',
  medical: 'Medical First Responder',
  security: 'Security Officer',
  management: 'Management',
  admin: 'Admin',
};

const STATUS_CLASSES = {
  available: 'sev-low',
  responding: 'sev-critical',
  on_duty: 'sev-medium',
  offline: 'sev-medium',
};

export default function ResponderCard({ responder }) {
  const initials = responder.name
    ? responder.name.split(' ').map(word => word[0]).join('')
    : 'R';

  return (
    <div className="panel-card" style={{ padding: 18, borderRadius: 20, background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: responder.status === 'available' ? '#34A853' : responder.status === 'responding' ? '#EA4335' : '#9AA0A6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 700,
          fontSize: '1.1rem',
        }}>
          {initials}
        </div>
        <div>
          <h3 className="t-title" style={{ margin: 0 }}>{responder.name || 'Team responder'}</h3>
          <p className="t-caption" style={{ margin: '6px 0 0' }}>{ROLE_LABELS[responder.role] || responder.role || 'Support'}</p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className={`sev-badge ${STATUS_CLASSES[responder.status] || 'sev-medium'}`} style={{ fontSize: '0.65rem' }}>
            {responder.status?.toUpperCase() || 'UNKNOWN'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="info-callout" style={{ padding: '14px 16px' }}>
          <div>
            <p className="t-label" style={{ margin: 0 }}>Location</p>
            <p className="t-body-sm" style={{ margin: '6px 0 0' }}>{responder.location || 'Unknown'}</p>
          </div>
        </div>
        <div className="info-callout" style={{ padding: '12px 14px' }}>
          <div>
            <p className="t-label" style={{ margin: 0 }}>Assignment</p>
            <p className="t-body-sm" style={{ margin: '6px 0 0' }}>
              {responder.current_incident ? `Incident ${responder.current_incident}` : 'Standby / no active incident'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
