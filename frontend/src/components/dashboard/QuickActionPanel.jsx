import { useState } from 'react';

export default function QuickActionPanel({ incident, responders = [], onDispatch, onEscalate, onReassign }) {
  const [showAssignmentMenu, setShowAssignmentMenu] = useState(false);
  
  const assignedNames = new Set(incident?.assigned_responders || []);
  const availableResponders = responders.filter(
    r => r.status === 'available' && !assignedNames.has(r.name)
  );

  const handleDispatchResponder = (responder) => {
    if (onDispatch) {
      onDispatch(incident.id, responder);
    }
    setShowAssignmentMenu(false);
  };

  const handleEscalate = () => {
    if (onEscalate) {
      onEscalate(incident.id);
    }
  };

  const handleReassign = (fromName, toResponder) => {
    if (onReassign) {
      onReassign(incident.id, fromName, toResponder);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <button
          className="btn-filled"
          onClick={() => setShowAssignmentMenu(!showAssignmentMenu)}
          disabled={availableResponders.length === 0}
          style={{
            background: availableResponders.length > 0 ? 'var(--color-primary)' : 'var(--color-outline)',
            color: availableResponders.length > 0 ? 'white' : 'var(--color-on-surface-variant)',
          }}
        >
          {availableResponders.length > 0 ? `+ Dispatch (${availableResponders.length})` : 'No responders available'}
        </button>

        {showAssignmentMenu && availableResponders.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-outline)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 200,
            }}
          >
            {availableResponders.map((responder) => (
              <button
                key={responder.id}
                onClick={() => handleDispatchResponder(responder)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                  textAlign: 'left',
                  borderBottom: '1px solid var(--color-surface-variant)',
                }}
                onMouseEnter={(e) => (e.target.style.background = 'var(--color-surface-variant)')}
                onMouseLeave={(e) => (e.target.style.background = 'transparent')}
              >
                <span style={{ fontSize: '1.2rem' }}>👤</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{responder.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                    {responder.role || 'Responder'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn-tonal"
        onClick={handleEscalate}
        style={{
          background: 'rgba(251,188,4,0.12)',
          color: '#FBBC04',
          border: '1px solid rgba(251,188,4,0.3)',
        }}
      >
        🔼 Escalate
      </button>

      {(incident?.assigned_responders?.length || 0) > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            className="btn-tonal"
            onClick={() => setShowAssignmentMenu(!showAssignmentMenu)}
            style={{
              background: 'rgba(66,133,244,0.12)',
              color: '#4285F4',
              border: '1px solid rgba(66,133,244,0.3)',
            }}
          >
            ↔️ Reassign
          </button>

          {showAssignmentMenu && availableResponders.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-outline)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                minWidth: 240,
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-outline)' }}>
                <p className="t-caption" style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>
                  REASSIGN TO
                </p>
              </div>
              {availableResponders.map((responder) => (
                <button
                  key={responder.id}
                  onClick={() => {
                    if (incident.assigned_responders?.length) {
                      handleReassign(incident.assigned_responders[0], responder);
                    }
                    setShowAssignmentMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface)',
                    textAlign: 'left',
                    borderBottom: '1px solid var(--color-surface-variant)',
                  }}
                  onMouseEnter={(e) => (e.target.style.background = 'var(--color-surface-variant)')}
                  onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '1.2rem' }}>👤</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{responder.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                      {responder.role || 'Responder'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
