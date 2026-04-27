import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { useResponders } from '../hooks/useResponders';
import { useToast } from '../context/ToastContext';
import { DEMO_INCIDENTS, MOCK_AUDIT_EVENTS, MOCK_RESPONDERS } from '../lib/mockData';
import { calculateRiskScore } from '../utils/incidentRiskScore';
import { analyzeIncident } from '../services/geminiService';
import { assignResponderToIncident, resolveIncident as resolveIncidentApi, acknowledgeIncident as acknowledgeIncidentApi, getApiErrorMessage } from '../services/api';
import IncidentCard from '../components/dashboard/IncidentCard';
import FilterChips from '../components/dashboard/FilterChips';
import SkeletonCard from '../components/dashboard/SkeletonCard';
import LiveMap from '../components/map/LiveMap';
import ResponseMetrics from '../components/dashboard/ResponseMetrics';
import { createBroadcast, fetchActiveBroadcast, fetchBroadcasts, fetchGuestHelpRequests } from '../services/api';

// ─── Scenario Presets ────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'kitchen-fire',
    name: 'Kitchen fire',
    icon: '🔥',
    severity: 'critical',
    incidentIds: ['demo-001'],
    briefing: 'Smoke and heat signatures in the main kitchen. Fire Team dispatched. Corridor 1F-B blocked — route rerouted via Stairwell B.',
  },
  {
    id: 'corridor-smoke',
    name: 'Smoke spread + fire',
    icon: '💨',
    severity: 'critical',
    incidentIds: ['demo-001', 'demo-003'],
    briefing: 'Smoke expanding toward guest corridor. East exit blocked. A* rerouted guests. Human lead verification required.',
  },
  {
    id: 'medical-room',
    name: 'Medical emergency',
    icon: '🏥',
    severity: 'high',
    incidentIds: ['demo-002'],
    briefing: 'Cardiac event in Main Lobby. AED flagged. Medical team dispatched. No venue-wide evacuation needed.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────
function cloneIncident(incident, statusOverride) {
  return {
    ...incident,
    status: statusOverride || incident.status,
    timestamp: new Date().toISOString(),
    autonomous_actions: [...(incident.autonomous_actions || [])],
    assigned_responders: [...(incident.assigned_responders || [])],
    classification: { ...incident.classification },
  };
}

function makeAudit(actor, type, action, incidentId, reason) {
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    actor,
    actorType: type === 'MANUAL' ? 'Operator' : 'System',
    type,
    action,
    detail: action,
    incident_id: incidentId || 'scenario',
    reason: reason || (type === 'MANUAL' ? 'Human operator approved this response action.' : 'System recommendation generated from analysis.'),
    approvalState: type === 'MANUAL' ? 'approved' : 'recommended',
    confidence: type === 'AUTO' ? 85 : null,
  };
}

function formatStatus(s) { return String(s || 'detected').replace(/_/g, ' '); }

function minutesSince(ts) {
  return Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
}

function formatMinutes(value, fallback = 'Pending') {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  if (value <= 0) return '<1m';
  return `${Math.round(value)}m`;
}

function estimateResponderEta(incident, responders) {
  if (!incident || !Array.isArray(responders) || responders.length === 0) return null;
  const responder = responders.find((item) => item.current_incident === incident.id)
    || responders.find((item) => item.status === 'responding')
    || responders.find((item) => item.status === 'available')
    || responders[0];

  if (!responder) return null;
  if (typeof responder.distance_km === 'number') {
    return Math.max(1, Math.round(responder.distance_km * 6));
  }

  return 2;
}

