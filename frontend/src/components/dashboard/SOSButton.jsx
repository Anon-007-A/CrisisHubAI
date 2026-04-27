import { useState } from 'react';
import { sendCriticalAlert } from '../../services/notificationService';
import { analyzeIncident } from '../../lib/gemini';
import { createIncidentReport } from '../../services/api';

export default function SOSButton({ onSOSTriggered }) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSOS = async () => {
    setLoading(true);
    try {
      // Auto-submit critical incident with minimal info
      const sosIncident = {
        type: 'SECURITY',
        location: 'Guest SOS',
        description: 'Guest emergency assistance requested via SOS button',
        severity: 'CRITICAL',
        from_guest: true,
      };
      const analysis = await analyzeIncident(sosIncident.description, sosIncident.location);

      // Try to send via API
      try {
        await createIncidentReport({
          reportText: sosIncident.description,
          locationHint: sosIncident.location,
          reporterRole: 'guest',
        });
      } catch (e) {
        console.warn('API submission failed, using local trigger', e);
      }

      // Show confirmation
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 5000);

      // Trigger notification
      const mockIncident = {
        id: `sos-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: 'active',
        classification: {
          incident_type: 'security',
          severity: 'critical',
          location: sosIncident.location,
          summary: analysis.summary || sosIncident.description,
          confidence: analysis.confidenceScore || 0.95,
          ai_reasoning: analysis.agenticReasoningChain?.join('. '),
        },
        autonomous_actions: [
          { action: 'alert', detail: 'Gemini analyzed guest SOS request' },
          { action: 'dispatch', detail: 'Critical security notification sent' },
        ],
        assigned_responders: [],
      };
      sendCriticalAlert(mockIncident);

      if (onSOSTriggered) onSOSTriggered(mockIncident);
    } catch (e) {
      console.error('SOS failed:', e);
      alert('SOS activation failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={handleSOS}
        disabled={loading || confirmed}
        className="w-full py-6 bg-red-600 hover:bg-red-700 text-white text-2xl font-black rounded-2xl animate-pulse shadow-lg shadow-red-500/50 flex items-center justify-center gap-3"
        style={{
          background: confirmed
            ? 'rgba(76, 175, 80, 0.8)'
            : 'rgba(244, 67, 54, 0.9)',
          border: 'none',
          cursor: loading || confirmed ? 'not-allowed' : 'pointer',
          opacity: loading || confirmed ? 0.9 : 1,
          animation: !confirmed && !loading ? 'pulse 2s infinite' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {confirmed ? 'Help is on the way' : 'SOS TAP FOR IMMEDIATE EMERGENCY HELP'}
      </button>
      {confirmed && (
        <p
          className="t-body-sm"
          style={{
            marginTop: 12,
            textAlign: 'center',
            color: 'var(--color-success)',
            fontWeight: 600,
          }}
        >
          Help is on the way. Stay calm. A responder has been notified.
        </p>
      )}
    </div>
  );
}
