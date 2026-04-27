import { MOCK_RESPONDERS } from '../../lib/mockData';

export default function ResponderSelector({ currentAssigned, onAssign, responders = MOCK_RESPONDERS }) {
  const availableResponders = responders.filter(
    r => r.status === 'available' && !currentAssigned?.includes(r.name)
  );

  const handleSelect = (responder) => {
    onAssign(responder);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {availableResponders.length > 0 ? (
        <select
          onChange={(e) => {
            const selected = responders.find(r => r.id === e.target.value);
            if (selected) handleSelect(selected);
          }}
          defaultValue=""
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface)',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          <option value="">+ Assign responder...</option>
          {availableResponders.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.role})
            </option>
          ))}
        </select>
      ) : (
        <p className="t-caption" style={{ color: 'var(--color-on-surface-variant)' }}>
          No available responders
        </p>
      )}
    </div>
  );
}