// ─── Priority Board ───────────────────────────────────────────
function PriorityBoard({ incidents, onSelect, selected }) {
  if (!incidents.length) return null;
  const top = incidents.slice(0, 3);
  return (
    <div className="priority-board">
      <div className="priority-board-header">
        <span className="t-overline">Priority queue</span>
        <span className="priority-board-count">{incidents.length} active</span>
      </div>
      {top.map((inc) => {
        const sev = inc.classification?.severity || 'medium';
        const mins = minutesSince(inc.timestamp);
        const isSelected = selected?.id === inc.id;
        return (
          <button
            key={inc.id}
            className={`priority-item ${sev} ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(inc)}
          >
            <div className={`priority-sev-dot sev-${sev}`} />
            <div className="priority-item-body">
              <span className="priority-item-title">{inc.classification?.summary?.slice(0, 60) || inc.id}</span>
              <span className="priority-item-meta">
                {inc.classification?.location || 'Unknown zone'} · {mins}m ago
              </span>
            </div>
            <span className={`sev-pill sev-${sev}`}>{sev}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Live Feed ────────────────────────────────────────────────
function LiveFeed({ auditEntries }) {
  return (
    <div className="live-feed">
      <div className="live-feed-header">
        <span className="t-overline">Live operational feed</span>
        <span className="live-dot-sm" />
      </div>
      <div className="live-feed-entries">
        {auditEntries.slice(0, 5).map((entry) => {
          const isAI = entry.actorType === 'AI' || entry.type === 'AUTO';
          return (
            <div key={entry.id} className={`feed-entry ${isAI ? 'ai' : 'human'}`}>
              <div className={`feed-dot ${isAI ? 'ai' : 'human'}`} />
              <div className="feed-entry-body">
                <span className="feed-entry-text">{entry.detail || entry.action}</span>
                <span className="feed-entry-meta">
                  {isAI ? '◈ AI' : '● Operator'} · {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
const JUDGE_FLOW = [
  {
    id: 'guest',
    title: '1. Guest reports',
    copy: 'Start with the Guest Portal and capture the incident with location context.',
  },
  {
    id: 'ops',
    title: '2. Ops triages',
    copy: 'Show AI analysis, responder guidance, and the operator decision in one place.',
  },
  {
    id: 'twin',
    title: '3. Twin simulates',
    copy: 'Run the twin to compare risk, routes, and responder timing instantly.',
  },
  {
    id: 'audit',
    title: '4. Audit proves it',
    copy: 'Finish with the audit trail that proves the human-approved response.',
  },
];

function DemoWalkthrough() {
  return (
    <div className="panel-card" style={{ marginBottom: 24, border: '1px solid rgba(66,133,244,0.18)', background: 'linear-gradient(135deg, rgba(66,133,244,0.06), rgba(52,168,83,0.05))' }}>
      <div className="section-header" style={{ marginBottom: 14 }}>
        <div>
          <h2>Judge script</h2>
          <p className="section-subtitle">Follow this exact path during the pitch. It keeps the story tight and repeatable.</p>
        </div>
        <span className="status-pill success">Best path</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {JUDGE_FLOW.map((step) => (
          <div
            key={step.id}
            style={{
              border: '1px solid var(--color-outline-variant)',
              borderRadius: 16,
              padding: 14,
              background: 'var(--color-surface)',
              minHeight: 120,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{step.title}</div>
            <p className="t-body-sm" style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
              {step.copy}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoSignal({ label, value, detail }) {
  return (
    <div className="metric-card" style={{ display: 'grid', gap: 4, textAlign: 'left' }}>
      <span className="t-caption" style={{ fontSize: '0.66rem', letterSpacing: '0.08em' }}>{label}</span>
      <strong style={{ fontSize: '1.3rem', lineHeight: 1.1 }}>{value}</strong>
      {detail && <span className="t-caption" style={{ marginTop: 2 }}>{detail}</span>}
    </div>
  );
}

function PresentModeBanner({ onOpenGuest, onOpenTwin, onOpenAudit }) {
  return (
    <div
      className="panel-card"
      style={{
        marginBottom: 20,
        border: '1px solid rgba(66,133,244,0.18)',
        background: 'linear-gradient(135deg, rgba(66,133,244,0.08), rgba(52,168,83,0.06))',
      }}
    >
      <div className="section-header" style={{ marginBottom: 12 }}>
        <div>
          <h2>Presenter mode</h2>
          <p className="section-subtitle">Keep the pitch on the core path: Guest Portal, Ops + Twin, then Audit.</p>
        </div>
        <span className="status-pill success">Best path</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <div className="metric-card" style={{ minHeight: 0 }}>
          <span className="t-caption" style={{ fontSize: '0.66rem', letterSpacing: '0.08em' }}>1. Start here</span>
          <strong style={{ fontSize: '1.05rem' }}>Guest Portal</strong>
          <span>Open the guest report and let the incident enter the system.</span>
          <button className="btn-tonal btn-sm" style={{ marginTop: 8 }} onClick={onOpenGuest}>
            Open guest portal
          </button>
        </div>
        <div className="metric-card" style={{ minHeight: 0 }}>
          <span className="t-caption" style={{ fontSize: '0.66rem', letterSpacing: '0.08em' }}>2. Show next</span>
          <strong style={{ fontSize: '1.05rem' }}>Ops + Twin</strong>
          <span>Explain the recommendation, then run the what-if simulation.</span>
          <button className="btn-tonal btn-sm" style={{ marginTop: 8 }} onClick={onOpenTwin}>
            Open twin
          </button>
        </div>
        <div className="metric-card" style={{ minHeight: 0 }}>
          <span className="t-caption" style={{ fontSize: '0.66rem', letterSpacing: '0.08em' }}>3. Finish strong</span>
          <strong style={{ fontSize: '1.05rem' }}>Audit proof</strong>
          <span>Close with the timeline that proves the operator made the final call.</span>
          <button className="btn-tonal btn-sm" style={{ marginTop: 8 }} onClick={onOpenAudit}>
            Open audit
          </button>
        </div>
      </div>

      <div className="info-callout" style={{ marginTop: 14 }}>
        <span>Judge-safe</span>
        <p className="t-body-sm" style={{ margin: 0 }}>
          Alerts, CCTV, and Team are supporting views. They’re available, but they should not interrupt the main story.
        </p>
      </div>
    </div>
  );
}

export default function OpsDashboard() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const { incidents, loading, isDemo, error, refresh: refreshIncidents } = useIncidents();
  const { responders, refresh: refreshResponders } = useResponders();
  const [localIncidents, setLocalIncidents] = useState([]);
  const [localAudit, setLocalAudit] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [manualOverride, setManualOverride] = useState(true);
  const [notice, setNotice] = useState('');
  const [geminiAnalyses, setGeminiAnalyses] = useState({});
  const [geminiLoading, setGeminiLoading] = useState({});
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [broadcastScope, setBroadcastScope] = useState('venue');
  const [broadcastFloor, setBroadcastFloor] = useState('');
  const [broadcastZone, setBroadcastZone] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [guestAcknowledgements, setGuestAcknowledgements] = useState([]);
  const [broadcastNotice, setBroadcastNotice] = useState('');

  const effectiveIncidents = localIncidents.length > 0 ? localIncidents : incidents;
  const effectiveResponders = responders.length > 0 ? responders : MOCK_RESPONDERS;
  const activeIncidents = effectiveIncidents.filter((i) => i.status !== 'resolved');
  const selected = selectedIncident || activeIncidents[0] || effectiveIncidents[0] || null;
  const geminiAnalysis = geminiAnalyses[selected?.id];
  const geminiRecommendedAction = geminiAnalysis?.recommendedActions?.[0];

  // Gemini analysis on incident selection
  useEffect(() => {
    if (!selected || geminiAnalyses[selected.id]) return;
    setGeminiLoading((c) => ({ ...c, [selected.id]: true }));
    analyzeIncident({
      id: selected.id,
      type: selected.classification?.incident_type || 'UNKNOWN',
      location: selected.classification?.location || 'Unknown',
      severity: selected.classification?.severity || 'MEDIUM',
      description: selected.classification?.summary || '',
      sensorData: selected.sensor_data || null,
    }).then((r) => setGeminiAnalyses((c) => ({ ...c, [selected.id]: r })))
      .finally(() => setGeminiLoading((c) => { const n = { ...c }; delete n[selected.id]; return n; }));
  }, [selected, geminiAnalyses]);

  useEffect(() => {
    const loadBroadcastData = async () => {
      try {
        const [active, feed, help] = await Promise.all([
          fetchActiveBroadcast(),
          fetchBroadcasts({ limit: 5 }),
          fetchGuestHelpRequests({ limit: 10 }),
        ]);
        setActiveBroadcast(active || null);
        setBroadcasts(feed || []);
        setGuestAcknowledgements(help || []);
      } catch (error) {
        console.warn('Failed to load broadcast data:', error);
      }
    };

    loadBroadcastData();
    const interval = setInterval(loadBroadcastData, 12000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const location = selected.classification?.location || 'the venue';
    const recommended = geminiRecommendedAction || 'follow the nearest safe exit and wait for staff directions';
    const guestAnnouncement = selected.classification?.evacuation_required
      ? `Attention guests near ${location}: move calmly toward the nearest safe exit and follow staff guidance.`
      : `Attention guests near ${location}: remain calm and follow staff instructions while we coordinate support.`;
    const draft = [
      selected.classification?.summary || `Incident detected near ${location}.`,
      recommended,
      guestAnnouncement,
    ].filter(Boolean).join(' ');
    setBroadcastDraft(draft);
    setBroadcastTitle(`${selected.classification?.incident_type || 'Incident'} safety notice`);
    setBroadcastScope(selected.classification?.evacuation_required ? 'floor' : 'venue');
    setBroadcastFloor(String(selected.classification?.floor || ''));
    setBroadcastZone('');
  }, [selected, geminiRecommendedAction]);

  const filtered = useMemo(() => {
    const base = filter === 'all' ? activeIncidents : activeIncidents.filter((i) => i.classification?.incident_type === filter);
    return [...base].sort((a, b) =>
      calculateRiskScore(b, effectiveResponders, effectiveIncidents) -
      calculateRiskScore(a, effectiveResponders, effectiveIncidents)
    );
  }, [activeIncidents, effectiveIncidents, effectiveResponders, filter]);

  const countByType = (type) => activeIncidents.filter((i) => i.classification?.incident_type === type).length;
  const severityCounts = useMemo(() => ({
    critical: activeIncidents.filter((i) => i.classification?.severity === 'critical').length,
    high: activeIncidents.filter((i) => i.classification?.severity === 'high').length,
    verifying: activeIncidents.filter((i) => (i.classification?.confidence || 0) < 0.8).length,
    responders: effectiveResponders.filter((r) => r.status === 'responding').length,
  }), [activeIncidents, effectiveResponders]);

  const hazardNodes = activeIncidents
    .filter((i) => i.classification?.evacuation_required)
    .map((i) => ({ node: i.classification.location?.toLowerCase().replace(/ /g, '_'), severity: i.classification.severity }));

  const recentAudit = useMemo(() => {
    const generated = activeIncidents.flatMap((inc) => (inc.autonomous_actions || []).map((entry, idx) => ({
      id: `${inc.id}-${idx}`,
      timestamp: entry.timestamp || inc.timestamp,
      actor: 'AI Agent',
      actorType: 'AI',
      type: 'AUTO',
      detail: typeof entry === 'string' ? entry : entry.detail || entry.action,
      incident_id: inc.id,
      approvalState: 'recommended',
    })));
    return [...localAudit, ...generated, ...MOCK_AUDIT_EVENTS]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 6);
  }, [activeIncidents, localAudit]);

  const setTimedNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4500); };

  const refreshData = () => {
    setLocalIncidents([]);
    refreshIncidents();
    refreshResponders();
    setTimedNotice('Refresh requested. Demo fallback remains active if backend unavailable.');
  };

  const loadScenario = (scenario) => {
    const scenarioIncidents = DEMO_INCIDENTS
      .filter((i) => scenario.incidentIds.includes(i.id))
      .map((i) => cloneIncident(i, i.status === 'resolved' ? 'verified' : i.status));
    setLocalIncidents(scenarioIncidents);
    setSelectedIncident(scenarioIncidents[0] || null);
    setAutomationPaused(false);
    setManualOverride(true);
    setBroadcastDraft('');
    setBroadcastTitle('');
    setBroadcastScope('venue');
    setBroadcastFloor('');
    setBroadcastZone('');
    setBroadcastNotice('');
    setLocalAudit((c) => [makeAudit('Demo Operator', 'MANUAL', `Scenario loaded: ${scenario.name}`, scenarioIncidents[0]?.id, scenario.briefing), ...c]);
    setScenarioPanelOpen(false);
    setTimedNotice(`${scenario.name} loaded. Review AI recommendations and approve actions.`);
  };

  const loadJudgeDemo = () => {
    const judgeScenario = SCENARIOS.find((scenario) => scenario.id === 'corridor-smoke') || SCENARIOS[0];
    setGeminiAnalyses({});
    setGeminiLoading({});
    loadScenario(judgeScenario);
  };

  const updateIncident = async (incidentId, updater, auditAction, reason, apiCall = null) => {
    // Optimistic local update
    setLocalIncidents((c) => {
      const src = c.length > 0 ? c : effectiveIncidents;
      return src.map((i) => i.id === incidentId ? updater(cloneIncident(i)) : i);
    });
    setLocalAudit((c) => [makeAudit('Operator', 'MANUAL', auditAction, incidentId, reason), ...c]);
    toastSuccess(`✓ ${auditAction}`);

    // Send to backend if we're not exclusively in local scenario mode
    if (apiCall) {
      try {
        await apiCall();
      } catch (err) {
        toastError(`⚠ Sync failed: ${getApiErrorMessage(err)}`);
      }
    }
  };

  const acknowledgeIncident = (incidentId) => updateIncident(
    incidentId,
    (i) => ({ ...i, status: 'verified', autonomous_actions: [...(i.autonomous_actions || []), { action: 'verify', detail: 'Operator acknowledged and verified', timestamp: new Date().toISOString() }] }),
    'Operator acknowledged and verified incident',
    'Human-in-the-loop verification recorded before response execution.',
    () => acknowledgeIncidentApi(incidentId)
  );

  const assignResponder = (incidentId, responder) => {
    const name = responder?.name || 'Nearest available';
    const id = responder?.id || 'sys-auto';
    updateIncident(incidentId,
      (i) => ({ ...i, status: 'assigned', assigned_responders: [...new Set([...(i.assigned_responders || []), name])] }),
      `Assigned ${name}`,
      `Manual dispatch. Responder ${name} selected by operator.`,
      () => assignResponderToIncident(incidentId, id)
    );
  };

  const resolveIncident = (incidentId) => updateIncident(
    incidentId,
    (i) => ({ ...i, status: 'resolved', mttm_seconds: i.mttm_seconds || 420 }),
    'Operator resolved incident',
    'Resolution requires human confirmation. Operator confirmed containment before closing.',
    () => resolveIncidentApi(incidentId)
  );

  const escalateToHuman = () => {
    setLocalAudit((c) => [makeAudit('Operator', 'MANUAL', 'Escalated to human lead', selected?.id, 'Senior operations lead requested — venue risk or confidence requires human judgment beyond automated thresholds.'), ...c]);
    setTimedNotice('Human lead escalation recorded in audit trail.');
  };

  const draftBroadcast = async () => {
    if (!selected) return;
    setBroadcastLoading(true);
    try {
      const response = await createBroadcast({
        incident_id: selected.id,
        scope: broadcastScope,
        floor: broadcastFloor ? Number(broadcastFloor) : null,
        zone_id: broadcastZone || null,
        title: broadcastTitle || null,
        message: broadcastDraft || null,
        operator_name: 'Operator',
        incident_type: selected.classification?.incident_type || null,
        location: selected.classification?.location || null,
        recommended_action: geminiRecommendedAction || null,
        guest_announcement: broadcastDraft || null,
        rationale: geminiAnalysis?.summary || selected.classification?.summary || null,
        draft_only: true,
      });
      const draft = response?.draft || response?.broadcast?.draft || response?.draft;
      if (draft?.message) setBroadcastDraft(draft.message);
      if (draft?.title) setBroadcastTitle(draft.title);
      setBroadcastNotice('Draft refreshed from live incident context.');
    } catch (error) {
      setBroadcastNotice(getApiErrorMessage(error, 'Unable to draft broadcast'));
    } finally {
      setBroadcastLoading(false);
    }
  };

  const publishBroadcast = async () => {
    if (!selected || !broadcastDraft.trim()) return;
    setBroadcastLoading(true);
    try {
      const response = await createBroadcast({
        incident_id: selected.id,
        scope: broadcastScope,
        floor: broadcastFloor ? Number(broadcastFloor) : null,
        zone_id: broadcastZone || null,
        title: broadcastTitle || null,
        message: broadcastDraft,
        operator_name: 'Operator',
        incident_type: selected.classification?.incident_type || null,
        location: selected.classification?.location || null,
        recommended_action: geminiRecommendedAction || null,
        guest_announcement: broadcastDraft,
        rationale: geminiAnalysis?.summary || selected.classification?.summary || null,
      });
      const broadcast = response.broadcast;
      setActiveBroadcast(broadcast);
      setBroadcasts((current) => [broadcast, ...current.filter((item) => item.id !== broadcast.id)].slice(0, 5));
      setBroadcastNotice(broadcast?.fallback
        ? 'Broadcast saved locally and shown on the guest portal until the live service reconnects.'
        : 'Broadcast published to the guest portal.');
      setTimedNotice(broadcast?.fallback
        ? 'Guest broadcast cached locally and synced to the guest portal.'
        : 'Guest broadcast published and synced to the live loop.');
    } catch (error) {
      setBroadcastNotice(getApiErrorMessage(error, 'Unable to publish broadcast'));
    } finally {
      setBroadcastLoading(false);
    }
  };

  const unresolvedGuestHelp = guestAcknowledgements.filter((item) => item.status !== 'resolved');
  const guestCounts = guestAcknowledgements.reduce((acc, item) => {
    const key = item.response_type || item.help_type || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const guestByFloor = guestAcknowledgements.reduce((acc, item) => {
    const location = String(item.guest_location || item.guest_zone_id || '').toLowerCase();
    const floorMatch = location.match(/(?:floor[_\s-]?|f)(\d+)/i) || location.match(/(\d)f/i);
    const key = floorMatch ? `Floor ${floorMatch[1]}` : 'Unknown floor';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const guestByZone = guestAcknowledgements.reduce((acc, item) => {
    const key = item.guest_zone_id || item.guest_location || 'Unknown zone';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const selectedAgeMinutes = selected ? minutesSince(selected.timestamp || selected.created_at || Date.now()) : null;
  const responderEtaMinutes = estimateResponderEta(selected, effectiveResponders);

  const operationsSnapshot = useMemo(() => {
    const criticalCount = activeIncidents.filter((incident) => (incident.classification?.severity || incident.severity) === 'critical').length;
    const highCount = activeIncidents.filter((incident) => (incident.classification?.severity || incident.severity) === 'high').length;
    const respondingCount = effectiveResponders.filter((responder) => responder.status === 'responding' || responder.current_incident).length;
    const unresolvedHelpCount = guestAcknowledgements.filter((item) => item.status !== 'resolved').length;
    const broadcastState = activeBroadcast ? `Broadcast live: ${activeBroadcast.scope || 'venue'} scope` : 'No broadcast active';
    const selectedLocation = selected?.classification?.location || selected?.location || 'Select an incident to inspect details';

    return {
      activeCount: activeIncidents.length,
      criticalCount,
      highCount,
      respondingCount,
      unresolvedHelpCount,
      broadcastState,
      selectedLocation,
    };
  }, [activeBroadcast, activeIncidents, effectiveResponders, guestAcknowledgements, selected]);

  const judgeMetrics = useMemo(() => {
    const activeBroadcastAge = activeBroadcast?.timestamp ? minutesSince(activeBroadcast.timestamp) : null;
    const auditCoverage = activeIncidents.length > 0
      ? Math.round((activeIncidents.filter((incident) => recentAudit.some((entry) => entry.incident_id === incident.id)).length / activeIncidents.length) * 100)
      : 100;

    return [
      {
        label: 'Time to acknowledge',
        value: formatMinutes(selectedAgeMinutes),
        detail: selected ? `${selected.classification?.location || 'Selected incident'} under review` : 'No incident selected',
      },
      {
        label: 'Time to broadcast',
        value: activeBroadcastAge != null ? formatMinutes(activeBroadcastAge) : 'Ready',
        detail: activeBroadcast ? `Last sent ${activeBroadcast.scope || 'venue'} notice` : 'Drafted from live incident context',
      },
      {
        label: 'Responder ETA',
        value: responderEtaMinutes != null ? formatMinutes(responderEtaMinutes) : 'Pending',
        detail: selected ? `${effectiveResponders.filter((responder) => responder.current_incident === selected.id).length || 1} responder(s) staged` : 'Waiting on triage',
      },
      {
        label: 'Audit completeness',
        value: `${auditCoverage}%`,
        detail: `${recentAudit.length} entries tied to active incidents`,
      },
    ];
  }, [activeBroadcast, activeIncidents, effectiveResponders, recentAudit, selected, selectedAgeMinutes, responderEtaMinutes]);

  return (
    <div className="page-shell">

      {/* Status bar */}
      <div className="ops-status-bar">
        <div className="ops-status-left">
          <span className="t-overline" style={{ color: 'var(--color-on-surface-dim)' }}>Aegis CrisisHub</span>
          <span className="ops-divider">›</span>
          <span className="t-label">Emergency Operations Command</span>
          <span className="status-pill success" style={{ marginLeft: 8 }}>
            {isDemo ? 'DEMO MODE' : error ? 'OFFLINE FALLBACK' : 'LIVE SYSTEM'}
          </span>
        </div>
        <div className="ops-status-right">
          <button className="btn-ghost btn-sm" onClick={refreshData}>Refresh data</button>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/audit')}>Open audit trail</button>
          <button className="btn-tonal btn-sm" onClick={loadJudgeDemo}>Judge demo</button>
          <button className="btn-tonal btn-sm" onClick={() => setScenarioPanelOpen((v) => !v)}>
            {scenarioPanelOpen ? 'Close scenarios' : 'Load scenario'}
          </button>
          <button className="btn-tonal btn-sm" style={{ color: 'var(--color-primary)' }} onClick={() => window.print()}>
            Command snapshot
          </button>
          <button className="btn-filled btn-sm" onClick={() => navigate('/guest')}>Open guest portal</button>
        </div>
      </div>

      <section className="ops-hero panel-card">
        <div className="ops-hero-copy">
          <span className="page-kicker">Operations</span>
          <h1 className="page-title">Command center for triage, broadcasts, and responder coordination</h1>
          <p className="ops-hero-text">
            Keep the incident story, guest messaging, and live map in one place so operators can move from detection to action without losing context.
          </p>
          <div className="ops-hero-actions">
            <button className="btn-filled btn-sm" onClick={() => navigate('/guest')}>Open guest portal</button>
            <button className="btn-tonal btn-sm" onClick={() => navigate('/twin')}>Run twin</button>
            <button className="btn-ghost btn-sm" onClick={() => navigate('/audit')}>Review audit</button>
          </div>
        </div>
        <div className="ops-hero-grid">
          <div className="ops-hero-stat">
            <span className="t-overline">Active incidents</span>
            <strong>{operationsSnapshot.activeCount}</strong>
            <small>{operationsSnapshot.criticalCount} critical, {operationsSnapshot.highCount} high severity</small>
          </div>
          <div className="ops-hero-stat">
            <span className="t-overline">Response posture</span>
            <strong>{operationsSnapshot.respondingCount}</strong>
            <small>Responders currently engaged</small>
          </div>
          <div className="ops-hero-stat">
            <span className="t-overline">Guest status</span>
            <strong>{operationsSnapshot.unresolvedHelpCount}</strong>
            <small>Guest help requests still unresolved</small>
          </div>
          <div className="ops-hero-stat hero-wide">
            <span className="t-overline">Current focus</span>
            <strong>{selected ? selected.classification?.summary?.slice(0, 72) || selected.id : 'No incident selected'}</strong>
            <small>{operationsSnapshot.selectedLocation}</small>
          </div>
        </div>
      </section>

      <PresentModeBanner
        onOpenGuest={() => navigate('/guest')}
        onOpenTwin={() => navigate('/twin')}
        onOpenAudit={() => navigate('/audit')}
      />

      <DemoWalkthrough />

      {/* Scenario panel (collapsible) */}
      {scenarioPanelOpen && (
        <div className="scenario-panel panel-card">
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <h2>Scenario presets</h2>
              <p className="section-subtitle">Load a realistic incident for review and demo.</p>
            </div>
            <span className="status-pill">Demo mode</span>
          </div>
          <div className="scenarios-grid">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={`scenario-btn scenario-${s.severity}`} onClick={() => loadScenario(s)}>
                <div className="scenario-btn-header">
                  <span className="scenario-icon">{s.icon}</span>
                  <strong>{s.name}</strong>
                  <span className={`sev-badge sev-${s.severity}`}>{s.severity}</span>
                </div>
                <small>{s.briefing}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notice / error banner */}
      {(notice || error) && (
        <div className={`alert-banner ${error && !notice ? 'error' : ''}`}>
          <span>{notice || error}</span>
        </div>
      )}

      {/* Judge KPI strip */}
      <div className="kpi-bar" style={{ marginBottom: 20 }}>
        {judgeMetrics.map((metric) => (
          <DemoSignal key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
        ))}
      </div>

      {/* KPI bar */}
      <div className="kpi-bar" style={{ display: 'none' }}>
        <div className="metric-card" title="Active unresolved incidents">
          <strong>{activeIncidents.length}</strong>
          <span>Active incidents</span>
        </div>
        <div className="metric-card" title="Critical severity incidents">
          <strong style={{ color: 'var(--color-danger)' }}>{severityCounts.critical}</strong>
          <span>Critical</span>
        </div>
        <div className="metric-card" title="Confidence below 80% — needs verification">
          <strong style={{ color: 'var(--color-warning)' }}>{severityCounts.verifying}</strong>
          <span>Needs verification</span>
        </div>
        <div className="metric-card" title="Responders currently responding">
          <strong style={{ color: 'var(--color-primary)' }}>{severityCounts.responders}</strong>
          <span>Responding</span>
        </div>
        <div className="metric-card" title="Human-in-the-loop AI guardrail">
          <strong style={{ color: manualOverride ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {manualOverride ? 'Active' : 'Off'}
          </strong>
          <span>Manual override</span>
        </div>
      </div>

      {/* Control panel */}
      <div className="control-panel">
        <div className="control-group">
          <button className={manualOverride ? 'btn-tonal btn-sm active-control' : 'btn-tonal btn-sm'} onClick={() => setManualOverride((v) => !v)}>
            Override: {manualOverride ? 'On' : 'Off'}
          </button>
          <button className={automationPaused ? 'btn-tonal btn-sm active-control' : 'btn-tonal btn-sm'} onClick={() => setAutomationPaused((v) => !v)}>
            Automation: {automationPaused ? 'Paused' : 'Active'}
          </button>
          <button className="btn-tonal btn-sm" onClick={escalateToHuman}>Escalate to human lead</button>
          {selected && (
            <button className="btn-tonal btn-sm" onClick={() => acknowledgeIncident(selected.id)}>
              Acknowledge selected
            </button>
          )}
        </div>
      </div>

      <div className="panel-card" style={{ marginBottom: 24 }}>
        <div className="section-header" style={{ marginBottom: 14 }}>
          <div>
            <h2>Broadcast center</h2>
            <p className="section-subtitle">Draft the guest notice from live incident context, then approve it for delivery.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {activeBroadcast && <span className="status-pill success">Live broadcast active</span>}
            <button className="btn-ghost btn-sm" onClick={() => navigate('/twin')}>Open twin</button>
          </div>
        </div>

        <div className="broadcast-grid">
          <div className="broadcast-column">
            <div className="broadcast-scope-row">
              {['venue', 'floor', 'zone'].map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className={`scenario-tag ${broadcastScope === scope ? 'active' : ''}`}
                  onClick={() => setBroadcastScope(scope)}
                >
                  {scope === 'venue' ? 'Venue-wide' : scope === 'floor' ? 'Floor notice' : 'Zone notice'}
                </button>
              ))}
            </div>
            <div className="broadcast-fields">
              <label className="broadcast-field">
                <span>Headline</span>
                <input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} placeholder="Guest safety notice" />
              </label>
              {broadcastScope === 'floor' && (
                <label className="broadcast-field">
                  <span>Floor</span>
                  <input value={broadcastFloor} onChange={(event) => setBroadcastFloor(event.target.value)} placeholder="1" />
                </label>
              )}
              {broadcastScope === 'zone' && (
                <label className="broadcast-field">
                  <span>Zone ID</span>
                  <input value={broadcastZone} onChange={(event) => setBroadcastZone(event.target.value)} placeholder="corridor_1f_b" />
                </label>
              )}
            </div>
            <label className="broadcast-field" style={{ marginTop: 12 }}>
              <span>Guest message</span>
              <textarea
                rows={5}
                value={broadcastDraft}
                onChange={(event) => setBroadcastDraft(event.target.value)}
                placeholder="Draft the guest safety announcement here"
              />
            </label>
            <div className="broadcast-actions">
              <button className="btn-tonal btn-sm" onClick={draftBroadcast} disabled={broadcastLoading}>Draft from incident</button>
              <button className="btn-filled btn-sm" onClick={publishBroadcast} disabled={broadcastLoading || !broadcastDraft.trim()}>Publish broadcast</button>
            </div>
            {broadcastNotice && <div className="broadcast-note">{broadcastNotice}</div>}
          </div>

          <div className="broadcast-column broadcast-summary">
            <div className="broadcast-summary-card">
              <span className="t-overline">Guest acknowledgements</span>
              <strong>{guestAcknowledgements.length}</strong>
              <span>{unresolvedGuestHelp.length} unresolved guest requests</span>
              <small className="t-caption">{Object.entries(guestByFloor).slice(0, 2).map(([floor, count]) => `${floor}: ${count}`).join(' · ')}</small>
            </div>
            <div className="broadcast-summary-card">
              <span className="t-overline">Response mix</span>
              <strong>{guestCounts.safe || 0} safe</strong>
              <span>{guestCounts.need_help || 0} need help · {guestCounts.trapped || 0} trapped</span>
              <small className="t-caption">{Object.entries(guestByZone).slice(0, 2).map(([zone, count]) => `${String(zone).replace(/_/g, ' ')}: ${count}`).join(' · ')}</small>
            </div>
            <div className="broadcast-replay">
              <div className="broadcast-replay-header">
                <span className="t-label">Broadcast replay</span>
                <span className="status-pill">{broadcasts.length} recent</span>
              </div>
              {broadcasts.length === 0 ? (
                <div className="empty-state" style={{ padding: 16, margin: 0 }}>
                  <p className="t-body-sm">No broadcast history yet. Publish one from the incident console or twin.</p>
                </div>
              ) : (
                broadcasts.map((broadcast) => (
                  <div key={broadcast.id} className="broadcast-replay-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <strong>{broadcast.title || 'Guest safety notice'}</strong>
                        <div className="t-caption">{broadcast.scope} · {new Date(broadcast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className="sev-badge sev-low">{broadcast.scope}</span>
                    </div>
                    <p className="broadcast-replay-text">{broadcast.message}</p>
                    <div className="broadcast-replay-meta">
                      <span>Safe {broadcast.ack_counts?.safe || 0}</span>
                      <span>Help {broadcast.ack_counts?.need_help || 0}</span>
                      <span>Trapped {broadcast.ack_counts?.trapped || 0}</span>
                    </div>
                    {broadcast.latest_ack && (
                      <div className="broadcast-replay-latest">
                        Latest: {broadcast.latest_ack.message || broadcast.latest_ack.response_type}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="dashboard-grid ops-layout">
        <div className="main-content">

          {/* Priority board */}
          <PriorityBoard incidents={filtered} onSelect={setSelectedIncident} selected={selected} />

          {/* Incident console */}
          <div className="panel-card">
            <div className="section-header">
              <div>
                <h2>Incident console</h2>
                <p className="section-subtitle">Severity, zone, SLA, assignment, and AI-recommended actions.</p>
              </div>
              <FilterChips filter={filter} setFilter={setFilter} countByType={countByType} />
            </div>
            {loading ? (
              <SkeletonCard count={3} />
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" style={{ fontSize: 40 }}>✓</div>
                <h3>All incidents resolved</h3>
                <p>Monitoring active. Load a scenario to review detection, routing, approvals, and audit.</p>
              </div>
            ) : (
              <div className="incidents-list">
                {filtered.map((inc) => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    responders={effectiveResponders}
                    allIncidents={effectiveIncidents}
                    isSelected={selected?.id === inc.id}
                    onSelect={setSelectedIncident}
                    onAssignResponder={assignResponder}
                    onResolve={resolveIncident}
                    automationPaused={automationPaused}
                    manualOverride={manualOverride}
                  />
                ))}
              </div>
            )}
          </div>

          {/* AI reasoning panel */}
          {selected && (
            <div className="panel-card">
              <div className="section-header">
                <div>
                  <h2>AI recommendation</h2>
                  <p className="section-subtitle">Gemini 2.5 Flash analysis · explainable reasoning chain</p>
                </div>
                <span className="status-pill">{formatStatus(selected.status)}</span>
              </div>
              <div className="ai-panel">
                {geminiLoading[selected.id] ? (
                  <div className="ai-panel-loading">
                    <div className="ai-spinner" />
                    <span className="t-body-sm">Gemini 2.5 Flash is analyzing this incident…</span>
                  </div>
                ) : geminiAnalysis ? (
                  <div className="ai-analysis">
                    <p className="t-body" style={{ marginBottom: 12, fontWeight: 500 }}>{geminiAnalysis.summary}</p>
                    <div className={`confidence-badge conf-${geminiAnalysis.confidence >= 85 ? 'high' : geminiAnalysis.confidence >= 70 ? 'mid' : 'low'}`}>
                      <span className="conf-dot" />
                      <span>Confidence: {Math.round(geminiAnalysis.confidence)}%</span>
                      {geminiAnalysis.escalate && <span className="escalate-badge">⚑ Escalate to human</span>}
                    </div>
                    <div className="ai-reasoning-section">
                      <p className="t-label" style={{ marginBottom: 8 }}>Reasoning chain</p>
                      <ol className="reasoning-list">
                        {(geminiAnalysis.reasoning || []).slice(0, 4).map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="ai-actions-section">
                      <p className="t-label" style={{ marginBottom: 8 }}>Recommended action</p>
                      <p className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {geminiAnalysis.recommendedActions?.[0] || 'Dispatch nearest available responder and monitor escalation.'}
                      </p>
                    </div>
                    <div className="ai-disclaimer">
                      ◈ AI recommendation only — execution requires operator approval
                    </div>
                  </div>
                ) : (
                  <div className="ai-panel-empty">
                    <p className="t-label">Select an incident to view AI analysis</p>
                    <p className="t-body-sm">Gemini 2.5 Flash generates explainable reasoning, confidence scores, and recommended actions for each incident.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Live feed */}
          <div className="panel-card">
            <div className="section-header">
              <div>
                <h2>Recent audit entries</h2>
                <p className="section-subtitle">AI recommendations are separated from operator-executed actions.</p>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => navigate('/audit')}>Full audit trail</button>
            </div>
            <LiveFeed auditEntries={recentAudit} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar sidebar-sticky">
          <div className="panel-card ops-map-card" style={{ padding: 0, minHeight: 320, overflow: 'hidden' }}>
            <div className="ops-map-header">
              <div>
                <span className="t-overline">Live map</span>
                <h2>Venue situational view</h2>
              </div>
              <span className="status-pill success">Synced live</span>
            </div>
            <LiveMap
              incidents={activeIncidents}
              responders={effectiveResponders}
              hazardNodes={hazardNodes}
              selectedIncident={selected}
              onSelectIncident={setSelectedIncident}
              showResponderRoutes
              showHazardLabels
            />
          </div>
          <ResponseMetrics incidents={effectiveIncidents} responders={effectiveResponders} />
          <div className="panel-card ops-quick-actions">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div>
                <h2>Quick actions</h2>
                <p className="section-subtitle">One-click controls for the most common operator tasks.</p>
              </div>
            </div>
            <div className="quick-actions-grid">
              <button className="quick-action-btn" onClick={() => selected && resolveIncident(selected.id)} disabled={!selected}>
                <span>✓</span>Mark resolved
              </button>
              <button className="quick-action-btn warning" onClick={escalateToHuman}>
                <span>⚑</span>Escalate
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/twin')}>
                <span>✦</span>What-if twin
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/map')}>
                <span>🗺</span>Open map
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/team')}>
                <span>👥</span>Team view
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
